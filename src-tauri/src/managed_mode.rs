use crate::app_config::AppType;
use crate::error::AppError;
use crate::provider::{Provider, ProviderMeta};
use crate::store::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// Keep it ON so managed providers are seeded and visible.
pub const MANAGED_MODE: bool = true;

pub const MANAGED_BRAND_NAME: &str = "NexusKey";
pub const MANAGED_BRAND_URL: &str = "https://nexuskey.eu.cc";

const MANAGED_CONFIG_FILE: &str = "managed-providers.json";
const DEFAULT_MANAGED_CONFIG_JSON: &str =
    include_str!("../resources/managed-providers.default.json");

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|dir| dir.to_path_buf()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedDefaultModel {
    pub primary: String,
    #[serde(default)]
    pub fallbacks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManagedModelOptionConfig {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ManagedHermesModel {
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProviderEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub website_url: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub icon_color: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub settings_config: Value,
    #[serde(default)]
    pub api_format: Option<String>,
    #[serde(default)]
    pub model_options: Vec<ManagedModelOptionConfig>,
    #[serde(default)]
    pub set_current: bool,
    #[serde(default)]
    pub live_config_managed: Option<bool>,
    #[serde(default)]
    pub openclaw_default_model: Option<ManagedDefaultModel>,
    #[serde(default)]
    pub openclaw_model_catalog: HashMap<String, crate::openclaw_config::OpenClawModelCatalogEntry>,
    #[serde(default)]
    pub hermes_model: Option<ManagedHermesModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProvidersConfig {
    #[serde(default = "default_brand_name")]
    pub brand_name: String,
    #[serde(default = "default_brand_url")]
    pub brand_url: String,
    #[serde(default)]
    pub claude: Option<ManagedProviderEntry>,
    #[serde(default)]
    pub codex: Option<ManagedProviderEntry>,
    #[serde(default)]
    pub gemini: Option<ManagedProviderEntry>,
    #[serde(default)]
    pub opencode: Option<ManagedProviderEntry>,
    #[serde(default)]
    pub openclaw: Option<ManagedProviderEntry>,
    #[serde(default)]
    pub hermes: Option<ManagedProviderEntry>,
    #[serde(default)]
    pub cursor: Option<ManagedProviderEntry>,
}

#[derive(Clone)]
pub struct ManagedProviderSeed {
    pub app_type: AppType,
    pub provider: Provider,
    pub set_current: bool,
}

fn default_brand_name() -> String {
    MANAGED_BRAND_NAME.to_string()
}

fn default_brand_url() -> String {
    MANAGED_BRAND_URL.to_string()
}

pub fn managed_config_path() -> PathBuf {
    if let Some(dir) = exe_dir() {
        return dir.join(MANAGED_CONFIG_FILE);
    }
    PathBuf::from(MANAGED_CONFIG_FILE)
}

fn default_managed_config_json() -> Cow<'static, str> {
    Cow::Borrowed(DEFAULT_MANAGED_CONFIG_JSON)
}

pub fn ensure_managed_config_file() -> Result<(), AppError> {
    let path = managed_config_path();
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }

    let content = default_managed_config_json();
    fs::write(&path, content.as_bytes()).map_err(|e| AppError::io(&path, e))?;
    Ok(())
}

pub fn load_managed_config() -> Result<ManagedProvidersConfig, AppError> {
    ensure_managed_config_file()?;
    let path = managed_config_path();
    let content = fs::read_to_string(&path).map_err(|e| AppError::io(&path, e))?;
    serde_json::from_str(&content)
        .map_err(|e| AppError::Config(format!("Failed to parse managed providers JSON: {e}")))
}

pub fn save_managed_config(config: &ManagedProvidersConfig) -> Result<(), AppError> {
    let path = managed_config_path();
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Config(format!("Failed to serialize managed providers JSON: {e}")))?;
    fs::write(&path, content).map_err(|e| AppError::io(&path, e))?;
    Ok(())
}

fn entry_mut<'a>(
    config: &'a mut ManagedProvidersConfig,
    app_type: &AppType,
) -> Option<&'a mut ManagedProviderEntry> {
    match app_type {
        AppType::Claude => config.claude.as_mut(),
        AppType::Codex => config.codex.as_mut(),
        AppType::Gemini => config.gemini.as_mut(),
        AppType::OpenCode => config.opencode.as_mut(),
        AppType::OpenClaw => config.openclaw.as_mut(),
        AppType::Hermes => config.hermes.as_mut(),
        AppType::Cursor => config.cursor.as_mut(),
    }
}

fn reorder_object_key_first(map: &mut serde_json::Map<String, Value>, selected_key: &str) {
    if let Some(selected) = map.get(selected_key).cloned() {
        let mut reordered = serde_json::Map::new();
        reordered.insert(selected_key.to_string(), selected);
        let old = std::mem::take(map);
        for (key, value) in old {
            if key != selected_key {
                reordered.insert(key, value);
            }
        }
        *map = reordered;
    }
}

