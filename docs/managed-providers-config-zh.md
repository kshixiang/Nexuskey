# managed-providers.default.json 配置说明（中文）

本文档说明 `src-tauri/resources/managed-providers.default.json` 的结构、字段含义与修改方式。

## 1. 文件位置

- 仓库默认模板：
  `src-tauri/resources/managed-providers.default.json`
- 运行时配置（首次启动后生成）：
  与应用 `exe` 同目录下的 `managed-providers.json`

## 2. 应该修改哪个文件

- 只想修改当前机器生效配置：改 `exe` 同目录下的 `managed-providers.json`
- 想修改后续打包/安装默认配置：改 `src-tauri/resources/managed-providers.default.json`

注意：如果运行时文件已存在，应用优先读取运行时文件。仅修改仓库模板不会覆盖已存在的运行时配置。

## 3. 启动时行为

应用启动后会：

1. 确保 `exe` 同目录下的 `managed-providers.json` 存在
2. 读取该 JSON
3. 将配置的供应商同步到数据库
4. 将 `settingsConfig` 同步到各应用 live config
5. 应用 OpenClaw/Hermes 的默认模型配置

当用户在 UI 中切换模型时，应用会同时更新：

- 对应应用的 live config
- 数据库中的记录
- `exe` 同目录下的 `managed-providers.json`

## 4. 顶层结构

当前模板包含以下顶层键：

- `brandName`
- `brandUrl`
- `claude`
- `codex`
- `gemini`
- `opencode`
- `openclaw`
- `hermes`

其中 `brandName`、`brandUrl` 为品牌信息；其余键是各供应商配置块。

## 5. 供应商通用字段

每个供应商块通常包含以下字段：

- `id`：供应商唯一标识（建议稳定，不随意改）
- `name`：展示名称
- `websiteUrl`：供应商网站
- `icon`：图标标识（与前端图标映射关联）
- `iconColor`：图标主题色
- `category`：分类（当前常见为 `third_party`）
- `settingsConfig`：写入目标应用配置的核心内容
- `modelOptions`：模型下拉选项（`claude`/`codex`/`gemini` 使用）
- `setCurrent`：是否设置为当前选中项（用于部分 provider）
- `liveConfigManaged`：是否由托管配置接管 live config（用于 `opencode`/`openclaw`/`hermes`）
- `apiFormat`：API 格式（示例：`claude` 使用 `anthropic`）

## 6. 各 Provider 的关键字段

### 6.1 Claude

- 模型列表来源：`claude.modelOptions`
- 基地址字段：`settingsConfig.env.ANTHROPIC_BASE_URL`
- API Key 字段：`settingsConfig.env.ANTHROPIC_AUTH_TOKEN`
- 默认模型字段：
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`

### 6.2 Codex

- 模型列表来源：`codex.modelOptions`
- API Key 字段：`settingsConfig.auth.OPENAI_API_KEY`
- 连接地址在 `settingsConfig.config`（TOML 字符串）中配置：
  - `[model_providers.<name>]` 下的 `base_url`
  - 示例中使用 `wire_api = "responses"`

### 6.3 Gemini

- 模型列表来源：`gemini.modelOptions`
- 基地址字段：`settingsConfig.env.GOOGLE_GEMINI_BASE_URL`
- API Key 字段：`settingsConfig.env.GEMINI_API_KEY`
- 默认模型字段：`settingsConfig.env.GEMINI_MODEL`

### 6.4 OpenCode

- `liveConfigManaged: true`
- 模型列表来源：`settingsConfig.models`（对象结构）
- 基地址字段：`settingsConfig.options.baseURL`
- API Key 字段：`settingsConfig.options.apiKey`
- SDK 相关字段：
  - `settingsConfig.name`
  - `settingsConfig.npm`
- 模型上下文/输出上限在 `settingsConfig.models.<modelId>.limit`

### 6.5 OpenClaw

- `liveConfigManaged: true`
- 基地址字段：`settingsConfig.baseUrl`
- API Key 字段：`settingsConfig.apiKey`
- API 模式字段：`settingsConfig.api`（示例：`openai-responses`）
- 模型列表来源：`settingsConfig.models`（数组）
  - 模型容量字段：`contextWindow`、`maxTokens`
- 默认模型配置：
  - `openclawDefaultModel.primary`
  - `openclawDefaultModel.fallbacks`
- 模型别名目录：
  - `openclawModelCatalog.<provider/model>.alias`

### 6.6 Hermes

- `liveConfigManaged: true`
- 基地址字段：`settingsConfig.base_url`
- API Key 字段：`settingsConfig.api_key`
- API 模式字段：`settingsConfig.api_mode`（示例：`chat_completions`）
- 模型列表来源：`settingsConfig.models`（数组）
  - 常见字段：`id`、`name`、`context_length`
- 默认模型配置：
  - `hermesModel.default`
  - `hermesModel.provider`
  - `hermesModel.base_url`

## 7. 模型下拉来源规则

- `claude` / `codex` / `gemini`：来自 `modelOptions`
- `opencode` / `openclaw` / `hermes`：来自 `settingsConfig.models`

## 8. 修改建议与注意事项

1. 尽量保持 `id` 稳定，避免造成已有映射失效。
2. API Key 占位符建议统一使用 `YOUR_NEXUSKEY_API_KEY`，由用户在运行时替换。
3. 修改模型 ID 时，同步检查默认模型字段是否仍存在于模型列表中。
4. 修改地址时，优先确认对应 provider 的地址字段（不同 provider 的字段名不同）。
5. 修改后建议重启应用并验证模型下拉、默认模型与请求链路是否正常。
