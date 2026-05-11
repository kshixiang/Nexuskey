//! Usage script execution
//!
//! Handles executing and formatting usage query results.

use crate::app_config::AppType;
use crate::error::AppError;
use crate::provider::{UsageData, UsageResult, UsageScript};
use crate::settings;
use crate::store::AppState;
use crate::usage_script;
use serde_json::Value;

/// Execute usage script and format result (private helper method)
pub(crate) async fn execute_and_format_usage_result(
    script_code: &str,
    api_key: &str,
    base_url: &str,
    timeout: u64,
    access_token: Option<&str>,
    user_id: Option<&str>,
    template_type: Option<&str>,
) -> Result<UsageResult, AppError> {
    match usage_script::execute_usage_script(
        script_code,
        api_key,
        base_url,
        timeout,
        access_token,
        user_id,
        template_type,
    )
    .await
    {
        Ok(data) => {
            let usage_list: Vec<UsageData> = if data.is_array() {
                serde_json::from_value(data).map_err(|e| {
                    AppError::localized(
                        "usage_script.data_format_error",
                        format!("数据格式错误: {e}"),
                        format!("Data format error: {e}"),
                    )
                })?
            } else {
                let single: UsageData = serde_json::from_value(data).map_err(|e| {
                    AppError::localized(
                        "usage_script.data_format_error",
                        format!("数据格式错误: {e}"),
                        format!("Data format error: {e}"),
                    )
                })?;
                vec![single]
            };

            Ok(UsageResult {
                success: true,
                data: Some(usage_list),
                error: None,
            })
        }
        Err(err) => {
            let lang = settings::get_settings()
                .language
                .unwrap_or_else(|| "zh".to_string());

            let msg = match err {
                AppError::Localized { zh, en, .. } => {
                    if lang == "en" {
                        en
                    } else {
                        zh
                    }
                }
                other => other.to_string(),
            };

            Ok(UsageResult {
                success: false,
                data: None,
                error: Some(msg),
            })
        }
    }
}

/// Extract API key from provider configuration
///
/// 同时兼容多种应用的写法：
/// - Claude/Gemini：`env.{ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY}`
/// - Codex：`auth.OPENAI_API_KEY`
/// - Hermes：顶层 `api_key`
/// - OpenClaw / OpenCode：顶层 `apiKey`
fn extract_api_key_from_provider(provider: &crate::provider::Provider) -> Option<String> {
    let cfg = &provider.settings_config;

    if let Some(env) = cfg.get("env") {
        if let Some(s) = env
            .get("ANTHROPIC_AUTH_TOKEN")
            .or_else(|| env.get("ANTHROPIC_API_KEY"))
            .or_else(|| env.get("OPENROUTER_API_KEY"))
            .or_else(|| env.get("GEMINI_API_KEY"))
            .or_else(|| env.get("GOOGLE_API_KEY"))
            .and_then(|v| v.as_str())
        {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }

    if let Some(s) = cfg
        .get("auth")
        .and_then(|a| a.get("OPENAI_API_KEY"))
        .and_then(|v| v.as_str())
    {
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }

    if let Some(s) = cfg.get("api_key").and_then(|v| v.as_str()) {
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    if let Some(s) = cfg.get("apiKey").and_then(|v| v.as_str()) {
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }

    None
}

fn extract_codex_base_url_from_toml(config_toml: &str) -> Option<String> {
    let t = config_toml.trim();
    if t.is_empty() {
        return None;
    }
    // Simple string scan (same as other places in codebase): support single/double quotes.
    if let Some(start) = t.find("base_url = \"") {
        let rest = &t[start + 12..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].trim().trim_end_matches('/').to_string());
        }
    }
    if let Some(start) = t.find("base_url = '") {
        let rest = &t[start + 12..];
        if let Some(end) = rest.find('\'') {
            return Some(rest[..end].trim().trim_end_matches('/').to_string());
        }
    }
    None
}

