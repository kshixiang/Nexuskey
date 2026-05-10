use crate::app_config::AppType;
use crate::error::AppError;
use crate::store::AppState;
use serde::Serialize;
use serde_json::{Map, Value};
use std::str::FromStr;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedModelOption {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedModelState {
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    pub options: Vec<ManagedModelOption>,
}

fn ensure_managed_mode() -> Result<(), String> {
    if !crate::managed_mode::MANAGED_MODE {
        return Err("Managed relay mode is disabled".to_string());
    }
    Ok(())
}

fn get_provider_for_app(state: &AppState, app_type: &AppType) -> Result<crate::provider::Provider, AppError> {
    let managed = crate::managed_mode::load_managed_config()?;
    let provider_id = match app_type {
        AppType::Claude => managed.claude.as_ref().map(|v| v.id.clone()),
        AppType::Codex => managed.codex.as_ref().map(|v| v.id.clone()),
        AppType::Gemini => managed.gemini.as_ref().map(|v| v.id.clone()),
        AppType::OpenCode => managed.opencode.as_ref().map(|v| v.id.clone()),
        AppType::OpenClaw => managed.openclaw.as_ref().map(|v| v.id.clone()),
        AppType::Hermes => managed.hermes.as_ref().map(|v| v.id.clone()),
        AppType::Cursor => managed.cursor.as_ref().map(|v| v.id.clone()),
    }
    .ok_or_else(|| AppError::Message(format!("No managed provider configured for {}", app_type.as_str())))?;

    state
        .db
        .get_provider_by_id(&provider_id, app_type.as_str())?
        .ok_or_else(|| AppError::Message(format!("Managed provider '{}' not found in database", provider_id)))
}

fn get_config_entry(
    app_type: &AppType,
) -> Result<crate::managed_mode::ManagedProviderEntry, AppError> {
    let managed = crate::managed_mode::load_managed_config()?;
    match app_type {
        AppType::Claude => managed.claude,
        AppType::Codex => managed.codex,
        AppType::Gemini => managed.gemini,
        AppType::OpenCode => managed.opencode,
        AppType::OpenClaw => managed.openclaw,
        AppType::Hermes => managed.hermes,
        AppType::Cursor => managed.cursor,
    }
    .ok_or_else(|| AppError::Message(format!("No managed provider configured for {}", app_type.as_str())))
}

fn model_options_from_config(
    entry: &crate::managed_mode::ManagedProviderEntry,
) -> Vec<ManagedModelOption> {
    entry
        .model_options
        .iter()
        .map(|option| ManagedModelOption {
            id: option.id.clone(),
            name: option.name.clone(),
        })
        .collect()
}

fn extract_model_state(app_type: &AppType, provider: &crate::provider::Provider) -> ManagedModelState {
    match app_type {
        AppType::Claude => {
            let env = provider
                .settings_config
                .get("env")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();
            let current = env
                .get("ANTHROPIC_MODEL")
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let mut options = Vec::new();
            for key in [
                "ANTHROPIC_MODEL",
                "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                "ANTHROPIC_DEFAULT_SONNET_MODEL",
                "ANTHROPIC_DEFAULT_OPUS_MODEL",
            ] {
                if let Some(model) = env.get(key).and_then(|v| v.as_str()) {
                    if !model.trim().is_empty()
                        && !options.iter().any(|item: &ManagedModelOption| item.id == model)
                    {
                        options.push(ManagedModelOption {
                            id: model.to_string(),
                            name: None,
                        });
                    }
                }
            }

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model: current,
                options,
            }
        }
        AppType::Codex => {
            let current = provider
                .settings_config
                .get("config")
                .and_then(|v| v.as_str())
                .and_then(|config| {
                    let table = toml::from_str::<toml::Table>(config).ok()?;
                    table
                        .get("model")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                });

            let mut options = Vec::new();
            if let Some(model) = current.clone() {
                options.push(ManagedModelOption {
                    id: model,
                    name: None,
                });
            }

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model: current,
                options,
            }
        }
        AppType::Gemini => {
            let env = provider
                .settings_config
                .get("env")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();
            let current = env
                .get("GEMINI_MODEL")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let options = current
                .clone()
                .into_iter()
                .map(|id| ManagedModelOption { id, name: None })
                .collect();

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model: current,
                options,
            }
        }
        AppType::OpenCode => {
            let models = provider
                .settings_config
                .get("models")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();
            let options = models
                .iter()
                .map(|(id, model)| ManagedModelOption {
                    id: id.clone(),
                    name: model
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                })
                .collect::<Vec<_>>();
            let selected_model = options.first().map(|v| v.id.clone());

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model,
                options,
            }
        }
        AppType::OpenClaw => {
            let models = provider
                .settings_config
                .get("models")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let options = models
                .iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let name = item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    Some(ManagedModelOption { id, name })
                })
                .collect::<Vec<_>>();
            let selected_model = crate::openclaw_config::get_default_model()
                .ok()
                .flatten()
                .and_then(|model| model.primary.split('/').next_back().map(str::to_string))
                .or_else(|| options.first().map(|v| v.id.clone()));

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model,
                options,
            }
        }
        AppType::Hermes => {
            let models = provider
                .settings_config
                .get("models")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let options = models
                .iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let name = item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    Some(ManagedModelOption { id, name })
                })
                .collect::<Vec<_>>();
            let selected_model = crate::hermes_config::get_model_config()
                .ok()
                .flatten()
                .and_then(|model| model.default)
                .or_else(|| options.first().map(|v| v.id.clone()));

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model,
                options,
            }
        }
        AppType::Cursor => {
            let current = provider
                .settings_config
                .get("config")
                .and_then(|v| v.as_str())
                .and_then(|config| {
                    let table = toml::from_str::<toml::Table>(config).ok()?;
                    table
                        .get("model")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                });

            let mut options = Vec::new();
            if let Some(model) = current.clone() {
                options.push(ManagedModelOption {
                    id: model,
                    name: None,
                });
            }

            ManagedModelState {
                provider_id: provider.id.clone(),
                selected_model: current,
                options,
            }
        }
    }
}

