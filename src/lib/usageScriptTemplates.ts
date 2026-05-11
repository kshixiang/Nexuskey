/**
 * 用量脚本预置模板（共享常量，跟 UsageScriptModal 解耦）
 *
 * - 这些模板由后端 `usage_script` 解释执行，使用 `{{apiKey}}` / `{{baseUrl}}`
 *   / `{{accessToken}}` / `{{userId}}` 占位符；具体替换逻辑见
 *   `src-tauri/src/usage_script.rs::build_script_with_vars`。
 * - 这里之所以独立成文件，是为了让 App.tsx 在「检测到 managed 模式 + 已配置
 *   sk-xxx 的供应商」时，能直接写入一份默认 New API 脚本到 `provider.meta`，
 *   实现「输入 Key 后无需点击就能查余额」的开箱即用体验。
 *
 * ⚠️ 模板里出现的 default plan 名 / 失败兜底文案是用户能看到的字符串，
 *    所以保留中文文案，与 modal 一致即可。
 */

export const NEW_API_BALANCE_SCRIPT = `({
  request: {
    url: "{{baseUrl}}/api/usage/token",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer {{apiKey}}",
      "User-Agent": "NexusKey/1.0"
    },
  },
  extractor: function (response) {
    if (response && response.data) {
      var d = response.data;
      if (d.unlimited_quota) {
        return {
          planName: d.name || "默认套餐",
          remaining: -1,
          total: -1,
          used: (d.total_used || 0) / 500000,
          unit: "USD",
        };
      }
      return {
        planName: d.name || "默认套餐",
        remaining: (d.total_available || 0) / 500000,
        used: (d.total_used || 0) / 500000,
        total: (d.total_granted || 0) / 500000,
        unit: "USD",
      };
    }
    return {
      isValid: false,
      invalidMessage: (response && response.message) || "查询失败"
    };
  },
})`;

/**
 * 判断脚本代码是否使用了已废弃的 `/api/user/self` 端点。
 * 旧版客户端把 New API 余额查询打在 `/api/user/self`，需要 system access token；
 * 新版统一改用 `/api/usage/token`，仅需 sk-xxx。该函数用于检测旧配置以触发自动迁移。
 */
export function isLegacyNewApiUserSelfScript(code: string | undefined): boolean {
  return typeof code === "string" && code.includes("/api/user/self");
}