fn normalize_nexuskey_codex_base_url(url: &str) -> String {
    // First apply legacy host migration.
    let t = normalize_legacy_nexuskey_gateway_url(url);
    // Then normalize the Codex path: OpenAI-compatible base is rooted at /v1.
    // If users/presets still have /codex/v1, collapse it to /v1 so /v1/models works.
    let t = t.trim_end_matches('/').to_string();
    if t == "https://nexuskey.eu.cc/codex/v1" || t.starts_with("https://nexuskey.eu.cc/codex/v1/") {
        return "https://nexuskey.eu.cc/v1".to_string();
    }
    t
}

/// 旧网关域名统一为当前官方入口（本地库里仍可能存 `api.nexuskey.ai`）。
pub(crate) fn normalize_legacy_nexuskey_gateway_url(url: &str) -> String {
    let t = url.trim().trim_end_matches('/');
    const OLD_HTTPS: &str = "https://api.nexuskey.ai";
    const OLD_HTTP: &str = "http://api.nexuskey.ai";
    const NEW: &str = "https://nexuskey.eu.cc";
    if let Some(rest) = t.strip_prefix(OLD_HTTPS) {
        return if rest.is_empty() {
            NEW.to_string()
        } else {
            format!("{NEW}{rest}")
        };
    }
    if let Some(rest) = t.strip_prefix(OLD_HTTP) {
        return if rest.is_empty() {
            NEW.to_string()
        } else {
            format!("{NEW}{rest}")
        };
    }
    t.to_string()
}

const NEXUSKEY_OFFICIAL_ROOT: &str = "https://nexuskey.eu.cc";
const NEXUSKEY_OFFICIAL_ANTHROPIC_CLAUDE_PREFIX: &str = "https://nexuskey.eu.cc/claude";

/// 官方网关 Anthropic Base URL 仅使用根域名；历史里的 `/claude` 路径折叠掉。
fn strip_nexuskey_official_anthropic_claude_path(url: &str) -> String {
    let t = url.trim().trim_end_matches('/');
    if t == NEXUSKEY_OFFICIAL_ANTHROPIC_CLAUDE_PREFIX
        || t.starts_with(&format!("{NEXUSKEY_OFFICIAL_ANTHROPIC_CLAUDE_PREFIX}/"))
    {
        NEXUSKEY_OFFICIAL_ROOT.to_string()
    } else {
        t.to_string()
    }
}

/// 旧域名迁移 + 官方 Anthropic 入口折叠为 `https://nexuskey.eu.cc`。
pub(crate) fn normalize_nexuskey_anthropic_base_url(url: &str) -> String {
    let after_legacy = normalize_legacy_nexuskey_gateway_url(url);
    strip_nexuskey_official_anthropic_claude_path(&after_legacy)
}

fn normalize_legacy_nexuskey_in_toml_fragment(s: &str) -> String {
    let mut out = s
        .replace("https://api.nexuskey.ai", "https://nexuskey.eu.cc")
        .replace("http://api.nexuskey.ai", "https://nexuskey.eu.cc");
    // 官方网关：OpenAI 兼容入口在 /v1，不再使用 /codex/v1（/v1/models 需在根上）
    out = out.replace(
        "https://nexuskey.eu.cc/codex/v1",
        "https://nexuskey.eu.cc/v1",
    );
    out
}

