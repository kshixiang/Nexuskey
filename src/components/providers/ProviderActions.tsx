import { BarChart3, Check, Minus, Play, Plus, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppId } from "@/lib/api";

interface ProviderActionsProps {
  appId?: AppId;
  isCurrent: boolean;
  isInConfig?: boolean;
  isProxyTakeover?: boolean;
  isOmo?: boolean;
  onSwitch: () => void;
  onConfigureUsage?: () => void;
  onRemoveFromConfig?: () => void;
  onDisableOmo?: () => void;
  isAutoFailoverEnabled?: boolean;
  isInFailoverQueue?: boolean;
  onToggleFailover?: (enabled: boolean) => void;
  isOfficialBlockedByProxy?: boolean;
  // Hermes v12+ providers: dict overlay — edit/delete must go through Web UI
  isReadOnly?: boolean;
}

export function ProviderActions({
  appId,
  isCurrent,
  isInConfig = false,
  isProxyTakeover = false,
  isOmo = false,
  onSwitch,
  onConfigureUsage,
  onRemoveFromConfig,
  onDisableOmo,
  isAutoFailoverEnabled = false,
  isInFailoverQueue = false,
  onToggleFailover,
  isOfficialBlockedByProxy = false,
  isReadOnly = false,
}: ProviderActionsProps) {
  const { t } = useTranslation();

  // 累加模式应用（OpenCode 非 OMO / OpenClaw / Hermes）
  const isAdditiveMode =
    (appId === "opencode" && !isOmo) ||
    appId === "openclaw" ||
    appId === "hermes";

  // 故障转移模式下的按钮逻辑（累加模式和 OMO 应用不支持故障转移）
  const isFailoverMode =
    !isAdditiveMode && !isOmo && isAutoFailoverEnabled && onToggleFailover;

  const handleMainButtonClick = () => {
    if (isOmo) {
      if (isCurrent) {
        onDisableOmo?.();
      } else {
        onSwitch();
      }
    } else if (isAdditiveMode) {
      // 累加模式：切换配置状态（添加/移除）
      if (isInConfig) {
        if (onRemoveFromConfig && !isReadOnly) {
          onRemoveFromConfig();
        }
      } else {
        onSwitch(); // 添加到配置
      }
    } else if (isFailoverMode) {
      onToggleFailover(!isInFailoverQueue);
    } else {
      onSwitch();
    }
  };

  const getMainButtonState = () => {
    if (isOmo) {
      if (isCurrent) {
        return {
          disabled: false,
          variant: "secondary" as const,
          className: "bg-gray-200 text-foreground hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600",
          icon: <Check className="h-4 w-4" />,
          text: t("common.close"),
        };
      }
      return {
        disabled: false,
        variant: "default" as const,
        className: "",
        icon: <Play className="h-4 w-4" />,
        text: t("provider.enable"),
      };
    }

    // 累加模式（OpenCode 非 OMO / OpenClaw）
    if (isAdditiveMode) {
      if (isInConfig) {
        return {
          disabled: isReadOnly,
          variant: "secondary" as const,
          className: cn(
            "bg-gray-200 text-foreground hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600",
            isReadOnly && "opacity-40 cursor-not-allowed",
          ),
          icon: <Minus className="h-4 w-4" />,
          text: t("common.close"),
        };
      }
      return {
        disabled: false,
        variant: "default" as const,
        className:
          "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700",
        icon: <Plus className="h-4 w-4" />,
        text: t("provider.enable"),
      };
    }

    if (isFailoverMode) {
      if (isInFailoverQueue) {
        return {
          disabled: false,
          variant: "secondary" as const,
          className:
            "bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900/70",
          icon: <Check className="h-4 w-4" />,
          text: t("failover.inQueue", { defaultValue: "已加入" }),
        };
      }
      return {
        disabled: false,
        variant: "default" as const,
        className:
          "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700",
        icon: <Plus className="h-4 w-4" />,
        text: t("failover.addQueue", { defaultValue: "加入" }),
      };
    }

    if (isOfficialBlockedByProxy) {
      return {
        disabled: true,
        variant: "secondary" as const,
        className: "opacity-40 cursor-not-allowed",
        icon: <ShieldAlert className="h-4 w-4" />,
        text: t("provider.blockedByProxy", { defaultValue: "已拦截" }),
      };
    }

    if (isCurrent) {
      return {
        disabled: true,
        variant: "secondary" as const,
        className: "bg-gray-200 text-foreground hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600",
        icon: <Check className="h-4 w-4" />,
        text: t("provider.inUse"),
      };
    }

    return {
      disabled: false,
      variant: "default" as const,
      className: isProxyTakeover
        ? "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700"
        : "",
      icon: <Play className="h-4 w-4" />,
      text: t("provider.enable"),
    };
  };

  const buttonState = getMainButtonState();

  return (
    <div className="flex items-center gap-2">
      <Button
        size="lg"
        variant={buttonState.variant}
        onClick={handleMainButtonClick}
        disabled={buttonState.disabled}
        className={cn(
          "h-11 min-w-[6.8rem] rounded-[18px] px-4 text-sm font-semibold",
          buttonState.className,
        )}
      >
        {buttonState.icon}
        {buttonState.text}
      </Button>

      {onConfigureUsage && (
        <Button
          size="lg"
          variant="outline"
          onClick={onConfigureUsage}
          className="h-11 min-w-[6.6rem] rounded-[18px] border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
        >
          <BarChart3 className="h-4 w-4" />
          {t("provider.usageEntry", { defaultValue: "消耗" })}
        </Button>
      )}
    </div>
  );
}
