import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Settings,
  ArrowLeft,
  Minus,
  Maximize2,
  Minimize2,
  X,
  RefreshCw,
  BarChart2,
  FolderArchive,
  Search,
  Power,
  Eye,
  EyeOff,
  Wallet,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Provider, UsageScript, VisibleApps } from "@/types";
import {
  NEW_API_BALANCE_SCRIPT,
  isLegacyNewApiUserSelfScript,
} from "@/lib/usageScriptTemplates";
import type { EnvConflict } from "@/types/env";
import { useProvidersQuery, useSettingsQuery } from "@/lib/query";
import {
  providersApi,
  settingsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { checkAllEnvConflicts, checkEnvConflicts } from "@/lib/api/env";
import { useProviderActions } from "@/hooks/useProviderActions";
import {
  useOpenClawDefaultModel,
  useOpenClawHealth,
  useOpenClawLiveProviderIds,
} from "@/hooks/useOpenClaw";
import {
  useHermesLiveProviderIds,
  useHermesModelConfig,
} from "@/hooks/useHermes";
import { hermesApi } from "@/lib/api/hermes";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useLastValidValue } from "@/hooks/useLastValidValue";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { cn } from "@/lib/utils";
import {
  isWindows,
  isLinux,
  DRAG_REGION_ATTR,
  DRAG_REGION_STYLE,
} from "@/lib/platform";
import { AppSwitcher } from "@/components/AppSwitcher";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { UpdateBadge } from "@/components/UpdateBadge";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";
import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import { SkillsPage } from "@/components/skills/SkillsPage";
import UnifiedSkillsPanel from "@/components/skills/UnifiedSkillsPanel";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "@/components/FirstRunNoticeDialog";
import { ManagedUsageCredentialsDialog } from "@/components/ManagedUsageCredentialsDialog";
import { CursorManualPanel } from "@/components/cursor/CursorManualPanel";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import { UniversalProviderPanel } from "@/components/universal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SessionManagerPage } from "@/components/sessions/SessionManagerPage";
import WorkspaceFilesPanel from "@/components/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/components/openclaw/EnvPanel";
import ToolsPanel from "@/components/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/components/openclaw/AgentsDefaultsPanel";
import OpenClawHealthBanner from "@/components/openclaw/OpenClawHealthBanner";
import HermesMemoryPanel from "@/components/hermes/HermesMemoryPanel";
import {
  getManagedNewApiPanelUrl,
  getManagedRechargeUrl,
  isManagedModeEnabled,
  MANAGED_APP_TITLE,
} from "@/config/managedMode";
import { useUsageSummary } from "@/lib/query/usage";
import { ManagedModelSelector } from "@/components/providers/ManagedModelSelector";
import { ProviderUsageLogPanel } from "@/components/providers/ProviderUsageLogPanel";
import { ProviderCapsuleControl } from "@/components/providers/ProviderCapsuleControl";
import {
  getApiKeyFromConfig,
  setApiKeyInConfig,
} from "@/utils/providerConfigUtils";
import { verifyProviderConnectionBeforeEnable } from "@/utils/providerEnablePreflight";

const APPS_WITH_DASHBOARD_API_KEY: readonly AppId[] = [
  "claude",
  "codex",
  "gemini",
  "hermes",
];

function readDashboardApiKey(
  settingsConfig: Provider["settingsConfig"],
  appId: AppId,
): string {
  if (!settingsConfig || typeof settingsConfig !== "object") return "";
  if (appId === "codex") {
    const auth = (settingsConfig as { auth?: { OPENAI_API_KEY?: unknown } })
      .auth;
    const k = auth?.OPENAI_API_KEY;
    return typeof k === "string" ? k : "";
  }
  return getApiKeyFromConfig(JSON.stringify(settingsConfig), appId);
}

function nextSettingsConfigWithApiKey(
  current: Provider["settingsConfig"],
  appId: AppId,
  apiKey: string,
  apiKeyField?: string,
): Record<string, unknown> {
  const base =
    current && typeof current === "object"
      ? (JSON.parse(JSON.stringify(current)) as Record<string, unknown>)
      : {};
  if (appId === "codex") {
    const prevAuth =
      typeof base.auth === "object" && base.auth !== null
        ? (base.auth as Record<string, unknown>)
        : {};
    return { ...base, auth: { ...prevAuth, OPENAI_API_KEY: apiKey } };
  }
  const json = setApiKeyInConfig(JSON.stringify(base), apiKey, {
    createIfMissing: true,
    appType: appId,
    apiKeyField,
  });
  return JSON.parse(json) as Record<string, unknown>;
}

type View =
  | "providers"
  | "settings"
  | "prompts"
  | "skills"
  | "skillsDiscovery"
  | "mcp"
  | "agents"
  | "universal"
  | "sessions"
  | "workspace"
  | "openclawEnv"
  | "openclawTools"
  | "openclawAgents"
  | "hermesMemory";

interface WebDavSyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const DEFAULT_DRAG_BAR_HEIGHT = isWindows() || isLinux() ? 0 : 28; // px
const HEADER_HEIGHT = 64; // px

