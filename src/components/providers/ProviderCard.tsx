import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProviderActions } from "@/components/providers/ProviderActions";
import { ProviderIcon } from "@/components/ProviderIcon";
import { isHermesReadOnlyProvider } from "@/config/hermesProviderPresets";
import { extractCodexBaseUrl } from "@/utils/providerConfigUtils";
import { isManagedModeEnabled } from "@/config/managedMode";

interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
}

interface ProviderCardProps {
  provider: Provider;
  isCurrent: boolean;
  appId: AppId;
  isInConfig?: boolean; // OpenCode: 是否已添加到 opencode.json
  isOmo?: boolean;
  isOmoSlim?: boolean;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onRemoveFromConfig?: (provider: Provider) => void;
  onDisableOmo?: () => void;
  onDisableOmoSlim?: () => void;
  onConfigureUsage: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onDuplicate: (provider: Provider) => void;
  onTest?: (provider: Provider) => void;
  onOpenTerminal?: (provider: Provider) => void;
  isTesting?: boolean;
  isProxyRunning: boolean;
  isProxyTakeover?: boolean; // 代理接管模式（Live配置已被接管，切换为热切换）
  dragHandleProps?: DragHandleProps;
  isAutoFailoverEnabled?: boolean; // 是否开启自动故障转移
  failoverPriority?: number; // 故障转移优先级（1 = P1, 2 = P2, ...）
  isInFailoverQueue?: boolean; // 是否在故障转移队列中
  onToggleFailover?: (enabled: boolean) => void; // 切换故障转移队列
  activeProviderId?: string; // 代理当前实际使用的供应商 ID（用于故障转移模式下标注绿色边框）
  // OpenClaw: default model
  isDefaultModel?: boolean;
  onSetAsDefault?: () => void;
}

/** 判断是否为官方供应商（无自定义 base URL / API key，直连官方 API） */
function isOfficialProvider(provider: Provider, appId: AppId): boolean {
  const config = provider.settingsConfig as Record<string, any>;
  if (appId === "claude") {
    const baseUrl = config?.env?.ANTHROPIC_BASE_URL;
    return !baseUrl || (typeof baseUrl === "string" && baseUrl.trim() === "");
  }
  if (appId === "codex") {
    // 无 OPENAI_API_KEY → 使用 Codex CLI 内置 OAuth（官方）
    const apiKey = config?.auth?.OPENAI_API_KEY;
    return !apiKey || (typeof apiKey === "string" && apiKey.trim() === "");
  }
  if (appId === "gemini") {
    // 无 GEMINI_API_KEY 且无 GOOGLE_GEMINI_BASE_URL → Google OAuth 官方模式
    const apiKey = config?.env?.GEMINI_API_KEY;
    const baseUrl = config?.env?.GOOGLE_GEMINI_BASE_URL;
    return (
      (!apiKey || (typeof apiKey === "string" && apiKey.trim() === "")) &&
      (!baseUrl || (typeof baseUrl === "string" && baseUrl.trim() === ""))
    );
  }
  return false;
}

const extractApiUrl = (provider: Provider, fallbackText: string) => {
  if (provider.notes?.trim()) {
    return provider.notes.trim();
  }

  if (provider.websiteUrl) {
    return provider.websiteUrl;
  }

  const config = provider.settingsConfig;

  if (config && typeof config === "object") {
    const envBase =
      (config as Record<string, any>)?.env?.ANTHROPIC_BASE_URL ||
      (config as Record<string, any>)?.env?.GOOGLE_GEMINI_BASE_URL;
    if (typeof envBase === "string" && envBase.trim()) {
      return envBase;
    }

    const baseUrl = (config as Record<string, any>)?.config;

    if (typeof baseUrl === "string" && baseUrl.includes("base_url")) {
      const extractedBaseUrl = extractCodexBaseUrl(baseUrl);
      if (extractedBaseUrl) {
        return extractedBaseUrl;
      }
    }
  }

  return fallbackText;
};