/// 将已保存供应商里残留的 `api.nexuskey.ai` 写入为当前官方入口，避免 Live/平台侧仍显示旧域名。
pub(crate) fn normalize_legacy_nexuskey_urls_in_provider_settings(
    app_type: &AppType,
    settings: &mut Value,
) {
    match app_type {
        AppType::Claude => {
            if let Some(env) = settings.get_mut("env").and_then(|v| v.as_object_mut()) {
                if let Some(v) = env.get_mut("ANTHROPIC_BASE_URL") {
                    if let Some(s) = v.as_str() {
                        let n = normalize_nexuskey_anthropic_base_url(s);
                        if n != s {
                            *v = Value::String(n);
                        }
                    }
                }
            }
        }
        AppType::Gemini => {
            if let Some(env) = settings.get_mut("env").and_then(|v| v.as_object_mut()) {
                if let Some(v) = env.get_mut("GOOGLE_GEMINI_BASE_URL") {
                    if let Some(s) = v.as_str() {
                        let n = normalize_legacy_nexuskey_gateway_url(s);
                        if n != s {
                            *v = Value::String(n);
                        }
                    }
                }
            }
        }
        AppType::Codex => {
            if let Some(v) = settings.get_mut("config") {
                if let Some(s) = v.as_str() {
                    let n = normalize_legacy_nexuskey_in_toml_fragment(s);
                    if n != *s {
                        *v = Value::String(n);
                    }
                }
            }
        }
        AppType::OpenCode => {
            if let Some(options) = settings.get_mut("options").and_then(|o| o.as_object_mut()) {
                if let Some(v) = options.get_mut("baseURL") {
                    if let Some(s) = v.as_str() {
                        let n = normalize_legacy_nexuskey_gateway_url(s);
                        if n != s {
                            *v = Value::String(n);
                        }
                    }
                }
            }
        }
        AppType::OpenClaw => {
            if let Some(v) = settings.get_mut("baseUrl") {
                if let Some(s) = v.as_str() {
                    let n = normalize_legacy_nexuskey_gateway_url(s);
                    if n != s {
                        *v = Value::String(n);
                    }
                }
            }
        }
        AppType::Hermes => {
            if let Some(v) = settings.get_mut("base_url") {
                if let Some(s) = v.as_str() {
                    let n = normalize_legacy_nexuskey_gateway_url(s);
                    if n != s {
                        *v = Value::String(n);
                    }
                }
            }
        }
        AppType::Cursor => {}
    }
}

/// Extract base URL from provider configuration
///
/// 兼容 Claude（ANTHROPIC_BASE_URL）/ Gemini（GOOGLE_GEMINI_BASE_URL）/
/// Hermes（base_url）/ OpenClaw / OpenCode（baseUrl）。
/// Codex 的 base_url 在 TOML 字符串里，按需在前端处理，这里不解析。
fn extract_base_url_from_provider(provider: &crate::provider::Provider) -> Option<String> {
    let cfg = &provider.settings_config;

    if let Some(env) = cfg.get("env").and_then(|v| v.as_object()) {
        if let Some(s) = env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(normalize_nexuskey_anthropic_base_url(s));
            }
        }
        if let Some(s) = env.get("GOOGLE_GEMINI_BASE_URL").and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(normalize_legacy_nexuskey_gateway_url(s));
            }
        }
    }

    if let Some(s) = cfg.get("base_url").and_then(|v| v.as_str()) {
        if !s.is_empty() {
            return Some(normalize_legacy_nexuskey_gateway_url(s));
        }
    }
    if let Some(s) = cfg.get("baseUrl").and_then(|v| v.as_str()) {
        if !s.is_empty() {
            return Some(normalize_legacy_nexuskey_gateway_url(s));
        }
    }

    None
}

/// Base URL + API key for OpenAI-compatible `GET /v1/models`（托管主界面模型列表等）。
pub fn models_list_credentials(provider: &crate::provider::Provider) -> Option<(String, String)> {
    // Codex base_url is stored in the TOML string; parse it here so managed UI can
    // fetch OpenAI-compatible /v1/models (same path as Claude managed model selector).
    let base = if let Some(config_toml) = provider
        .settings_config
        .get("config")
        .and_then(|v| v.as_str())
    {
        extract_codex_base_url_from_toml(config_toml)
            .map(|s| normalize_nexuskey_codex_base_url(&s))
            .unwrap_or_else(|| extract_base_url_from_provider(provider).unwrap_or_default())
    } else {
        extract_base_url_from_provider(provider)?
    };

    let key = extract_api_key_from_provider(provider)?;
    let key = key.trim().to_string();
    if key.is_empty() {
        return None;
    }
    let base = base.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return None;
    }
    Some((base, key))
}

