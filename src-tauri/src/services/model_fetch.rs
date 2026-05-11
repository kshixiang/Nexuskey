//! 模型列表获取服务
//!
//! 通过 OpenAI 兼容的 GET /v1/models 端点获取供应商可用模型列表。
//! 主要面向第三方聚合站（硅基流动、OpenRouter 等），以及把 Anthropic
//! 协议挂在兼容子路径上的官方供应商（DeepSeek、Kimi、智谱 GLM 等）。

use crate::services::provider::normalize_legacy_nexuskey_gateway_url;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// 获取到的模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModel {
    pub id: String,
    pub owned_by: Option<String>,
}

const FETCH_TIMEOUT_SECS: u64 = 15;

/// 404/405 响应体截断长度：避免把几十 KB HTML 404 页整页保留到错误串里。
const ERROR_BODY_MAX_CHARS: usize = 512;

/// 从 JSON 解析模型列表：OpenAI `{ data: [...] }`、字符串数组、`data` 为 id→对象映射等。
fn parse_models_from_json_value(value: &serde_json::Value) -> Option<Vec<FetchedModel>> {
    if let Some(arr) = value.get("data").and_then(|v| v.as_array()) {
        if arr.is_empty() {
            return Some(vec![]);
        }
        let mut out = Vec::new();
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                let owned_by = item.get("owned_by").and_then(|v| v.as_str()).map(String::from);
                out.push(FetchedModel {
                    id: id.to_string(),
                    owned_by,
                });
            } else if let Some(s) = item.as_str() {
                out.push(FetchedModel {
                    id: s.to_string(),
                    owned_by: None,
                });
            }
        }
        if !out.is_empty() {
            return Some(out);
        }
    }

    if let Some(obj) = value.get("data").and_then(|v| v.as_object()) {
        if obj.is_empty() {
            return None;
        }
        let all_values_are_objects = obj.values().all(|v| v.is_object());
        if all_values_are_objects {
            let mut ids: Vec<String> = obj.keys().cloned().collect();
            ids.sort();
            return Some(
                ids
                    .into_iter()
                    .map(|id| FetchedModel {
                        id,
                        owned_by: None,
                    })
                    .collect(),
            );
        }
    }

    None
}

fn parse_models_response_bytes(bytes: &[u8]) -> Result<Vec<FetchedModel>, String> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| format!("invalid JSON: {e}"))?;
    parse_models_from_json_value(&value).ok_or_else(|| {
        let prefix = String::from_utf8_lossy(bytes);
        let snippet: String = prefix.chars().take(ERROR_BODY_MAX_CHARS).collect();
        format!("unknown models JSON shape (prefix): {snippet}")
    })
}

/// 已知的「Anthropic / Claude 协议兼容子路径」后缀；按长度降序，最长前缀优先匹配。
/// baseURL 命中时先尝试剥离后的网关根 `/v1/models`（聚合列表常为 OpenAI JSON），再尝试带子路径的 URL。
const KNOWN_COMPAT_SUFFIXES: &[&str] = &[
    "/api/claudecode",
    "/api/anthropic",
    "/apps/anthropic",
    "/api/coding",
    "/claudecode",
    "/anthropic",
    "/step_plan",
    "/coding",
    "/claude",
];