#[tauri::command]
pub fn get_managed_model_state(
    state: State<'_, AppState>,
    app: String,
) -> Result<ManagedModelState, String> {
    ensure_managed_mode()?;
    let app_type = AppType::from_str(&app).map_err(|e| e.to_string())?;
    let provider = get_provider_for_app(state.inner(), &app_type).map_err(|e| e.to_string())?;
    let config_entry = get_config_entry(&app_type).map_err(|e| e.to_string())?;
    let mut state = extract_model_state(&app_type, &provider);
    let configured = model_options_from_config(&config_entry);
    if !configured.is_empty() {
        state.options = configured;
        if state.selected_model.is_none() {
            state.selected_model = state.options.first().map(|v| v.id.clone());
        }
    }
    Ok(state)
}

fn update_claude_model(settings: &mut Value, model: &str) {
    if let Some(env) = settings.get_mut("env").and_then(|v| v.as_object_mut()) {
        env.insert("ANTHROPIC_MODEL".to_string(), Value::String(model.to_string()));
        env.insert(
            "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
            Value::String(model.to_string()),
        );
    }
}

fn update_gemini_model(settings: &mut Value, model: &str) {
    if let Some(env) = settings.get_mut("env").and_then(|v| v.as_object_mut()) {
        env.insert("GEMINI_MODEL".to_string(), Value::String(model.to_string()));
    }
}

fn update_opencode_model(settings: &mut Value, model: &str) {
    let Some(models_map) = settings.get("models").and_then(|v| v.as_object()).cloned() else {
        return;
    };
    if let Some(selected) = models_map.get(model) {
        let mut reordered = Map::new();
        reordered.insert(model.to_string(), selected.clone());
        for (key, value) in models_map {
            if key != model {
                reordered.insert(key, value);
            }
        }
        settings["models"] = Value::Object(reordered);
    }
}