export function ProviderCard({
  provider,
  isCurrent,
  appId,
  isInConfig = true,
  isOmo = false,
  isOmoSlim = false,
  onSwitch,
  onEdit: _onEdit,
  onDelete: _onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onDisableOmoSlim,
  onConfigureUsage,
  onOpenWebsite,
  onDuplicate: _onDuplicate,
  onTest: _onTest,
  onOpenTerminal: _onOpenTerminal,
  isTesting: _isTesting,
  isProxyRunning: _isProxyRunning,
  isProxyTakeover = false,
  dragHandleProps,
  isAutoFailoverEnabled = false,
  failoverPriority: _failoverPriority,
  isInFailoverQueue = false,
  onToggleFailover,
  activeProviderId: _activeProviderId,
  isDefaultModel: _isDefaultModel,
  onSetAsDefault: _onSetAsDefault,
}: ProviderCardProps) {
  const { t } = useTranslation();

  // OMO and OMO Slim share the same card behavior
  const isAnyOmo = isOmo || isOmoSlim;
  const handleDisableAnyOmo = isOmoSlim ? onDisableOmoSlim : onDisableOmo;

  const fallbackUrlText = t("provider.notConfigured", {
    defaultValue: "未配置接口地址",
  });

  const displayUrl = useMemo(() => {
    return extractApiUrl(provider, fallbackUrlText);
  }, [provider, fallbackUrlText]);

  const isClickableUrl = useMemo(() => {
    if (provider.notes?.trim()) {
      return false;
    }
    if (displayUrl === fallbackUrlText) {
      return false;
    }
    return true;
  }, [provider.notes, displayUrl, fallbackUrlText]);

  const isOfficial = isOfficialProvider(provider, appId);
  const isOfficialBlockedByProxy =
    isProxyTakeover && (provider.category === "official" || isOfficial);
  const managedMode = isManagedModeEnabled();
  // Hermes v12+ overlay entries live under the `providers:` dict and are
  // read-only here — writes have to go through Hermes Web UI.
  const isHermesReadOnly =
    appId === "hermes" && isHermesReadOnlyProvider(provider.settingsConfig);

  const handleOpenWebsite = () => {
    if (!isClickableUrl) {
      return;
    }
    onOpenWebsite(displayUrl);
  };

  return (
    <div
      className={cn(
        "relative border-0 bg-transparent py-4 pl-3 pr-0 shadow-none transition-colors duration-200 sm:pl-4",
        "group text-card-foreground",
        dragHandleProps?.isDragging &&
          "cursor-grabbing z-10 rounded-md ring-1 ring-primary/50",
      )}
    >
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-transparent transition-transform duration-300 group-hover:scale-105">
            <ProviderIcon
              icon={provider.icon}
              name={provider.name}
              color={provider.iconColor}
              size={22}
            />
          </div>

          {!managedMode && (
            <div className="min-w-0 space-y-1">
              <h3 className="truncate text-lg font-semibold leading-none">
                {provider.name}
              </h3>
              {displayUrl && (
                <button
                  type="button"
                  onClick={handleOpenWebsite}
                  className={cn(
                    "inline-flex max-w-[320px] items-center text-sm transition-colors",
                    isClickableUrl
                      ? "cursor-pointer text-muted-foreground hover:text-foreground hover:underline"
                      : "cursor-default text-muted-foreground/70",
                  )}
                  title={displayUrl}
                  disabled={!isClickableUrl}
                >
                  <span className="truncate">{displayUrl}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {!managedMode && (
          <div className="flex shrink-0 flex-col items-end gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <ProviderActions
                appId={appId}
                isCurrent={isCurrent}
                isInConfig={isInConfig}
                isProxyTakeover={isProxyTakeover}
                isOfficialBlockedByProxy={isOfficialBlockedByProxy}
                isReadOnly={isHermesReadOnly}
                isOmo={isAnyOmo}
                onSwitch={() => onSwitch(provider)}
                onConfigureUsage={() => onConfigureUsage(provider)}
                onRemoveFromConfig={
                  onRemoveFromConfig
                    ? () => onRemoveFromConfig(provider)
                    : undefined
                }
                onDisableOmo={handleDisableAnyOmo}
                isAutoFailoverEnabled={isAutoFailoverEnabled}
                isInFailoverQueue={isInFailoverQueue}
                onToggleFailover={onToggleFailover}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
