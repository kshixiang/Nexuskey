import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/lib/api";
import { managedModelsApi } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ManagedModelSelectorProps {
  appId: AppId;
  providerId: string;
  hideLabel?: boolean;
  className?: string;
}

export function ManagedModelSelector({
  appId,
  providerId,
  hideLabel = false,
  className,
}: ManagedModelSelectorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["managed-model-state", appId],
    queryFn: () => managedModelsApi.getState(appId),
  });

  const mutation = useMutation({
    mutationFn: (model: string) => managedModelsApi.setModel(appId, model),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["managed-model-state", appId] });
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success(
        t("provider.modelUpdated", {
          defaultValue: "模型已更新",
        }),
      );
    },
    onError: (error: Error) => {
      toast.error(
        error.message ||
          t("provider.modelUpdateFailed", {
            defaultValue: "更新模型失败",
          }),
      );
    },
  });

  const state = query.data;
  const isOwned = state?.providerId === providerId;

  const options = useMemo(() => {
    if (!isOwned || !state) return [];
    return state.options;
  }, [isOwned, state]);

  if (!isOwned || options.length <= 1) {
    return null;
  }

  return (
    <div className={["flex items-center gap-2 min-w-[220px]", className].filter(Boolean).join(" ")}>
      {!hideLabel && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t("provider.modelLabel", { defaultValue: "模型" })}
        </span>
      )}
      <Select
        value={state?.selectedModel}
        onValueChange={(value) => mutation.mutate(value)}
      >
        <SelectTrigger
          className="h-8 text-xs"
          disabled={query.isLoading || mutation.isPending}
        >
          <SelectValue
            placeholder={t("provider.selectModel", {
              defaultValue: "选择模型",
            })}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name ? `${option.name} (${option.id})` : option.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