/// Query provider usage (using saved script configuration)
pub async fn query_usage(
    state: &AppState,
    app_type: AppType,
    provider_id: &str,
) -> Result<UsageResult, AppError> {
    let (script_code, timeout, api_key, base_url, access_token, user_id, template_type) = {
        let providers = state.db.get_all_providers(app_type.as_str())?;
        let provider = providers.get(provider_id).ok_or_else(|| {
            AppError::localized(
                "provider.not_found",
                format!("供应商不存在: {provider_id}"),
                format!("Provider not found: {provider_id}"),
            )
        })?;

        let usage_script = provider
            .meta
            .as_ref()
            .and_then(|m| m.usage_script.as_ref())
            .ok_or_else(|| {
                AppError::localized(
                    "provider.usage.script.missing",
                    "未配置用量查询脚本",
                    "Usage script is not configured",
                )
            })?;
        if !usage_script.enabled {
            return Err(AppError::localized(
                "provider.usage.disabled",
                "用量查询未启用",
                "Usage query is disabled",
            ));
        }

        // Get credentials: prioritize UsageScript values, fallback to provider config
        let api_key = usage_script
            .api_key
            .clone()
            .filter(|k| !k.is_empty())
            .or_else(|| extract_api_key_from_provider(provider))
            .unwrap_or_default();

        let base_url = {
            let raw = usage_script
                .base_url
                .clone()
                .filter(|u| !u.is_empty())
                .or_else(|| extract_base_url_from_provider(provider))
                .unwrap_or_default();
            normalize_legacy_nexuskey_gateway_url(&raw)
        };

        let global = settings::get_settings();
        let access_token = usage_script
            .access_token
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                global
                    .usage_query_access_token
                    .clone()
                    .filter(|s| !s.trim().is_empty())
            });
        let user_id = usage_script
            .user_id
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                global
                    .usage_query_user_id
                    .clone()
                    .filter(|s| !s.trim().is_empty())
            });

        (
            usage_script.code.clone(),
            usage_script.timeout.unwrap_or(10),
            api_key,
            base_url,
            access_token,
            user_id,
            usage_script.template_type.clone(),
        )
    };

    execute_and_format_usage_result(
        &script_code,
        &api_key,
        &base_url,
        timeout,
        access_token.as_deref(),
        user_id.as_deref(),
        template_type.as_deref(),
    )
    .await
}

/// Test usage script (using temporary script content, not saved)
#[allow(clippy::too_many_arguments)]
pub async fn test_usage_script(
    _state: &AppState,
    _app_type: AppType,
    _provider_id: &str,
    script_code: &str,
    timeout: u64,
    api_key: Option<&str>,
    base_url: Option<&str>,
    access_token: Option<&str>,
    user_id: Option<&str>,
    template_type: Option<&str>,
) -> Result<UsageResult, AppError> {
    // Use provided credential parameters directly for testing
    let base_url = normalize_legacy_nexuskey_gateway_url(base_url.unwrap_or(""));
    execute_and_format_usage_result(
        script_code,
        api_key.unwrap_or(""),
        &base_url,
        timeout,
        access_token,
        user_id,
        template_type,
    )
    .await
}

/// Validate UsageScript configuration (boundary checks)
pub(crate) fn validate_usage_script(script: &UsageScript) -> Result<(), AppError> {
    // Validate auto query interval (0-1440 minutes, max 24 hours)
    if let Some(interval) = script.auto_query_interval {
        if interval > 1440 {
            return Err(AppError::localized(
                "usage_script.interval_too_large",
                format!("自动查询间隔不能超过 1440 分钟（24小时），当前值: {interval}"),
                format!(
                    "Auto query interval cannot exceed 1440 minutes (24 hours), current: {interval}"
                ),
            ));
        }
    }

    Ok(())
}
