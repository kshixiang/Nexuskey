import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/lib/api";
import type { UsageRangeSelection } from "@/types/usage";
import { RequestLogTable } from "@/components/usage/RequestLogTable";
import { getLocaleFromLanguage } from "@/components/usage/format";
import { getUsageRangePresetLabel, resolveUsageRange } from "@/lib/usageRange";
import { cn } from "@/lib/utils";

interface ProviderUsageLogPanelProps {
  appId: AppId;
  className?: string;
}

/**
 * Same request-log table as Settings → Usage, embedded on the providers dashboard.
 */
export function ProviderUsageLogPanel({
  appId,
  className,
}: ProviderUsageLogPanelProps) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<UsageRangeSelection>({ preset: "today" });
  const refreshIntervalMs = 30_000;

  const language = i18n.resolvedLanguage || i18n.language || "en";
  const locale = getLocaleFromLanguage(language);
  const resolvedRange = useMemo(() => resolveUsageRange(range), [range]);
  const rangeLabel = useMemo(() => {
    if (range.preset !== "custom") {
      return getUsageRangePresetLabel(range.preset, t);
    }
    return `${new Date(resolvedRange.startDate * 1000).toLocaleString(locale)} - ${new Date(
      resolvedRange.endDate * 1000,
    ).toLocaleString(locale)}`;
  }, [locale, range, resolvedRange.endDate, resolvedRange.startDate, t]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-xl border border-border/80 bg-card px-3 py-4 sm:px-4",
        className,
      )}
    >
      <RequestLogTable
        range={range}
        rangeLabel={rangeLabel}
        appType={appId}
        refreshIntervalMs={refreshIntervalMs}
        onRangeChange={setRange}
        expandToFill
      />
    </div>
  );
}
