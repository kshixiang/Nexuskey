const NEXUSKEY_ROOT = "https://nexuskey.eu.cc";
const NEXUSKEY_ANTHROPIC_CLAUDE_PREFIX = `${NEXUSKEY_ROOT}/claude`;

/** 与后端 `normalize_legacy_nexuskey_gateway_url` 一致：旧网关并入官方入口 */
export function normalizeLegacyNexuskeyGatewayUrl(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  const oldHttps = "https://api.nexuskey.ai";
  const oldHttp = "http://api.nexuskey.ai";
  const next = "https://nexuskey.eu.cc";
  if (t.startsWith(oldHttps)) {
    const rest = t.slice(oldHttps.length);
    return rest ? `${next}${rest}` : next;
  }
  if (t.startsWith(oldHttp)) {
    const rest = t.slice(oldHttp.length);
    return rest ? `${next}${rest}` : next;
  }
  return t;
}

/** 官方 Anthropic Base URL 仅为根域名；去掉历史 `/claude` 路径（与后端一致） */
export function stripNexuskeyOfficialAnthropicClaudePath(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  if (
    t === NEXUSKEY_ANTHROPIC_CLAUDE_PREFIX ||
    t.startsWith(`${NEXUSKEY_ANTHROPIC_CLAUDE_PREFIX}/`)
  ) {
    return NEXUSKEY_ROOT;
  }
  return t;
}

/** 旧域名迁移 + 官方 Anthropic 入口折叠（与后端 `normalize_nexuskey_anthropic_base_url` 一致） */
export function normalizeNexuskeyAnthropicBaseUrl(url: string): string {
  return stripNexuskeyOfficialAnthropicClaudePath(
    normalizeLegacyNexuskeyGatewayUrl(url),
  );
}

/** Codex TOML 串中的旧域名与旧路径批量替换（与 Rust `normalize_legacy_nexuskey_in_toml_fragment` 一致） */
export function normalizeLegacyNexuskeyInTomlFragment(s: string): string {
  return s
    .replace(/https:\/\/api\.nexuskey\.ai/g, "https://nexuskey.eu.cc")
    .replace(/http:\/\/api\.nexuskey\.ai/g, "https://nexuskey.eu.cc")
    .replace(
      /https:\/\/nexuskey\.eu\.cc\/codex\/v1/g,
      "https://nexuskey.eu.cc/v1",
    );
}