/// 获取供应商的可用模型列表
///
/// 使用 OpenAI 兼容的 GET /v1/models 端点，按候选列表顺序尝试。
pub async fn fetch_models(
    base_url: &str,
    api_key: &str,
    is_full_url: bool,
    models_url_override: Option<&str>,
) -> Result<Vec<FetchedModel>, String> {
    if api_key.is_empty() {
        return Err("API Key is required to fetch models".to_string());
    }

    // 仅做旧域名迁移；勿使用 Claude 专用的 `/claude` 路径折叠（会破坏 Codex `…/codex/v1` 等）。
    let base_url = normalize_legacy_nexuskey_gateway_url(base_url);
    let models_url_override = models_url_override.map(normalize_legacy_nexuskey_gateway_url);
    let candidates = build_models_url_candidates(
        &base_url,
        is_full_url,
        models_url_override.as_deref(),
    )?;
    log::info!(
        "[ModelFetch] request base_url={} is_full_url={} candidates={}",
        base_url.trim(),
        is_full_url,
        candidates.len()
    );
    let client = crate::proxy::http_client::get();
    let mut last_err: Option<String> = None;

    for url in &candidates {
        log::info!("[ModelFetch] try GET {url}");
        let response = match client
            .get(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                // 与 404 类似：首个候选（如 …/claude/v1/models）可能根本不可达，
                // 继续尝试剥离兼容子路径后的根域名 /v1/models。
                log::warn!("[ModelFetch] try GET {url} transport error: {e}");
                last_err = Some(format!("Request failed for {url}: {e}"));
                continue;
            }
        };

        let status = response.status();

        if status.is_success() {
            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("read body: {e}"))?;
            match parse_models_response_bytes(&bytes) {
                Ok(mut models) => {
                    models.sort_by(|a, b| a.id.cmp(&b.id));
                    log::info!(
                        "[ModelFetch] success count={} url={}",
                        models.len(),
                        url
                    );
                    return Ok(models);
                }
                Err(e) => {
                    log::warn!(
                        "[ModelFetch] parse failed for {url}: {e}"
                    );
                    last_err = Some(format!("{url}: {e}"));
                    continue;
                }
            }
        }

        if status == StatusCode::NOT_FOUND || status == StatusCode::METHOD_NOT_ALLOWED {
            let body = truncate_body(response.text().await.unwrap_or_default());
            last_err = Some(format!("HTTP {status}: {body}"));
            continue;
        }

        let body = truncate_body(response.text().await.unwrap_or_default());
        let err = format!("HTTP {status}: {body}");
        log::warn!("[ModelFetch] try GET {url} -> {err}");
        return Err(err);
    }

    let err = format!(
        "All candidates failed: {}",
        last_err.unwrap_or_else(|| "no candidates".to_string())
    );
    log::warn!("[ModelFetch] {err}");
    Err(err)
}

/// 构造「模型列表端点」的候选 URL 列表
///
/// 候选顺序（无 override 时）：
/// 1. 若 baseURL 命中 [`KNOWN_COMPAT_SUFFIXES`]：先 `strip/v1/models`、`strip/models`，再 `base/v1/models`
///    （NewAPI 等网关根上的列表常为 OpenAI JSON；`/claude/v1/models` 可能返回非列表形态）
/// 2. 无兼容后缀：仅 `base/v1/models`（或已以 `/v1` 结尾则 `base/models`）
///
/// 结果已去重且保持首次出现顺序。
pub fn build_models_url_candidates(
    base_url: &str,
    is_full_url: bool,
    models_url_override: Option<&str>,
) -> Result<Vec<String>, String> {
    if let Some(raw) = models_url_override {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Ok(vec![trimmed.to_string()]);
        }
    }

    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL is empty".to_string());
    }

    let mut candidates: Vec<String> = Vec::new();

    if is_full_url {
        if let Some(idx) = trimmed.find("/v1/") {
            candidates.push(format!("{}/v1/models", &trimmed[..idx]));
        } else if let Some(idx) = trimmed.rfind('/') {
            let root = &trimmed[..idx];
            if root.contains("://") && root.len() > root.find("://").unwrap() + 3 {
                candidates.push(format!("{root}/v1/models"));
            }
        }
        if candidates.is_empty() {
            return Err("Cannot derive models endpoint from full URL".to_string());
        }
        return Ok(candidates);
    }

    let primary = if trimmed.ends_with("/v1") {
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    };

    if let Some(stripped) = strip_compat_suffix(trimmed) {
        let root = stripped.trim_end_matches('/');
        if !root.is_empty() && root.contains("://") {
            candidates.push(format!("{root}/v1/models"));
            candidates.push(format!("{root}/models"));
        }
    }
    candidates.push(primary);

    // 候选最多 3 条，线性去重即可，不值得上 HashSet。
    let mut unique: Vec<String> = Vec::with_capacity(candidates.len());
    for url in candidates {
        if !unique.iter().any(|u| u == &url) {
            unique.push(url);
        }
    }

    Ok(unique)
}

