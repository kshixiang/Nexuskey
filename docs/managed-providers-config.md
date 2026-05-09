# Managed Providers JSON

The managed relay build reads provider endpoints and model options from a JSON file instead of letting end users create providers in the UI.

## Files

- Repository default template:
  [src-tauri/resources/managed-providers.default.json](G:/carl/project/SQAI/Nexuskey/src-tauri/resources/managed-providers.default.json)
- Runtime config generated on first launch:
  `managed-providers.json` in the same directory as the app executable

## Which file should you edit?

- To change the config on the current machine:
  edit `managed-providers.json` in the executable directory
- To change the default bundled config for future installs/builds:
  edit `src-tauri/resources/managed-providers.default.json`

If the runtime file already exists, the app keeps using it. Updating the repository template does not overwrite an existing runtime file.

## Runtime behavior

On startup the app:

1. Ensures `managed-providers.json` exists in the executable directory
2. Loads that JSON
3. Syncs the configured providers into the database
4. Syncs provider settings into each app's live config
5. Applies OpenClaw/Hermes default model selections

When a user changes the selected model from the UI, the app updates:

- the target app live config
- the database copy
- `managed-providers.json` in the executable directory

So model choices persist across restarts.

## Structure

Top-level keys:

- `brandName`
- `brandUrl`
- `claude`
- `codex`
- `gemini`
- `opencode`
- `openclaw`
- `hermes`

Each provider block supports:

- `id`
- `name`
- `websiteUrl`
- `icon`
- `iconColor`
- `category`
- `settingsConfig`
- `apiFormat`
- `modelOptions`
- `setCurrent`
- `liveConfigManaged`

OpenClaw-only:

- `openclawDefaultModel`
- `openclawModelCatalog`

Hermes-only:

- `hermesModel`

## Model options

For `claude`, `codex`, and `gemini`, model dropdown options come from `modelOptions`.

Example:

```json
"codex": {
  "modelOptions": [
    { "id": "gpt-5.4", "name": "GPT-5.4" },
    { "id": "gpt-5.4-mini", "name": "GPT-5.4 Mini" }
  ]
}
```

For `opencode`, `openclaw`, and `hermes`, the model dropdown is derived from `settingsConfig.models`.

## Address fields by app

- Claude:
  `settingsConfig.env.ANTHROPIC_BASE_URL`
- Codex:
  `settingsConfig.config` TOML string -> `base_url`
- Gemini:
  `settingsConfig.env.GOOGLE_GEMINI_BASE_URL`
- OpenCode:
  `settingsConfig.options.baseURL`
- OpenClaw:
  `settingsConfig.baseUrl`
- Hermes:
  `settingsConfig.base_url`