pub fn update_selected_model(app_type: &AppType, model: &str) -> Result<(), AppError> {
    let mut config = load_managed_config()?;
    let entry = entry_mut(&mut config, app_type)
        .ok_or_else(|| AppError::Message(format!("No managed provider configured for {}", app_type.as_str())))?;

    match app_type {
        AppType::Claude => {
            if let Some(env) = entry
                .settings_config
                .get_mut("env")
                .and_then(|v| v.as_object_mut())
            {
                env.insert("ANTHROPIC_MODEL".to_string(), Value::String(model.to_string()));
                env.insert(
                    "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
                    Value::String(model.to_string()),
                );
            }
        }
        AppType::Codex => {
            let config_text = entry
                .settings_config
                .get("config")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let next = crate::codex_config::update_codex_toml_field(config_text, "model", model)
                .map_err(AppError::Config)?;
            entry.settings_config["config"] = Value::String(next);
        }
        AppType::Gemini => {
            if let Some(env) = entry
                .settings_config
                .get_mut("env")
                .and_then(|v| v.as_object_mut())
            {
                env.insert("GEMINI_MODEL".to_string(), Value::String(model.to_string()));
            }
        }
        AppType::OpenCode => {
            if let Some(models) = entry
                .settings_config
                .get_mut("models")
                .and_then(|v| v.as_object_mut())
            {
                reorder_object_key_first(models, model);
            }
        }
        AppType::OpenClaw => {
            entry.openclaw_default_model = Some(ManagedDefaultModel {
                primary: format!("{}/{}", entry.id, model),
                fallbacks: Vec::new(),
            });
        }
        AppType::Hermes => {
            let base_url = entry
                .settings_config
                .get("base_url")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            entry.hermes_model = Some(ManagedHermesModel {
                default: Some(model.to_string()),
                provider: Some(entry.id.clone()),
                base_url,
            });
        }
        AppType::Cursor => {
            let config_text = entry
                .settings_config
                .get("config")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let next = crate::codex_config::update_codex_toml_field(config_text, "model", model)
                .map_err(AppError::Config)?;
            entry.settings_config["config"] = Value::String(next);
        }
    }

    save_managed_config(&config)
}

fn managed_provider_meta(
    api_format: Option<String>,
    live_config_managed: Option<bool>,
) -> Option<ProviderMeta> {
    let mut meta = ProviderMeta::default();
    meta.api_format = api_format;
    meta.live_config_managed = live_config_managed;
    Some(meta)
}

fn provider_from_entry(entry: ManagedProviderEntry) -> Provider {
    let mut provider = Provider::with_id(
        entry.id,
        entry.name,
        entry.settings_config,
        entry.website_url.or_else(|| Some(MANAGED_BRAND_URL.to_string())),
    );
    provider.category = entry.category;
    provider.icon = entry.icon;
    provider.icon_color = entry.icon_color;
    provider.meta = managed_provider_meta(entry.api_format, entry.live_config_managed);
    provider
}

pub fn managed_provider_seeds() -> Result<Vec<ManagedProviderSeed>, AppError> {
    let config = load_managed_config()?;
    let mut seeds = Vec::new();

    if let Some(entry) = config.claude {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::Claude,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }
    if let Some(entry) = config.codex {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::Codex,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }
    if let Some(entry) = config.gemini {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::Gemini,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }
    if let Some(entry) = config.opencode {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::OpenCode,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }
    if let Some(entry) = config.openclaw {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::OpenClaw,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }
    if let Some(entry) = config.hermes {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::Hermes,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }
    if let Some(entry) = config.cursor {
        seeds.push(ManagedProviderSeed {
            app_type: AppType::Cursor,
            provider: provider_from_entry(entry.clone()),
            set_current: entry.set_current,
        });
    }

    Ok(seeds)
}

pub fn apply_managed_runtime_overrides(state: &AppState) -> Result<(), AppError> {
    crate::services::ProviderService::sync_current_to_live(state)?;
    let managed = load_managed_config()?;

    if let Some(openclaw) = managed.openclaw {
        if let Some(model) = openclaw.openclaw_default_model {
            let _ = crate::openclaw_config::set_default_model(
                &crate::openclaw_config::OpenClawDefaultModel {
                    primary: model.primary,
                    fallbacks: model.fallbacks,
                    extra: HashMap::new(),
                },
            );
        }
        if !openclaw.openclaw_model_catalog.is_empty() {
            let _ = crate::openclaw_config::set_model_catalog(&openclaw.openclaw_model_catalog);
        }
    }

    if let Some(hermes) = managed.hermes {
        let _ = crate::hermes_config::apply_switch_defaults(&hermes.id, &hermes.settings_config);
        if let Some(model) = hermes.hermes_model {
            let _ = crate::hermes_config::set_model_config(&crate::hermes_config::HermesModelConfig {
                default: model.default,
                provider: model.provider,
                base_url: model.base_url,
                context_length: None,
                max_tokens: None,
                extra: HashMap::new(),
            });
        }
    }

    Ok(())
}
