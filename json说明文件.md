# JSON 说明文件

本文档用于说明 Nexuskey 项目中常见 JSON 文件的用途与注意事项，便于快速定位和修改配置。

## 1. 常见 JSON 文件

| 文件路径 | 作用 |
| --- | --- |
| `package.json` | 前端工程依赖、脚本命令、项目信息配置 |
| `components.json` | UI 组件生成/管理相关配置 |
| `tsconfig.json` | TypeScript 主配置（编译目标、路径别名、严格模式等） |
| `tsconfig.node.json` | Node 环境下的 TypeScript 配置 |
| `src-tauri/tauri.conf.json` | Tauri 桌面应用主配置 |
| `src-tauri/tauri.windows.conf.json` | Windows 平台的 Tauri 专项配置 |
| `src-tauri/capabilities/default.json` | Tauri capability 权限定义 |
| `src-tauri/resources/managed-providers.default.json` | 内置托管供应商默认数据 |
| `src/i18n/locales/zh.json` | 中文界面文案 |
| `src/i18n/locales/en.json` | 英文界面文案 |
| `src/i18n/locales/ja.json` | 日文界面文案 |

## 2. 修改原则

1. **先理解用途再修改**：不同 JSON 文件对应不同子系统，避免跨模块误改。
2. **保持键名稳定**：业务代码通常依赖固定键名，随意改名会导致运行错误。
3. **注意逗号和引号**：JSON 不支持尾逗号，字符串必须使用双引号。
4. **改动后及时验证**：建议执行项目测试或最小化运行验证。

## 3. 常见错误

- 缺少逗号或多写逗号导致解析失败。
- 将布尔值/数字错误写成字符串（例如 `"true"`、`"3000"`）。
- 在多语言文件中遗漏同名键，造成界面回退或显示异常。
- 修改 `tauri.conf.json` 后未重新构建，误以为配置未生效。

## 4. 建议工作流

1. 修改前备份目标 JSON。
2. 小步提交，每次只改一个主题。
3. 使用编辑器格式化并检查语法。
4. 运行相关命令验证：如 `pnpm test`、`pnpm build`（按需执行）。

## 5. 备注

如果后续新增 JSON 配置文件，建议在本文档追加“文件路径 + 作用 + 注意事项”，保持配置文档可追踪。