const STORAGE_KEY = "nexuskey-last-app";
const VALID_APPS: AppId[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
  "cursor",
];

const getInitialApp = (): AppId => {
  const saved = localStorage.getItem(STORAGE_KEY) as AppId | null;
  if (saved && VALID_APPS.includes(saved)) {
    return saved;
  }
  return "claude";
};

const VIEW_STORAGE_KEY = "nexuskey-last-view";
const VALID_VIEWS: View[] = [
  "providers",
  "settings",
  "prompts",
  "skills",
  "skillsDiscovery",
  "mcp",
  "agents",
  "universal",
  "sessions",
  "workspace",
  "openclawEnv",
  "openclawTools",
  "openclawAgents",
  "hermesMemory",
];

const getInitialView = (): View => {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
  if (saved && VALID_VIEWS.includes(saved)) {
    return saved;
  }
  return "providers";
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const managedMode = isManagedModeEnabled();
  const managedRechargeUrl = managedMode ? getManagedRechargeUrl() : null;

  const [activeApp, setActiveApp] = useState<AppId>(getInitialApp);
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  /** 托管主页：在请求日志区域 iframe 嵌入充值页（顶栏按钮触发） */
  const [showManagedRechargeEmbed, setShowManagedRechargeEmbed] =
    useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  useEffect(() => {
    setShowManagedRechargeEmbed(false);
  }, [currentView, activeApp]);

  const { data: settingsData } = useSettingsQuery();
  const useAppWindowControls =
    isLinux() && (settingsData?.useAppWindowControls ?? false);
  const dragBarHeight = useAppWindowControls ? 32 : DEFAULT_DRAG_BAR_HEIGHT;
  const contentTopOffset = dragBarHeight + HEADER_HEIGHT;
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    codex: true,
    gemini: true,
    opencode: true,
    openclaw: true,
    hermes: true,
    cursor: true,
  };

  const getFirstVisibleApp = (): AppId => {
    if (visibleApps.claude) return "claude";
    if (visibleApps.codex) return "codex";
    if (visibleApps.gemini) return "gemini";
    if (visibleApps.opencode) return "opencode";
    if (visibleApps.openclaw) return "openclaw";
    if (visibleApps.hermes) return "hermes";
    if (visibleApps.cursor) return "cursor";
    return "claude"; // fallback
  };

  useEffect(() => {
    if (!visibleApps[activeApp]) {
      setActiveApp(getFirstVisibleApp());
    }
  }, [visibleApps, activeApp]);

  // Fallback from sessions view when switching to an app without session support
  useEffect(() => {
    if (
      currentView === "sessions" &&
      activeApp !== "claude" &&
      activeApp !== "codex" &&
      activeApp !== "opencode" &&
      activeApp !== "openclaw" &&
      activeApp !== "gemini" &&
      activeApp !== "hermes"
    ) {
      setCurrentView("providers");
    }
  }, [activeApp, currentView]);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  useUsageCacheBridge();

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);

  const { isRunning: isProxyRunning, takeoverStatus } = useProxyStatus();
  const isCurrentAppTakeoverActive = takeoverStatus?.[activeApp] || false;
  const { data, refetch } = useProvidersQuery(activeApp, {
    isProxyRunning,
  });
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const isOpenClawView =
    activeApp === "openclaw" &&
    (currentView === "providers" ||
      currentView === "workspace" ||
      currentView === "sessions" ||
      currentView === "openclawEnv" ||
      currentView === "openclawTools" ||
      currentView === "openclawAgents");
  const { data: openclawHealthWarnings = [] } =
    useOpenClawHealth(isOpenClawView);
  const { data: opencodeLiveIds } = useQuery({
    queryKey: ["opencodeLiveProviderIds"],
    queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
    enabled: currentView === "providers" && activeApp === "opencode",
  });
  useOpenClawLiveProviderIds(
    currentView === "providers" && activeApp === "openclaw",
  );
  const { data: openclawDefaultModel } = useOpenClawDefaultModel(
    currentView === "providers" && activeApp === "openclaw",
  );
  const { data: hermesLiveIds } = useHermesLiveProviderIds(
    currentView === "providers" && activeApp === "hermes",
  );
  const { data: hermesModelConfig } = useHermesModelConfig(
    currentView === "providers" && activeApp === "hermes",
  );

  const {
    addProvider,
    updateProvider,
    switchProvider,
    saveUsageScript,
    isLoading: isProviderActionLoading,
  } = useProviderActions(
    activeApp,
    isProxyRunning,
    isProxyRunning && isCurrentAppTakeoverActive,
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unsubscribe = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            if (event.appType === activeApp) {
              await refetch();
            }
          },
        );
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    setupListener();
    return () => {
      unsubscribe?.();
    };
  }, [activeApp, refetch]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unsubscribe = await listen("universal-provider-synced", async () => {
          await queryClient.invalidateQueries({ queryKey: ["providers"] });
          try {
            await providersApi.updateTrayMenu();
          } catch (error) {
            console.error("[App] Failed to update tray menu", error);
          }
        });
      } catch (error) {
        console.error(
          "[App] Failed to subscribe universal-provider-synced event",
          error,
        );
      }
    };

    setupListener();
    return () => {
      unsubscribe?.();
    };
  }, [queryClient]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setupListener = async () => {
      try {
        const off = await listen(
          "webdav-sync-status-updated",
          async (event) => {
            const payload = (event.payload ??
              {}) as WebDavSyncStatusUpdatedPayload;
            await queryClient.invalidateQueries({ queryKey: ["settings"] });

            if (payload.source !== "auto" || payload.status !== "error") {
              return;
            }

            toast.error(
              t("settings.webdavSync.autoSyncFailedToast", {
                error: payload.error || t("common.unknown"),
              }),
            );
          },
        );
        if (!active) {
          off();
          return;
        }
        unsubscribe = off;
      } catch (error) {
        console.error(
          "[App] Failed to subscribe webdav-sync-status-updated event",
          error,
        );
      }
    };

    void setupListener();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [queryClient, t]);

  // Listen for proxy-official-warning: warn when takeover is enabled with an official provider
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      unsubscribe = await listen("proxy-official-warning", (event) => {
        const { providerName } = event.payload as {
          appType: string;
          providerName: string;
        };
        toast.warning(
          t("notifications.proxyOfficialWarning", {
            name: providerName,
            defaultValue: `当前供应商 ${providerName} 是官方供应商，建议切换到第三方供应商后再使用代理接管`,
          }),
          { duration: 8000 },
        );
      });
    };

    void setup();
    return () => {
      unsubscribe?.();
    };
  }, [t]);

  useEffect(() => {
    let active = true;
    let unlistenResize: (() => void) | undefined;

    const setupWindowStateSync = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const syncWindowMaximizedState = async () => {
          const maximized = await currentWindow.isMaximized();
          if (active) {
            setIsWindowMaximized(maximized);
          }
        };

        await syncWindowMaximizedState();
        unlistenResize = await currentWindow.onResized(() => {
          void syncWindowMaximizedState();
        });
      } catch (error) {
        console.error("[App] Failed to sync window maximized state", error);
      }
    };

    void setupWindowStateSync();
    return () => {
      active = false;
      unlistenResize?.();
    };
  }, []);

  useEffect(() => {
    // settingsData 未加载时跳过，避免用 fallback false 覆盖 Rust 侧已设好的装饰状态
    if (!settingsData) return;

    const syncWindowDecorations = async () => {
      try {
        await getCurrentWindow().setDecorations(!useAppWindowControls);
      } catch (error) {
        console.error("[App] Failed to update window decorations", error);
      }
    };

    void syncWindowDecorations();
  }, [useAppWindowControls, settingsData]);

  useEffect(() => {
    const checkEnvOnStartup = async () => {
      try {
        const allConflicts = await checkAllEnvConflicts();
        const flatConflicts = Object.values(allConflicts).flat();

        if (flatConflicts.length > 0) {
          setEnvConflicts(flatConflicts);
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on startup:",
          error,
        );
      }
    };

    checkEnvOnStartup();
  }, []);

  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
            { closeButton: true },
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  useEffect(() => {
    const checkSkillsMigration = async () => {
      try {
        const result = await invoke<{ count: number; error?: string } | null>(
          "get_skills_migration_result",
        );
        if (result?.error) {
          toast.error(t("migration.skillsFailed"), {
            description: t("migration.skillsFailedDescription"),
            closeButton: true,
          });
          console.error("[App] Skills SSOT migration failed:", result.error);
          return;
        }
        if (result && result.count > 0) {
          toast.success(t("migration.skillsSuccess", { count: result.count }), {
            closeButton: true,
          });
          await queryClient.invalidateQueries({ queryKey: ["skills"] });
        }
      } catch (error) {
        console.error("[App] Failed to check skills migration result:", error);
      }
    };

    checkSkillsMigration();
  }, [t, queryClient]);

  useEffect(() => {
    const checkEnvOnSwitch = async () => {
      try {
        const conflicts = await checkEnvConflicts(activeApp);

        if (conflicts.length > 0) {
          setEnvConflicts((prev) => {
            const existingKeys = new Set(
              prev.map((c) => `${c.varName}:${c.sourcePath}`),
            );
            const newConflicts = conflicts.filter(
              (c) => !existingKeys.has(`${c.varName}:${c.sourcePath}`),
            );
            return [...prev, ...newConflicts];
          });
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on app switch:",
          error,
        );
      }
    };

    checkEnvOnSwitch();
  }, [activeApp]);

  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCurrentView("settings");
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) return;

      if (document.body.style.overflow === "hidden") return;

      const view = currentViewRef.current;
      if (view === "providers") return;

      if (isTextEditableTarget(event.target)) return;

      event.preventDefault();
      setCurrentView(view === "skillsDiscovery" ? "skills" : "providers");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [launchDashboardOpen, setLaunchDashboardOpen] = useState(false);

  const handleEditProvider = async ({
    provider,
    originalId,
  }: {
    provider: Provider;
    originalId?: string;
  }) => {
    await updateProvider(provider, originalId);
    setEditingProvider(null);
  };

  const handleImportSuccess = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: ["providers"],
        refetchType: "all",
      });
      await queryClient.refetchQueries({
        queryKey: ["providers"],
        type: "all",
      });
    } catch (error) {
      console.error("[App] Failed to refresh providers after import", error);
      await refetch();
    }
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const providerEntries = useMemo(
    () =>
      Object.values(providers).sort((a, b) => {
        const left = a.sortIndex ?? Number.MAX_SAFE_INTEGER;
        const right = b.sortIndex ?? Number.MAX_SAFE_INTEGER;
        if (left !== right) return left - right;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      }),
    [providers],
  );

  const primaryProvider = useMemo(() => {
    if (providerEntries.length === 0) return null;

    if (activeApp === "opencode") {
      const currentOmoProvider =
        providerEntries.find((provider) => provider.id === currentProviderId) ??
        providerEntries[0];
      return currentOmoProvider;
    }

    if (currentProviderId) {
      const currentProvider = providerEntries.find(
        (provider) => provider.id === currentProviderId,
      );
      if (currentProvider) return currentProvider;
    }

    return providerEntries[0];
  }, [activeApp, currentProviderId, providerEntries]);

  const primaryProviderName =
    primaryProvider?.name ?? t(`apps.${activeApp}`, { defaultValue: activeApp });

  const primaryProviderActive = useMemo(() => {
    if (!primaryProvider) return false;

    if (activeApp === "opencode") {
      return (
        primaryProvider.id === currentProviderId ||
        (opencodeLiveIds?.includes(primaryProvider.id) ?? false)
      );
    }

    if (activeApp === "openclaw") {
      return (
        openclawDefaultModel?.primary?.startsWith(`${primaryProvider.id}/`) ??
        false
      );
    }

    if (activeApp === "hermes") {
      return (
        hermesModelConfig?.provider === primaryProvider.id ||
        (hermesLiveIds?.includes(primaryProvider.id) ?? false)
      );
    }

    return primaryProvider.id === currentProviderId;
  }, [
    activeApp,
    currentProviderId,
    hermesLiveIds,
    hermesModelConfig?.provider,
    opencodeLiveIds,
    openclawDefaultModel?.primary,
    primaryProvider,
  ]);
  const usageRange = useMemo(
    () => ({ preset: "30d" as const }),
    [],
  );
  const { data: usageSummary } = useUsageSummary(usageRange, activeApp, {
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
  const totalConsumedTokens = useMemo(() => {
    if (!usageSummary) return 0;
    return (
      (usageSummary.totalInputTokens ?? 0) +
      (usageSummary.totalOutputTokens ?? 0) +
      (usageSummary.totalCacheCreationTokens ?? 0) +
      (usageSummary.totalCacheReadTokens ?? 0)
    );
  }, [usageSummary]);
  const usageRangeToday = useMemo(
    () => ({ preset: "today" as const }),
    [],
  );
  const { data: usageSummaryToday } = useUsageSummary(
    usageRangeToday,
    activeApp,
    {
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
  );
  const todayConsumedTokens = useMemo(() => {
    if (!usageSummaryToday) return 0;
    return (
      (usageSummaryToday.totalInputTokens ?? 0) +
      (usageSummaryToday.totalOutputTokens ?? 0) +
      (usageSummaryToday.totalCacheCreationTokens ?? 0) +
      (usageSummaryToday.totalCacheReadTokens ?? 0)
    );
  }, [usageSummaryToday]);
  // 记录当前会话已经触发过自动迁移的供应商 ID，避免「写入 -> 触发依赖更新
  // -> 再次写入」循环；保存失败也不会无限重试，由用户手动 Modal 兜底。
  const autoEnabledProviderIdsRef = useRef<Set<string>>(new Set());
  /** 主页「开启」：GET /v1/models 探活进行中 */
  const [enablePreflighting, setEnablePreflighting] = useState(false);

  const persistedDashboardApiKey = useMemo(() => {
    if (!primaryProvider) return "";
    return readDashboardApiKey(primaryProvider.settingsConfig, activeApp);
  }, [primaryProvider, activeApp]);

  const [dashboardApiKeyDraft, setDashboardApiKeyDraft] = useState("");
  const [dashboardApiKeyVisible, setDashboardApiKeyVisible] = useState(false);
  useEffect(() => {
    setDashboardApiKeyDraft(persistedDashboardApiKey);
  }, [persistedDashboardApiKey, primaryProvider?.id]);

  // managed 模式下：用户在主界面填了真实 sk-xxx 后应当「秒看余额」，不该再要求
  // 他点开「用量查询」面板手动启用。在以下两种情况下静默写入一份默认的 New
  // API 余额脚本（enabled: true）：
  //   1) provider 完全没有 usage_script
  //   2) 旧用户的 usage_script 卡在 `/api/user/self`（旧版本 New API 模板）
  // 两种都是「不可能正常工作」的状态，自动迁移不会破坏用户已表达的意图。
  useEffect(() => {
    if (!managedMode || !primaryProvider) return;
    if (!persistedDashboardApiKey) return;
    if (
      persistedDashboardApiKey === "YOUR_NEXUSKEY_API_KEY" ||
      persistedDashboardApiKey.startsWith("YOUR_")
    )
      return;

    const existing = primaryProvider.meta?.usage_script;
    const isMissing = !existing;
    const isLegacyNewApi =
      existing?.templateType === "newapi" &&
      isLegacyNewApiUserSelfScript(existing?.code);

    if (!isMissing && !isLegacyNewApi) return;
    if (autoEnabledProviderIdsRef.current.has(primaryProvider.id)) return;
    autoEnabledProviderIdsRef.current.add(primaryProvider.id);

    const next: UsageScript = {
      enabled: true,
      language: "javascript",
      code: NEW_API_BALANCE_SCRIPT,
      templateType: "newapi",
      baseUrl: getManagedNewApiPanelUrl() || existing?.baseUrl || undefined,
      timeout: existing?.timeout ?? 10,
      autoQueryInterval: existing?.autoQueryInterval ?? 5,
    };

    void (async () => {
      try {
        if (isManagedModeEnabled()) {
          await providersApi.patchUsageScript(
            primaryProvider.id,
            next,
            activeApp,
          );
        } else {
          const updated: Provider = {
            ...primaryProvider,
            meta: {
              ...primaryProvider.meta,
              usage_script: next,
            },
          };
          await providersApi.update(updated, activeApp);
        }
        await queryClient.invalidateQueries({
          queryKey: ["providers", activeApp],
        });
        await queryClient.invalidateQueries({
          queryKey: ["usage", primaryProvider.id, activeApp],
        });
      } catch (err) {
        console.warn("[balance] auto-enable usage script failed", err);
        autoEnabledProviderIdsRef.current.delete(primaryProvider.id);
      }
    })();
  }, [
    managedMode,
    primaryProvider,
    persistedDashboardApiKey,
    activeApp,
    queryClient,
  ]);

  const showDashboardApiKey =
    Boolean(primaryProvider) &&
    APPS_WITH_DASHBOARD_API_KEY.includes(activeApp);

  const flushDashboardApiKey = useCallback(async () => {
    if (!primaryProvider || !showDashboardApiKey) return;
    if (dashboardApiKeyDraft === persistedDashboardApiKey) return;
    try {
      const nextConfig = nextSettingsConfigWithApiKey(
        primaryProvider.settingsConfig,
        activeApp,
        dashboardApiKeyDraft,
        typeof primaryProvider.meta?.apiKeyField === "string"
          ? primaryProvider.meta.apiKeyField
          : undefined,
      );
      if (isManagedModeEnabled()) {
        await providersApi.patchSettingsConfig(
          primaryProvider.id,
          nextConfig,
          activeApp,
        );
        try {
          await providersApi.updateTrayMenu();
        } catch (trayErr) {
          console.error(
            "Failed to update tray menu after dashboard API key save",
            trayErr,
          );
        }
      } else {
        await updateProvider(
          { ...primaryProvider, settingsConfig: nextConfig },
          primaryProvider.id,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["providers", activeApp] });
      await queryClient.invalidateQueries({
        queryKey: ["managed-model-state", activeApp],
      });
      toast.success(
        t("provider.apiKeySaved", { defaultValue: "API Key 已保存" }),
        { duration: 2500 },
      );
    } catch (e) {
      toast.error(
        t("provider.apiKeySaveFailed", {
          defaultValue: "保存失败：{{error}}",
          error: extractErrorMessage(e),
        }),
      );
    }
  }, [
    primaryProvider,
    showDashboardApiKey,
    dashboardApiKeyDraft,
    persistedDashboardApiKey,
    activeApp,
    updateProvider,
    queryClient,
    t,
  ]);

  const notifyWindowControlError = (error: unknown) => {
    toast.error(
      t("notifications.windowControlFailed", {
        defaultValue: "窗口控制失败：{{error}}",
        error: extractErrorMessage(error),
      }),
    );
  };

  const handleWindowMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("[App] Failed to minimize window", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowToggleMaximize = async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.toggleMaximize();
      setIsWindowMaximized(await currentWindow.isMaximized());
    } catch (error) {
      console.error("[App] Failed to toggle maximize", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[App] Failed to close window", error);
      notifyWindowControlError(error);
    }
  };

  const renderContent = () => {
    const content = (() => {
      switch (currentView) {
        case "settings":
          return (
            <SettingsPage
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              onImportSuccess={handleImportSuccess}
              defaultTab={settingsDefaultTab}
            />
          );
        case "prompts":
          return (
            <PromptPanel
              ref={promptPanelRef}
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              appId={activeApp}
            />
          );
        case "hermesMemory":
          return <HermesMemoryPanel />;
        case "skills":
          return (
            <UnifiedSkillsPanel
              ref={unifiedSkillsPanelRef}
              onOpenDiscovery={() => setCurrentView("skillsDiscovery")}
              currentApp={activeApp === "openclaw" ? "claude" : activeApp}
            />
          );
        case "skillsDiscovery":
          return (
            <SkillsPage
              ref={skillsPageRef}
              initialApp={activeApp === "openclaw" ? "claude" : activeApp}
            />
          );
        case "mcp":
          return (
            <UnifiedMcpPanel
              ref={mcpPanelRef}
              onOpenChange={() => setCurrentView("providers")}
            />
          );
        case "agents":
          return (
            <AgentsPanel onOpenChange={() => setCurrentView("providers")} />
          );
        case "universal":
          return (
            <div className="px-6 pt-4">
              <UniversalProviderPanel />
            </div>
          );

        case "sessions":
          return <SessionManagerPage key={activeApp} appId={activeApp} />;
        case "workspace":
          return <WorkspaceFilesPanel />;
        case "openclawEnv":
          return <EnvPanel />;
        case "openclawTools":
          return <ToolsPanel />;
        case "openclawAgents":
          return <AgentsDefaultsPanel />;
        default:
          if (activeApp === "cursor") {
            return (
              <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
                <AppSwitcher
                  activeApp={activeApp}
                  onSwitch={setActiveApp}
                  visibleApps={visibleApps}
                />
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
                    <CursorManualPanel />
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
              <AppSwitcher
                activeApp={activeApp}
                onSwitch={setActiveApp}
                visibleApps={visibleApps}
              />
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {showManagedRechargeEmbed &&
                managedRechargeUrl &&
                managedMode ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 sm:px-6">
                      <span className="text-sm font-medium">
                        {t("common.recharge")}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={async () => {
                            try {
                              await settingsApi.openExternal(managedRechargeUrl);
                            } catch (e) {
                              toast.error(
                                `${t("notifications.openLinkFailed")}: ${extractErrorMessage(e)}`,
                              );
                            }
                          }}
                        >
                          {t("common.openInBrowser")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => setShowManagedRechargeEmbed(false)}
                        >
                          {t("common.back")}
                        </Button>
                      </div>
                    </div>
                    <iframe
                      src={managedRechargeUrl}
                      title={t("common.recharge")}
                      className="min-h-0 w-full flex-1 border-0 bg-background"
                    />
                  </div>
                ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
                  <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col xl:max-w-5xl">
                  <div key={activeApp} className="flex min-h-0 flex-1 flex-col gap-5">
                      <section className="shrink-0 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground">
                            {t(`apps.${activeApp}`, { defaultValue: activeApp }).toUpperCase()}
                          </span>

                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <h2 className="min-w-0 truncate text-[20px] font-semibold leading-tight text-foreground sm:text-[22px]">
                              {primaryProviderName}
                            </h2>
                            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/90">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  primaryProviderActive
                                    ? "bg-primary"
                                    : "bg-muted-foreground/35",
                                )}
                              />
                              {primaryProviderActive
                                ? t("provider.enabledOn", { defaultValue: "已开启" })
                                : t("provider.enabledOff", { defaultValue: "未开启" })}
                            </span>
                          </div>

                          {!managedMode && (
                            <Button
                              onClick={() => setIsAddOpen(true)}
                              size="sm"
                              className="rounded-full"
                            >
                              <Plus className="mr-1.5 h-4 w-4" />
                              {t("provider.addProvider", { defaultValue: "添加" })}
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                            <div className="text-xs text-muted-foreground">
                              {t("usage.totalTokens", { defaultValue: "总Token数" })}
                            </div>
                            <div className="mt-2 text-[22px] font-semibold tabular-nums text-foreground">
                              {totalConsumedTokens.toLocaleString()}
                            </div>
                          </div>

                          <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
                            <div className="text-xs text-muted-foreground">
                              {t("usage.todayTokens", { defaultValue: "今日用量" })}
                            </div>
                            <div className="mt-2 text-[22px] font-semibold tabular-nums text-foreground">
                              {todayConsumedTokens.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/80 bg-card px-4 py-4">
                          <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3">
                            {showDashboardApiKey && primaryProvider ? (
                              <div className="col-span-2 flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                  <label
                                    htmlFor="dashboard-api-key"
                                    className="text-xs font-medium text-muted-foreground"
                                  >
                                    {t("provider.apiKeyLabel", {
                                      defaultValue: "API Key",
                                    })}
                                  </label>
                                  <div className="relative w-full max-w-full sm:max-w-[min(100%,360px)]">
                                    <Input
                                      id="dashboard-api-key"
                                      type={
                                        dashboardApiKeyVisible
                                          ? "text"
                                          : "password"
                                      }
                                      name="dashboard-api-key"
                                      autoComplete="off"
                                      spellCheck={false}
                                      placeholder={t("apiKeyInput.placeholder")}
                                      className="h-9 w-full pr-10 font-mono text-xs"
                                      value={dashboardApiKeyDraft}
                                      onChange={(e) =>
                                        setDashboardApiKeyDraft(e.target.value)
                                      }
                                      onBlur={() => {
                                        void flushDashboardApiKey();
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.currentTarget.blur();
                                        }
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="absolute right-0 top-0 h-9 px-3 hover:bg-transparent"
                                      tabIndex={-1}
                                      aria-label={
                                        dashboardApiKeyVisible
                                          ? t("apiKeyInput.hide")
                                          : t("apiKeyInput.show")
                                      }
                                      onClick={() =>
                                        setDashboardApiKeyVisible((v) => !v)
                                      }
                                    >
                                      {dashboardApiKeyVisible ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t("provider.modelLabel", {
                                      defaultValue: "模型",
                                    })}
                                  </span>
                                  <ManagedModelSelector
                                    appId={activeApp}
                                    providerId={primaryProvider.id}
                                    hideLabel
                                    className="w-full min-w-[200px] sm:w-auto sm:max-w-[min(100%,360px)]"
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="pt-2 text-xs font-medium text-muted-foreground">
                                  {t("provider.modelLabel", {
                                    defaultValue: "模型",
                                  })}
                                </div>
                                <div className="flex w-full min-w-0 flex-col items-stretch justify-end gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                                  {primaryProvider ? (
                                    <ManagedModelSelector
                                      appId={activeApp}
                                      providerId={primaryProvider.id}
                                      hideLabel
                                      className="w-full min-w-[200px] sm:max-w-[min(100%,360px)] sm:w-auto"
                                    />
                                  ) : null}
                                </div>
                              </>
                            )}

                            <div className="text-xs font-medium text-muted-foreground">
                              {t("provider.actions", { defaultValue: "操作" })}
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <ProviderCapsuleControl
                                active={primaryProviderActive}
                                label={
                                  primaryProviderActive
                                    ? t("common.close", {
                                        defaultValue: "关闭",
                                      })
                                    : t("provider.enableToggle", {
                                        defaultValue: "开启",
                                      })
                                }
                                icon={Power}
                                disabled={
                                  !primaryProvider ||
                                  enablePreflighting ||
                                  isProviderActionLoading
                                }
                                onClick={async () => {
                                  if (!primaryProvider) return;
                                  if (primaryProviderActive) {
                                    try {
                                      await providersApi.clearCurrent(activeApp);
                                      await queryClient.invalidateQueries({
                                        queryKey: ["providers", activeApp],
                                      });
                                      await queryClient.invalidateQueries({
                                        queryKey: ["currentProviderId", activeApp],
                                      });
                                    } catch (e) {
                                      toast.error(
                                        t("provider.disableFailed", {
                                          defaultValue: "关闭失败：{{error}}",
                                          error: extractErrorMessage(e),
                                        }),
                                      );
                                    }
                                  } else {
                                    setEnablePreflighting(true);
                                    try {
                                      const ok =
                                        await verifyProviderConnectionBeforeEnable(
                                          primaryProvider,
                                          activeApp,
                                          t,
                                        );
                                      if (!ok) return;
                                      await switchProvider(primaryProvider);
                                    } finally {
                                      setEnablePreflighting(false);
                                    }
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </section>

                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <ProviderUsageLogPanel appId={activeApp} />
                      </div>
                  </div>
                  </div>
                </div>
                )}
              </div>
            </div>
          );
      }
    })();

    return (
      <div key={currentView} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {content}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30"
      style={{ overflowX: "hidden", paddingTop: contentTopOffset }}
    >
      {(dragBarHeight > 0 || useAppWindowControls) && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-end px-2"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag", height: dragBarHeight } as any}
        >
          {useAppWindowControls && (
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowMinimize()}
                title={t("header.windowMinimize")}
                className="h-7 w-7"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowToggleMaximize()}
                title={
                  isWindowMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                className="h-7 w-7"
              >
                {isWindowMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowClose()}
                title={t("header.windowClose")}
                className="h-7 w-7 hover:bg-red-500/15 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      {showEnvBanner && envConflicts.length > 0 && (
        <EnvWarningBanner
          conflicts={envConflicts}
          onDismiss={() => {
            setShowEnvBanner(false);
            sessionStorage.setItem("env_banner_dismissed", "true");
          }}
          onDeleted={async () => {
            try {
              const allConflicts = await checkAllEnvConflicts();
              const flatConflicts = Object.values(allConflicts).flat();
              setEnvConflicts(flatConflicts);
              if (flatConflicts.length === 0) {
                setShowEnvBanner(false);
              }
            } catch (error) {
              console.error(
                "[App] Failed to re-check conflicts after deletion:",
                error,
              );
            }
          }}
        />
      )}

      <header
        className="fixed z-50 w-full border-b border-border bg-background/90 backdrop-blur-md transition-colors duration-300 supports-[backdrop-filter]:bg-background/75"
        {...DRAG_REGION_ATTR}
        style={
          {
            ...DRAG_REGION_STYLE,
            top: dragBarHeight,
            height: HEADER_HEIGHT,
          } as any
        }
      >
        <div
          className="flex h-full items-center justify-between gap-2 px-4 sm:px-6"
          {...DRAG_REGION_ATTR}
          style={{ ...DRAG_REGION_STYLE } as any}
        >
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: "no-drag" } as any}
          >
            {currentView !== "providers" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setCurrentView(
                      currentView === "skillsDiscovery"
                        ? "skills"
                        : "providers",
                    )
                  }
                  className="mr-2 rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-lg font-semibold">
                  {currentView === "settings" && t("settings.title")}
                  {currentView === "prompts" &&
                    t("prompts.title", { appName: t(`apps.${activeApp}`) })}
                  {currentView === "skills" && t("skills.title")}
                  {currentView === "skillsDiscovery" && t("skills.title")}
                  {currentView === "mcp" && t("mcp.unifiedPanel.title")}
                  {currentView === "agents" && t("agents.title")}
                  {currentView === "universal" &&
                    t("universalProvider.title", {
                      defaultValue: "统一供应商",
                    })}
                  {currentView === "sessions" && t("sessionManager.title")}
                  {currentView === "workspace" && t("workspace.title")}
                  {currentView === "openclawEnv" && t("openclaw.env.title")}
                  {currentView === "openclawTools" && t("openclaw.tools.title")}
                  {currentView === "openclawAgents" &&
                    t("openclaw.agents.title")}
                  {currentView === "hermesMemory" && t("hermes.memory.title")}
                </h1>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative inline-flex items-center">
                  <a
                    href="https://github.com/SQAI/Nexuskey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "text-xl font-semibold transition-colors",
                      isProxyRunning && isCurrentAppTakeoverActive
                        ? "text-emerald-400 hover:text-emerald-300"
                        : "text-primary hover:text-primary/85",
                    )}
                  >
                    {managedMode ? MANAGED_APP_TITLE : "NexusKey"}
                  </a>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSettingsDefaultTab("general");
                    setCurrentView("settings");
                  }}
                  title={t("common.settings")}
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <UpdateBadge
                  onClick={() => {
                    setSettingsDefaultTab("about");
                    setCurrentView("settings");
                  }}
                />
                {managedRechargeUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1 rounded-lg px-2 sm:px-3"
                    title={t("common.recharge")}
                    onClick={() => setShowManagedRechargeEmbed(true)}
                  >
                    <Wallet className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">
                      {t("common.recharge")}
                    </span>
                  </Button>
                ) : null}
                {isCurrentAppTakeoverActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSettingsDefaultTab("usage");
                      setCurrentView("settings");
                    }}
                    title={t("usage.title", {
                      defaultValue: "使用统计",
                    })}
                  >
                    <BarChart2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-1 min-w-0 items-center justify-end gap-2">
            {currentView === "providers" &&
              activeApp !== "opencode" &&
              activeApp !== "openclaw" &&
              activeApp !== "hermes" && (
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  {settingsData?.enableLocalProxy && (
                    <ProxyToggle activeApp={activeApp} />
                  )}
                  {settingsData?.enableFailoverToggle && (
                    <FailoverToggle activeApp={activeApp} />
                  )}
                </div>
              )}
            <div
              className="flex min-w-0 items-center gap-2 py-4 pr-2"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              {currentView === "skillsDiscovery" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => skillsPageRef.current?.refresh()}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("skills.refresh")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => skillsPageRef.current?.openRepoManager()}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {t("skills.repoManager")}
                  </Button>
                </>
              )}
              {currentView === "skills" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      unifiedSkillsPanelRef.current?.openRestoreFromBackup()
                    }
                  >
                    <FolderArchive className="w-4 h-4 mr-2" />
                    {t("skills.restoreFromBackup.button")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentView("skillsDiscovery")}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    {t("skills.discover")}
                  </Button>
                </>
              )}
              {currentView === "mcp" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mcpPanelRef.current?.openAdd()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("mcp.addMcp")}
                </Button>
              )}
              {currentView === "prompts" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => promptPanelRef.current?.openAdd()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("prompts.add")}
                </Button>
              )}
              {currentView === "providers" && activeApp !== "cursor" && (
                <>
                  {!managedMode && (
                    <Button
                      onClick={() => setIsAddOpen(true)}
                      size="sm"
                      className="rounded-xl"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t("provider.addProvider")}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isOpenClawView && openclawHealthWarnings.length > 0 && (
          <OpenClawHealthBanner warnings={openclawHealthWarnings} />
        )}
        {renderContent()}
      </main>

      {!managedMode && (
        <AddProviderDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          appId={activeApp}
          onSubmit={addProvider}
        />
      )}

      {!managedMode && (
        <EditProviderDialog
          open={Boolean(editingProvider)}
          provider={effectiveEditingProvider}
          onOpenChange={(open) => {
            if (!open) {
              setEditingProvider(null);
            }
          }}
          onSubmit={handleEditProvider}
          appId={activeApp}
          isProxyTakeover={isProxyRunning && isCurrentAppTakeoverActive}
        />
      )}

      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            if (usageProvider) {
              void saveUsageScript(usageProvider, script);
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={launchDashboardOpen}
        title={t("hermes.webui.launchConfirmTitle")}
        message={t("hermes.webui.launchConfirmMessage")}
        confirmText={t("hermes.webui.launchConfirmAction")}
        variant="info"
        onConfirm={() => {
          setLaunchDashboardOpen(false);
          void (async () => {
            try {
              await hermesApi.launchDashboard();
              toast.success(t("hermes.webui.launching"));
            } catch (error) {
              toast.error(t("hermes.webui.launchFailed"), {
                description: extractErrorMessage(error) || undefined,
              });
            }
          })();
        }}
        onCancel={() => setLaunchDashboardOpen(false)}
      />

      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
      <ManagedUsageCredentialsDialog />
    </div>
  );
}

export default App;
