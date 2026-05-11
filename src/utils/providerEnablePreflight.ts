import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { fetchModelsForConfig, showFetchModelsError } from "@/lib/api/model-fetch";
import { extractCodexBaseUrl } from "@/utils/providerConfigUtils";
import { providerPresets } from "@/config/claudeProviderPresets";
import {
  normalizeLegacyNexuskeyGatewayUrl,
  normalizeNexuskeyAnthropicBaseUrl,
} from "@/utils/nexuskeyGatewayUrl";

/** 使用 OpenAI 兼容 GET /v1/models 做启用前探活的应用 */
const PREFLIGHT_APPS: readonly AppId[] = [
  "claude",
  "codex",
  "gemini",
  "hermes",
];

function extractCredentials(
  provider: Provider,
  appId: AppId,
): { apiKey: string; baseUrl: string } {
  const config = provider.settingsConfig;
  if (!config || typeof config !== "object") {
    return { apiKey: "", baseUrl: "" };
  }
  if (appId === "claude") {
    const env = (config as { env?: Record<string, string> }).env || {};
    const apiKey =
      (typeof env.ANTHROPIC_AUTH_TOKEN === "string" && env.ANTHROPIC_AUTH_TOKEN) ||
      (typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY) ||
      "";
    const baseUrl =
      typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : "";
    const b = baseUrl.trim();
    return {
      apiKey: apiKey.trim(),
      baseUrl: b ? normalizeNexuskeyAnthropicBaseUrl(b) : "",
    };
  }
  if (appId === "codex") {
    const auth = (config as { auth?: { OPENAI_API_KEY?: string } }).auth || {};
    const configToml = (config as { config?: string }).config || "";
    const apiKey =
      typeof auth.OPENAI_API_KEY === "string" ? auth.OPENAI_API_KEY.trim() : "";
    const extracted = extractCodexBaseUrl(configToml) || "";
    const b = extracted.trim();
    return { apiKey, baseUrl: b ? normalizeLegacyNexuskeyGatewayUrl(b) : "" };
  }
  if (appId === "gemini") {
    const env = (config as { env?: Record<string, string> }).env || {};
    const apiKey =
      typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
    const baseUrl =
      typeof env.GOOGLE_GEMINI_BASE_URL === "string"
        ? env.GOOGLE_GEMINI_BASE_URL.trim()
        : "";
    return {
      apiKey,
      baseUrl: baseUrl ? normalizeLegacyNexuskeyGatewayUrl(baseUrl) : "",
    };
  }
  if (appId === "hermes") {
    const c = config as { api_key?: string; base_url?: string };
    const b =
      typeof c.base_url === "string" ? c.base_url.trim() : "";
    return {
      apiKey: typeof c.api_key === "string" ? c.api_key.trim() : "",
      baseUrl: b ? normalizeLegacyNexuskeyGatewayUrl(b) : "",
    };
  }
  return { apiKey: "", baseUrl: "" };
}

function claudeModelsUrlForBase(baseUrl: string): string | undefined {
  const preset = providerPresets.find((p) => {
    const env = (p.settingsConfig as { env?: { ANTHROPIC_BASE_URL?: string } })
      ?.env;
    return env?.ANTHROPIC_BASE_URL === baseUrl;
  });
  return preset?.modelsUrl;
}

/**
 * 点击「开启」前探活：请求 OpenAI 兼容模型列表；失败则不应写入当前供应商。
 */
export async function verifyProviderConnectionBeforeEnable(
  provider: Provider,
  appId: AppId,
  t: TFunction,
): Promise<boolean> {
  if (!PREFLIGHT_APPS.includes(appId)) {
    return true;
  }

  if (
    appId === "claude" &&
    provider.meta?.providerType === "github_copilot"
  ) {
    return true;
  }

  const { apiKey, baseUrl } = extractCredentials(provider, appId);

  if (!baseUrl) {
    toast.error(
      t("provider.enablePreflightMissingEndpoint", {
        defaultValue: "请先配置接入地址后再开启",
      }),
    );
    return false;
  }

  // Codex 官方通道可能无需 Key；无法用 /v1/models 验证时跳过
  if (!apiKey.trim() && provider.category === "official") {
    return true;
  }

  if (!apiKey.trim()) {
    toast.error(
      t("provider.enablePreflightMissingCreds", {
        defaultValue: "请先填写 API Key 后再开启",
      }),
    );
    return false;
  }

  const useFullUrl =
    appId === "claude" || appId === "codex"
      ? Boolean(provider.meta?.isFullUrl)
      : false;

  const modelsUrl =
    appId === "claude" ? claudeModelsUrlForBase(baseUrl) : undefined;

  const toastId = "provider-enable-preflight";

  try {
    toast.loading(
      t("provider.enablePreflightTesting", {
        defaultValue: "正在验证连接…",
      }),
      { id: toastId, duration: 60_000 },
    );
    await fetchModelsForConfig(baseUrl, apiKey, useFullUrl, modelsUrl);
    toast.dismiss(toastId);
    return true;
  } catch (err) {
    toast.dismiss(toastId);
    showFetchModelsError(err, t, { hasApiKey: true, hasBaseUrl: true });
    return false;
  }
}
