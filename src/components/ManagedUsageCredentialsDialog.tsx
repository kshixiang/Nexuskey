import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsQuery } from "@/lib/query";
import { settingsApi } from "@/lib/api";
import { isManagedModeEnabled } from "@/config/managedMode";
import type { Settings } from "@/types";

/**
 * 托管构建：若未配置全局用量查询用的用户 ID / 系统访问令牌，则阻断并弹窗要求填写。
 * 设置页「使用统计」不再承载此表单；通过定期刷新设置检测外部变更。
 */
export function ManagedUsageCredentialsDialog() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const managed = isManagedModeEnabled();
  const { data: settings, isLoading } = useSettingsQuery();

  const credentialsIncomplete = useMemo(() => {
    if (!managed || !settings) return false;
    if (settings.firstRunNoticeConfirmed !== true) return false;
    const uid = settings.usageQueryUserId?.trim() ?? "";
    const tok = settings.usageQueryAccessToken?.trim() ?? "";
    return uid.length === 0 || tok.length === 0;
  }, [managed, settings]);

  const open =
    managed && !isLoading && settings != null && credentialsIncomplete;

  const [userId, setUserId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current && settings) {
      setUserId(settings.usageQueryUserId ?? "");
      setAccessToken(settings.usageQueryAccessToken ?? "");
    }
    prevOpenRef.current = open;
  }, [open, settings]);

  useEffect(() => {
    if (!managed || !credentialsIncomplete) return;
    const id = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    }, 15_000);
    return () => window.clearInterval(id);
  }, [managed, credentialsIncomplete, queryClient]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const u = userId.trim();
    const tok = accessToken.trim();
    if (!u || !tok) {
      toast.error(t("managedMode.credentialsDialog.bothRequired"), {
        closeButton: true,
      });
      return;
    }
    if (!settings) return;
    setSaving(true);
    try {
      const { webdavSync: _, ...rest } = settings;
      const next: Settings = {
        ...rest,
        usageQueryUserId: u,
        usageQueryAccessToken: tok,
      };
      await settingsApi.save(next);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("managedMode.credentialsDialog.saved"), {
        closeButton: true,
      });
    } catch (e) {
      toast.error(
        t("managedMode.credentialsDialog.saveFailed", {
          error: String(e),
        }),
        { closeButton: true },
      );
    } finally {
      setSaving(false);
    }
  };

  if (!managed) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        zIndex="top"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {t("managedMode.credentialsDialog.title")}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {t("managedMode.credentialsDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-2">
          <div className="space-y-2">
            <Label htmlFor="managed-usage-user-id">
              {t("managedMode.credentialsDialog.userId")}
            </Label>
            <Input
              id="managed-usage-user-id"
              autoComplete="username"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder={t(
                "managedMode.credentialsDialog.userIdPlaceholder",
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="managed-usage-access-token">
              {t("managedMode.credentialsDialog.accessToken")}
            </Label>
            <Input
              id="managed-usage-access-token"
              type="password"
              autoComplete="new-password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={t(
                "managedMode.credentialsDialog.accessTokenPlaceholder",
              )}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.saving")}
              </span>
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
