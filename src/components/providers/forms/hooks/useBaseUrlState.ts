import { useState, useCallback, useRef, useEffect } from "react";
import {
  extractCodexBaseUrl,
  setCodexBaseUrl as setCodexBaseUrlInConfig,
} from "@/utils/providerConfigUtils";
import type { ProviderCategory } from "@/types";
import type { AppId } from "@/lib/api";
import {
  normalizeLegacyNexuskeyGatewayUrl,
  normalizeLegacyNexuskeyInTomlFragment,
  normalizeNexuskeyAnthropicBaseUrl,
} from "@/utils/nexuskeyGatewayUrl";

interface UseBaseUrlStateProps {
  appType: AppId;
  category: ProviderCategory | undefined;
  settingsConfig: string;
  codexConfig?: string;
  onSettingsConfigChange: (config: string) => void;
  onCodexConfigChange?: (config: string) => void;
}

/**
 * 管理 Base URL 状态
 * 支持 Claude (JSON) 和 Codex (TOML) 两种格式
 */
export function useBaseUrlState({
  appType,
  category,
  settingsConfig,
  codexConfig,
  onSettingsConfigChange,
  onCodexConfigChange,
}: UseBaseUrlStateProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [codexBaseUrl, setCodexBaseUrl] = useState("");
  const [geminiBaseUrl, setGeminiBaseUrl] = useState("");
  const isUpdatingRef = useRef(false);

  // 从配置同步到 state（Claude）
  useEffect(() => {
    if (appType !== "claude") return;
    // 只有 official 类别不显示 Base URL 输入框，其他类别都需要回填
    if (category === "official") return;
    if (isUpdatingRef.current) return;

    try {
      const config = JSON.parse(settingsConfig || "{}");
      const envUrl: unknown = config?.env?.ANTHROPIC_BASE_URL;
      const raw = typeof envUrl === "string" ? envUrl.trim() : "";
      const nextUrl = raw ? normalizeNexuskeyAnthropicBaseUrl(raw) : "";
      if (raw && nextUrl !== raw) {
        if (!config.env) config.env = {};
        config.env.ANTHROPIC_BASE_URL = nextUrl;
        onSettingsConfigChange(JSON.stringify(config, null, 2));
        return;
      }
      if (nextUrl !== baseUrl) {
        setBaseUrl(nextUrl);
      }
    } catch {
      // ignore
    }
  }, [appType, category, settingsConfig, baseUrl, onSettingsConfigChange]);

  // 从配置同步到 state（Codex）
  useEffect(() => {
    if (appType !== "codex") return;
    // 只有 official 类别不显示 Base URL 输入框，其他类别都需要回填
    if (category === "official") return;
    if (isUpdatingRef.current) return;
    if (!codexConfig) return;

    const migrated = normalizeLegacyNexuskeyInTomlFragment(codexConfig);
    if (migrated !== codexConfig && onCodexConfigChange) {
      isUpdatingRef.current = true;
      onCodexConfigChange(migrated);
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
      return;
    }

    const extracted = extractCodexBaseUrl(codexConfig) || "";
    const display = extracted
      ? normalizeLegacyNexuskeyGatewayUrl(extracted)
      : "";
    const next = display || extracted;
    setCodexBaseUrl((prev) => (prev === next ? prev : next));
  }, [appType, category, codexConfig, onCodexConfigChange]);

  // 从Claude配置同步到 state（Gemini）
  useEffect(() => {
    if (appType !== "gemini") return;
    // 只有 official 类别不显示 Base URL 输入框，其他类别都需要回填
    if (category === "official") return;
    if (isUpdatingRef.current) return;

    try {
      const config = JSON.parse(settingsConfig || "{}");
      const envUrl: unknown = config?.env?.GOOGLE_GEMINI_BASE_URL;
      const raw = typeof envUrl === "string" ? envUrl.trim() : "";
      const nextUrl = raw ? normalizeLegacyNexuskeyGatewayUrl(raw) : "";
      if (raw && nextUrl !== raw) {
        if (!config.env) config.env = {};
        config.env.GOOGLE_GEMINI_BASE_URL = nextUrl;
        onSettingsConfigChange(JSON.stringify(config, null, 2));
        return;
      }
      if (nextUrl !== geminiBaseUrl) {
        setGeminiBaseUrl(nextUrl);
        setBaseUrl(nextUrl); // 也更新 baseUrl 用于 UI
      }
    } catch {
      // ignore
    }
  }, [appType, category, settingsConfig, geminiBaseUrl, onSettingsConfigChange]);

  // 处理 Claude Base URL 变化
  const handleClaudeBaseUrlChange = useCallback(
    (url: string) => {
      const sanitized = url.trim();
      setBaseUrl(sanitized);
      isUpdatingRef.current = true;

      try {
        const config = JSON.parse(settingsConfig || "{}");
        if (!config.env) {
          config.env = {};
        }
        config.env.ANTHROPIC_BASE_URL = sanitized;
        onSettingsConfigChange(JSON.stringify(config, null, 2));
      } catch {
        // ignore
      } finally {
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    },
    [settingsConfig, onSettingsConfigChange],
  );

  // 处理 Codex Base URL 变化
  const handleCodexBaseUrlChange = useCallback(
    (url: string) => {
      const sanitized = url.trim();
      setCodexBaseUrl(sanitized);

      if (!onCodexConfigChange) {
        return;
      }

      isUpdatingRef.current = true;
      const updatedConfig = setCodexBaseUrlInConfig(
        codexConfig || "",
        sanitized,
      );
      onCodexConfigChange(updatedConfig);

      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    },
    [codexConfig, onCodexConfigChange],
  );

  // 处理 Gemini Base URL 变化
  const handleGeminiBaseUrlChange = useCallback(
    (url: string) => {
      const sanitized = url.trim();
      setGeminiBaseUrl(sanitized);
      setBaseUrl(sanitized); // 也更新 baseUrl 用于 UI
      isUpdatingRef.current = true;

      try {
        const config = JSON.parse(settingsConfig || "{}");
        if (!config.env) {
          config.env = {};
        }
        config.env.GOOGLE_GEMINI_BASE_URL = sanitized;
        onSettingsConfigChange(JSON.stringify(config, null, 2));
      } catch {
        // ignore
      } finally {
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    },
    [settingsConfig, onSettingsConfigChange],
  );

  return {
    baseUrl,
    setBaseUrl,
    codexBaseUrl,
    setCodexBaseUrl,
    geminiBaseUrl,
    setGeminiBaseUrl,
    handleClaudeBaseUrlChange,
    handleCodexBaseUrlChange,
    handleGeminiBaseUrlChange,
  };
}
