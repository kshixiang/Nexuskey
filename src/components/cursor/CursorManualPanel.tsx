import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProxyStatus } from "@/hooks/useProxyStatus";

function formatProxyOpenAiBase(address: string, port: number): string {
  const isIPv6 = address.includes(":");
  const host = isIPv6 ? `[${address}]` : address;
  return `http://${host}:${port}/v1`;
}

export function CursorManualPanel() {
  const { t } = useTranslation();
  const { status } = useProxyStatus();

  const proxyBase =
    status?.running && status.address
      ? formatProxyOpenAiBase(status.address, status.port)
      : "";

  const copy = async (text: string, toastKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t(toastKey));
    } catch {
      toast.error(t("common.copyFailed", { defaultValue: "复制失败" }));
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-8 pt-2">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          {t("cursorManual.title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("cursorManual.intro")}
        </p>
      </div>

      <ol className="list-decimal space-y-4 pl-5 text-sm text-foreground">
        <li className="leading-relaxed">
          <span className="font-medium">{t("cursorManual.step1Title")}</span>
          <p className="mt-1 text-muted-foreground">{t("cursorManual.step1Body")}</p>
        </li>
        <li className="leading-relaxed">
          <span className="font-medium">{t("cursorManual.step2Title")}</span>
          <p className="mt-1 text-muted-foreground">{t("cursorManual.step2Body")}</p>
          {proxyBase ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
                {proxyBase}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() =>
                  void copy(proxyBase, "cursorManual.proxyUrlCopied")
                }
              >
                <Copy className="mr-1.5 h-4 w-4" />
                {t("common.copy")}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {t("cursorManual.proxyOfflineHint")}
            </p>
          )}
        </li>
        <li className="leading-relaxed">
          <span className="font-medium">{t("cursorManual.step3Title")}</span>
          <p className="mt-1 text-muted-foreground">{t("cursorManual.step3Body")}</p>
        </li>
      </ol>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {t("cursorManual.note")}
      </div>

      <a
        href="https://docs.cursor.com/settings/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {t("cursorManual.docsLink")}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