fn update_openclaw_model(provider_id: &str, model: &str) -> Result<(), AppError> {
    crate::openclaw_config::set_default_model(&crate::openclaw_config::OpenClawDefaultModel {
        primary: format!("{provider_id}/{model}"),
        fallbacks: Vec::new(),
        extra: std::collections::HashMap::new(),
    })?;
    Ok(())
}

fn update_hermes_model(provider_id: &str, provider: &crate::provider::Provider, model: &str) -> Result<(), AppError> {
    let base_url = provider
        .settings_config
        .get("base_url")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    crate::hermes_config::set_model_config(&crate::hermes_config::HermesModelConfig {
        default: Some(model.to_string()),
        provider: Some(provider_id.to_string()),
        base_url,
        context_length: None,
        max_tokens: None,
        extra: std::collections::HashMap::new(),
    })?;
    Ok(())
}

#[tauri::command]
pub fn set_managed_model(
    state: State<'_, AppState>,
    app: String,
    model: String,
) -> Result<ManagedModelState, String> {
    ensure_managed_mode()?;
    let app_type = AppType::from_str(&app).map_err(|e| e.to_string())?;
    let provider = get_provider_for_app(state.inner(), &app_type).map_err(|e| e.to_string())?;
    let config_entry = get_config_entry(&app_type).map_err(|e| e.to_string())?;
    let mut model_state = extract_model_state(&app_type, &provider);
    let configured = model_options_from_config(&config_entry);
    if !configured.is_empty() {
        model_state.options = configured;
        if model_state.selected_model.is_none() {
            model_state.selected_model = model_state.options.first().map(|v| v.id.clone());
        }
    }

    if !model_state.options.iter().any(|item| item.id == model) {
        return Err(format!("Model '{}' is not configured for {}", model, app_type.as_str()));
    }

    let mut updated_settings = provider.settings_config.clone();
    match app_type {
        AppType::Claude => update_claude_model(&mut updated_settings, &model),
        AppType::Codex => {
            let config_text = updated_settings
                .get("config")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let next = crate::codex_config::update_codex_toml_field(config_text, "model", &model)
                .map_err(|e| e.to_string())?;
            updated_settings["config"] = Value::String(next);
        }
        AppType::Gemini => update_gemini_model(&mut updated_settings, &model),
        AppType::OpenCode => update_opencode_model(&mut updated_settings, &model),
        AppType::OpenClaw => {
            update_openclaw_model(&provider.id, &model).map_err(|e| e.to_string())?;
        }
        AppType::Hermes => {
            update_hermes_model(&provider.id, &provider, &model).map_err(|e| e.to_string())?;
        }
        AppType::Cursor => {
            let config_text = updated_settings
                .get("config")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let next = crate::codex_config::update_codex_toml_field(config_text, "model", &model)
                .map_err(|e| e.to_string())?;
            updated_settings["config"] = Value::String(next);
        }
    }

    if matches!(
        app_type,
        AppType::Claude | AppType::Codex | AppType::Gemini | AppType::OpenCode | AppType::Cursor
    ) {
        state
            .db
            .update_provider_settings_config(app_type.as_str(), &provider.id, &updated_settings)
            .map_err(|e| e.to_string())?;
        crate::services::ProviderService::sync_current_provider_for_app(state.inner(), app_type.clone())
            .map_err(|e| e.to_string())?;
    }

    crate::managed_mode::update_selected_model(&app_type, &model).map_err(|e| e.to_string())?;

    let provider = get_provider_for_app(state.inner(), &app_type).map_err(|e| e.to_string())?;
    let mut next_state = extract_model_state(&app_type, &provider);
    next_state.selected_model = Some(model);
    Ok(next_state)
}