/// 截断响应体到 [`ERROR_BODY_MAX_CHARS`] 字符，避免 HTML 404 页占用错误串。
fn truncate_body(body: String) -> String {
    if body.chars().count() <= ERROR_BODY_MAX_CHARS {
        body
    } else {
        let mut s: String = body.chars().take(ERROR_BODY_MAX_CHARS).collect();
        s.push('…');
        s
    }
}

/// 若 baseURL 以任一已知兼容子路径结尾，返回剥离后的剩余部分；否则 `None`。
///
/// 依赖 [`KNOWN_COMPAT_SUFFIXES`] 按长度降序排列，确保最长前缀优先命中
/// （否则 `/anthropic` 会提前匹配掉 `/api/anthropic` 的场景）。
fn strip_compat_suffix(base_url: &str) -> Option<&str> {
    for suffix in KNOWN_COMPAT_SUFFIXES {
        if base_url.ends_with(*suffix) {
            return Some(&base_url[..base_url.len() - suffix.len()]);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::provider::normalize_legacy_nexuskey_gateway_url;

    #[test]
    fn legacy_api_nexuskey_host_maps_for_model_fetch_candidates() {
        let base = normalize_legacy_nexuskey_gateway_url("https://api.nexuskey.ai/claude");
        assert_eq!(base, "https://nexuskey.eu.cc/claude");
        let c = build_models_url_candidates(&base, false, None).unwrap();
        assert!(c.iter().all(|url| url.contains("nexuskey.eu.cc")));
        assert!(!c.iter().any(|url| url.contains("api.nexuskey.ai")));
    }

    #[test]
    fn nexuskey_codex_base_url_path_preserved_after_legacy_host_migration() {
        let base = normalize_legacy_nexuskey_gateway_url("https://api.nexuskey.ai/codex/v1");
        assert_eq!(base.as_str(), "https://nexuskey.eu.cc/codex/v1");
        assert!(
            base.contains("/codex/"),
            "Codex OpenAI base must keep /codex/v1 path"
        );
    }

    #[test]
    fn test_candidates_plain_root() {
        let c = build_models_url_candidates("https://api.siliconflow.cn", false, None).unwrap();
        assert_eq!(c, vec!["https://api.siliconflow.cn/v1/models"]);
    }

    #[test]
    fn test_candidates_trailing_slash() {
        let c = build_models_url_candidates("https://api.example.com/", false, None).unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/models"]);
    }

    #[test]
    fn test_candidates_with_v1() {
        let c = build_models_url_candidates("https://api.example.com/v1", false, None).unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/models"]);
    }

    #[test]
    fn test_candidates_full_url() {
        let c = build_models_url_candidates(
            "https://proxy.example.com/v1/chat/completions",
            true,
            None,
        )
        .unwrap();
        assert_eq!(c, vec!["https://proxy.example.com/v1/models"]);
    }

    #[test]
    fn test_candidates_empty() {
        assert!(build_models_url_candidates("", false, None).is_err());
    }

    #[test]
    fn test_candidates_override_returns_single() {
        let c = build_models_url_candidates(
            "https://api.deepseek.com/anthropic",
            false,
            Some("https://api.deepseek.com/models"),
        )
        .unwrap();
        assert_eq!(c, vec!["https://api.deepseek.com/models"]);
    }

    #[test]
    fn test_candidates_override_empty_falls_through() {
        let c =
            build_models_url_candidates("https://api.siliconflow.cn", false, Some("   ")).unwrap();
        assert_eq!(c, vec!["https://api.siliconflow.cn/v1/models"]);
    }

    #[test]
    fn test_candidates_deepseek_strip_anthropic() {
        let c =
            build_models_url_candidates("https://api.deepseek.com/anthropic", false, None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.deepseek.com/v1/models",
                "https://api.deepseek.com/models",
                "https://api.deepseek.com/anthropic/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_zhipu_strip_api_anthropic() {
        let c = build_models_url_candidates("https://open.bigmodel.cn/api/anthropic", false, None)
            .unwrap();
        assert_eq!(
            c,
            vec![
                "https://open.bigmodel.cn/v1/models",
                "https://open.bigmodel.cn/models",
                "https://open.bigmodel.cn/api/anthropic/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_bailian_strip_apps_anthropic() {
        let c = build_models_url_candidates(
            "https://dashscope.aliyuncs.com/apps/anthropic",
            false,
            None,
        )
        .unwrap();
        assert_eq!(
            c,
            vec![
                "https://dashscope.aliyuncs.com/v1/models",
                "https://dashscope.aliyuncs.com/models",
                "https://dashscope.aliyuncs.com/apps/anthropic/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_stepfun_strip_step_plan() {
        let c =
            build_models_url_candidates("https://api.stepfun.com/step_plan", false, None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.stepfun.com/v1/models",
                "https://api.stepfun.com/models",
                "https://api.stepfun.com/step_plan/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_doubao_strip_api_coding() {
        let c = build_models_url_candidates(
            "https://ark.cn-beijing.volces.com/api/coding",
            false,
            None,
        )
        .unwrap();
        assert_eq!(
            c,
            vec![
                "https://ark.cn-beijing.volces.com/v1/models",
                "https://ark.cn-beijing.volces.com/models",
                "https://ark.cn-beijing.volces.com/api/coding/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_rightcode_strip_claude() {
        let c = build_models_url_candidates("https://www.right.codes/claude", false, None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://www.right.codes/v1/models",
                "https://www.right.codes/models",
                "https://www.right.codes/claude/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_longer_suffix_wins() {
        // baseURL 以 /api/anthropic 结尾时，应剥离整个 /api/anthropic，
        // 而不是只剥离 /anthropic（那样会得到残缺的 https://.../api 根）。
        let c = build_models_url_candidates("https://api.z.ai/api/anthropic", false, None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.z.ai/v1/models",
                "https://api.z.ai/models",
                "https://api.z.ai/api/anthropic/v1/models",
            ]
        );
    }

    #[test]
    fn test_candidates_no_suffix_no_strip() {
        let c = build_models_url_candidates("https://openrouter.ai/api", false, None).unwrap();
        assert_eq!(c, vec!["https://openrouter.ai/api/v1/models"]);
    }

    #[test]
    fn test_candidates_deduplicate() {
        // 虚构 case：baseURL 就是 "scheme://host"，剥不出子路径，应只有一个候选。
        let c = build_models_url_candidates("https://host.example.com", false, None).unwrap();
        assert_eq!(c.len(), 1);
    }

    #[test]
    fn test_parse_response() {
        let json = r#"{"object":"list","data":[{"id":"gpt-4","object":"model","owned_by":"openai"},{"id":"claude-3-sonnet","object":"model","owned_by":"anthropic"}]}"#;
        let data = parse_models_response_bytes(json.as_bytes()).unwrap();
        assert_eq!(data.len(), 2);
        assert_eq!(data[0].id, "gpt-4");
        assert_eq!(data[0].owned_by.as_deref(), Some("openai"));
        assert_eq!(data[1].id, "claude-3-sonnet");
    }

    #[test]
    fn test_parse_response_no_owned_by() {
        let json = r#"{"object":"list","data":[{"id":"my-model","object":"model"}]}"#;
        let data = parse_models_response_bytes(json.as_bytes()).unwrap();
        assert_eq!(data[0].id, "my-model");
        assert!(data[0].owned_by.is_none());
    }

    #[test]
    fn test_parse_response_empty_data() {
        let json = r#"{"object":"list","data":[]}"#;
        let data = parse_models_response_bytes(json.as_bytes()).unwrap();
        assert!(data.is_empty());
    }
}
