// Managed provider seeding / UI integrations rely on this flag.
// Keep it ON so managed providers are visible by default.
export const MANAGED_MODE = true;

export const MANAGED_APP_TITLE = "NexusKey";

/**
 * 托管构建的 New API 控制面板根地址。用于「用量查询」简化模式下默认填入
 * Base URL 输入框，避免普通用户手动输入。
 *
 * - 未设置 `VITE_MANAGED_NEW_API_PANEL_URL` 时使用内置默认。
 * - 设为其它 HTTPS URL 则覆盖默认。
 */
export function getManagedNewApiPanelUrl(): string {
  const env = import.meta.env.VITE_MANAGED_NEW_API_PANEL_URL as
    | string
    | undefined;
  const trimmed = typeof env === "string" ? env.trim() : "";
  if (trimmed.length > 0) return trimmed.replace(/\/+$/, "");
  return "https://nexuskey.eu.cc";
}

/**
 * 托管构建中「充值」按钮打开的页面。
 * - 未设置 `VITE_MANAGED_RECHARGE_URL` 时使用内置默认链接。
 * - 在 `.env` 中将 `VITE_MANAGED_RECHARGE_URL=` 设为空字符串可隐藏充值入口。
 * - 设为其它 HTTPS URL 则覆盖默认。
 */
export function getManagedRechargeUrl(): string | null {
  const env = import.meta.env.VITE_MANAGED_RECHARGE_URL as string | undefined;
  if (env === "") return null;
  const trimmed = typeof env === "string" ? env.trim() : "";
  if (trimmed.length > 0) return trimmed;
  return "https://shop.zmfaka.cn/shop/C6TCO88D";
}

export function isManagedModeEnabled(): boolean {
  return MANAGED_MODE;
}
