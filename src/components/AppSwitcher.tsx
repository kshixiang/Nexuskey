import type { AppId } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

interface AppSwitcherProps {
  activeApp: AppId;
  onSwitch: (app: AppId) => void;
  visibleApps?: VisibleApps;
}

const ALL_APPS: AppId[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
  "cursor",
];
const STORAGE_KEY = "nexuskey-last-app";

export function AppSwitcher({
  activeApp,
  onSwitch,
  visibleApps,
}: AppSwitcherProps) {
  const handleSwitch = (app: AppId) => {
    if (app === activeApp) return;
    localStorage.setItem(STORAGE_KEY, app);
    onSwitch(app);
  };
  const iconSize = 20;
  const appIconName: Record<AppId, string> = {
    claude: "claude",
    codex: "openai",
    gemini: "gemini",
    opencode: "opencode",
    openclaw: "openclaw",
    hermes: "hermes",
    cursor: "openai",
  };
  const appDisplayName: Record<AppId, string> = {
    claude: "Claude",
    codex: "Codex",
    gemini: "Gemini",
    opencode: "OpenCode",
    openclaw: "OpenClaw",
    hermes: "Hermes",
    cursor: "Cursor",
  };

  // Filter apps based on visibility settings (default all visible)
  const appsToShow = ALL_APPS.filter((app) => {
    if (!visibleApps) return true;
    return visibleApps[app];
  });

  return (
    <div className="relative flex h-full w-[76px] shrink-0 flex-col items-center gap-2 border-r border-border/70 bg-card px-2.5 py-5 sm:w-[84px] sm:gap-2.5 sm:px-3 sm:py-6">
      <div className="absolute inset-y-0 right-0 w-px bg-border/70" />
      {appsToShow.map((app) => {
        const isActive = activeApp === app;
        return (
          <button
            key={app}
            type="button"
            onClick={() => handleSwitch(app)}
            aria-label={appDisplayName[app]}
            className={cn(
              "relative flex h-12 w-12 items-center justify-center rounded-2xl border outline-none transition-all duration-200 ease-out",
              "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "active:scale-[0.94]",
              isActive
                ? "border-transparent bg-gradient-to-br from-emerald-400 via-primary to-emerald-700 text-primary-foreground shadow-[0_14px_32px_hsl(142_71%_45%/0.28)] hover:shadow-[0_16px_36px_hsl(142_71%_45%/0.36)] hover:brightness-[1.03]"
                : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/45 hover:text-foreground hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white",
            )}
          >
            <ProviderIcon
              icon={appIconName[app]}
              name={appDisplayName[app]}
              size={iconSize}
            />
          </button>
        );
      })}
    </div>
  );
}
