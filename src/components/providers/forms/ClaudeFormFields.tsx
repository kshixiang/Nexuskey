import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Wand2,
} from "lucide-react";
import EndpointSpeedTest from "./EndpointSpeedTest";
import { ApiKeySection, EndpointField, ModelInputWithFetch } from "./shared";
import { CopilotAuthSection } from "./CopilotAuthSection";
import { CodexOAuthSection } from "./CodexOAuthSection";
import {
  copilotGetModels,
  copilotGetModelsForAccount,
} from "@/lib/api/copilot";
import type { CopilotModel } from "@/lib/api/copilot";
import {
  fetchModelsForConfig,
  showFetchModelsError,
  type FetchedModel,
} from "@/lib/api/model-fetch";
import type {
  ProviderCategory,
  ClaudeApiFormat,
  ClaudeApiKeyField,
} from "@/types";
import {
  providerPresets,
  type TemplateValueConfig,
} from "@/config/claudeProviderPresets";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

function maskSecretForLog(value: string): string {
  const s = value.trim();
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

interface EndpointCandidate {
  url: string;
}

interface ClaudeFormFieldsProps {
  providerId?: string;
  // API Key
  shouldShowApiKey: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  category?: ProviderCategory;
  shouldShowApiKeyLink: boolean;
  websiteUrl: string;
  isPartner?: boolean;
  partnerPromotionKey?: string;

  // GitHub Copilot OAuth
  isCopilotPreset?: boolean;
  usesOAuth?: boolean;
  isCopilotAuthenticated?: boolean;
  /** 当前选中的 GitHub 账号 ID（多账号支持） */
  selectedGitHubAccountId?: string | null;
  /** GitHub 账号选择回调（多账号支持） */
  onGitHubAccountSelect?: (accountId: string | null) => void;

  // Codex OAuth (ChatGPT Plus/Pro)
  isCodexOauthPreset?: boolean;
  isCodexOauthAuthenticated?: boolean;
  selectedCodexAccountId?: string | null;
  onCodexAccountSelect?: (accountId: string | null) => void;
  codexFastMode?: boolean;
  onCodexFastModeChange?: (enabled: boolean) => void;

  // Template Values
  templateValueEntries: Array<[string, TemplateValueConfig]>;
  templateValues: Record<string, TemplateValueConfig>;
  templatePresetName: string;
  onTemplateValueChange: (key: string, value: string) => void;

  // Base URL
  shouldShowSpeedTest: boolean;
  baseUrl: string;
  onBaseUrlChange: (url: string) => void;
  isEndpointModalOpen: boolean;
  onEndpointModalToggle: (open: boolean) => void;
  onCustomEndpointsChange?: (endpoints: string[]) => void;
  autoSelect: boolean;
  onAutoSelectChange: (checked: boolean) => void;

  // Model Selector
  shouldShowModelSelector: boolean;
  claudeModel: string;
  defaultHaikuModel: string;
  defaultSonnetModel: string;
  defaultOpusModel: string;
  onModelChange: (
    field:
      | "ANTHROPIC_MODEL"
      | "ANTHROPIC_DEFAULT_HAIKU_MODEL"
      | "ANTHROPIC_DEFAULT_SONNET_MODEL"
      | "ANTHROPIC_DEFAULT_OPUS_MODEL",
    value: string,
  ) => void;

  // Speed Test Endpoints
  speedTestEndpoints: EndpointCandidate[];

  // API Format (for Claude-compatible providers that need request/response conversion)
  apiFormat: ClaudeApiFormat;
  onApiFormatChange: (format: ClaudeApiFormat) => void;

  // Auth Field (ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY)
  apiKeyField: ClaudeApiKeyField;
  onApiKeyFieldChange: (field: ClaudeApiKeyField) => void;

  // Full URL mode
  isFullUrl: boolean;
  onFullUrlChange: (value: boolean) => void;
}

export function ClaudeFormFields({
  providerId,
  shouldShowApiKey,
  apiKey,
  onApiKeyChange,
  category,
  shouldShowApiKeyLink,
  websiteUrl,
  isPartner,
  partnerPromotionKey,
  isCopilotPreset,
  usesOAuth,
  isCopilotAuthenticated,
  selectedGitHubAccountId,
  onGitHubAccountSelect,
  isCodexOauthPreset,
  selectedCodexAccountId,
  onCodexAccountSelect,
  codexFastMode,
  onCodexFastModeChange,
  templateValueEntries,
  templateValues,
  templatePresetName,
  onTemplateValueChange,
  shouldShowSpeedTest,
  baseUrl,
  onBaseUrlChange,
  isEndpointModalOpen,
  onEndpointModalToggle,
  onCustomEndpointsChange,
  autoSelect,
  onAutoSelectChange,
  shouldShowModelSelector,
  claudeModel,
  defaultHaikuModel,
  defaultSonnetModel,
  defaultOpusModel,
  onModelChange,
  speedTestEndpoints,
  apiFormat,
  onApiFormatChange,
  apiKeyField,
  onApiKeyFieldChange,
  isFullUrl,
  onFullUrlChange,
}: ClaudeFormFieldsProps) {
  const { t } = useTranslation();
  const hasAnyAdvancedValue = !!(
    claudeModel ||
    defaultHaikuModel ||
    defaultSonnetModel ||
    defaultOpusModel ||
    apiFormat !== "anthropic" ||
    apiKeyField !== "ANTHROPIC_AUTH_TOKEN"
  );
  const [advancedExpanded, setAdvancedExpanded] = useState(hasAnyAdvancedValue);

  // 预设填充高级值后自动展开（仅从折叠→展开，不会自动折叠）
  useEffect(() => {
    if (hasAnyAdvancedValue) {
      setAdvancedExpanded(true);
    }
  }, [hasAnyAdvancedValue]);

  // Copilot 可用模型列表
  const [copilotModels, setCopilotModels] = useState<CopilotModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // 通用模型获取（非 Copilot 供应商）
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const modelFetchGenRef = useRef(0);

  const debouncedApiKey = useDebouncedValue(apiKey.trim(), 600);
  const debouncedBaseUrl = useDebouncedValue(baseUrl.trim(), 600);

  const performFetchModels = useCallback(
    (opts?: { silentToast?: boolean }) => {
      if (!baseUrl?.trim() || !apiKey?.trim()) {
        if (!opts?.silentToast) {
          showFetchModelsError(null, t, {
            hasApiKey: !!apiKey?.trim(),
            hasBaseUrl: !!baseUrl?.trim(),
          });
        }
        return;
      }
      const matchedPreset = providerPresets.find((p) => {
        const env = (p.settingsConfig as { env?: Record<string, string> })?.env;
        return env?.ANTHROPIC_BASE_URL === baseUrl;
      });
      const modelsUrl = matchedPreset?.modelsUrl;

      const gen = ++modelFetchGenRef.current;
      setIsFetchingModels(true);
      console.warn("[ModelFetch] request", {
        baseUrl: baseUrl.trim(),
        isFullUrl,
        modelsUrl: modelsUrl ?? null,
        silentToast: opts?.silentToast ?? false,
        apiKey: maskSecretForLog(apiKey),
      });
      fetchModelsForConfig(baseUrl, apiKey, isFullUrl, modelsUrl)
        .then((models) => {
          if (gen !== modelFetchGenRef.current) {
            console.warn("[ModelFetch] ignored (stale)", { gen });
            return;
          }
          console.warn("[ModelFetch] success", {
            count: models.length,
            baseUrl: baseUrl.trim(),
            silentToast: opts?.silentToast ?? false,
          });
          setFetchedModels(models);
          if (opts?.silentToast) return;
          if (models.length === 0) {
            toast.info(t("providerForm.fetchModelsEmpty"));
          } else {
            toast.success(
              t("providerForm.fetchModelsSuccess", { count: models.length }),
            );
          }
        })
        .catch((err) => {
          if (gen !== modelFetchGenRef.current) return;
          console.warn("[ModelFetch] failed", {
            baseUrl: baseUrl.trim(),
            silentToast: opts?.silentToast ?? false,
            error: String(err),
          });
          if (!opts?.silentToast) {
            showFetchModelsError(err, t);
          }
        })
        .finally(() => {
          if (gen === modelFetchGenRef.current) {
            setIsFetchingModels(false);
          }
        });
    },
    [apiKey, baseUrl, isFullUrl, t],
  );

  const handleFetchModels = useCallback(() => {
    performFetchModels();
  }, [performFetchModels]);

  const performFetchModelsRef = useRef(performFetchModels);
  performFetchModelsRef.current = performFetchModels;

  // 输入 Base URL / API Key 结束后自动拉取模型列表（防抖由 debounced* 保证）
  useEffect(() => {
    if (
      isCopilotPreset ||
      !shouldShowModelSelector ||
      usesOAuth ||
      !shouldShowApiKey
    ) {
      return;
    }
    if (!debouncedBaseUrl || !debouncedApiKey) {
      setFetchedModels([]);
      return;
    }
    // 避免 Key 未输完就请求（减少无效请求与错误 toast）
    if (debouncedApiKey.length < 12) {
      setFetchedModels([]);
      return;
    }
    performFetchModelsRef.current({ silentToast: true });
  }, [
    debouncedApiKey,
    debouncedBaseUrl,
    isCopilotPreset,
    isFullUrl,
    shouldShowApiKey,
    shouldShowModelSelector,
    usesOAuth,
  ]);

  // 当 Copilot 预设且已认证时，加载可用模型
  useEffect(() => {
    // 如果不是 Copilot 预设或未认证，清空模型列表
    if (!isCopilotPreset || !isCopilotAuthenticated) {
      setCopilotModels([]);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    const fetchModels = selectedGitHubAccountId
      ? copilotGetModelsForAccount(selectedGitHubAccountId)
      : copilotGetModels();

    fetchModels
      .then((models) => {
        if (!cancelled) setCopilotModels(models);
      })
      .catch((err) => {
        console.warn("[Copilot] Failed to fetch models:", err);
        if (!cancelled) {
          toast.error(
            t("copilot.loadModelsFailed", {
              defaultValue: "加载 Copilot 模型列表失败",
            }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCopilotPreset, isCopilotAuthenticated, selectedGitHubAccountId]);

  // 模型输入框：支持手动输入 + 下拉选择
  const renderModelInput = (
    id: string,
    value: string,
    field: ClaudeFormFieldsProps["onModelChange"] extends (
      f: infer F,
      v: string,
    ) => void
      ? F
      : never,
    placeholder?: string,
  ) => {
    if (isCopilotPreset && copilotModels.length > 0) {
      // 按 vendor 分组
      const grouped: Record<string, CopilotModel[]> = {};
      for (const model of copilotModels) {
        const vendor = model.vendor || "Other";
        if (!grouped[vendor]) grouped[vendor] = [];
        grouped[vendor].push(model);
      }
      const vendors = Object.keys(grouped).sort();

      return (
        <div className="flex gap-1">
          <Input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onModelChange(field, e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-64 overflow-y-auto z-[200]"
            >
              {vendors.map((vendor, vi) => (
                <div key={vendor}>
                  {vi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{vendor}</DropdownMenuLabel>
                  {grouped[vendor].map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onSelect={() => onModelChange(field, model.id)}
                    >
                      {model.id}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }

    if (isCopilotPreset && modelsLoading) {
      return (
        <div className="flex gap-1">
          <Input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onModelChange(field, e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="flex-1"
          />
          <Button variant="outline" size="icon" className="shrink-0" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
        </div>
      );
    }

    // 非 Copilot 供应商: 使用 ModelInputWithFetch（获取按钮在 section 标题旁）
    return (
      <ModelInputWithFetch
        id={id}
        value={value}
        onChange={(v) => onModelChange(field, v)}
        placeholder={placeholder}
        fetchedModels={fetchedModels}
        isLoading={isFetchingModels}
        onFetch={handleFetchModels}
      />
    );
  };

  return (
    <>
      {/* GitHub Copilot OAuth 认证 */}
      {isCopilotPreset && (
        <CopilotAuthSection
          selectedAccountId={selectedGitHubAccountId}
          onAccountSelect={onGitHubAccountSelect}
        />
      )}

      {/* Codex OAuth 认证 (ChatGPT Plus/Pro) */}
      {isCodexOauthPreset && (
        <CodexOAuthSection
          selectedAccountId={selectedCodexAccountId}
          onAccountSelect={onCodexAccountSelect}
          fastModeEnabled={codexFastMode}
          onFastModeChange={onCodexFastModeChange}
        />
      )}

      {/* API Key 输入框（非 OAuth 预设时显示） */}
      {shouldShowApiKey && !usesOAuth && (
        <ApiKeySection
          value={apiKey}
          onChange={onApiKeyChange}
          category={category}
          shouldShowLink={shouldShowApiKeyLink}
          websiteUrl={websiteUrl}
          isPartner={isPartner}
          partnerPromotionKey={partnerPromotionKey}
        />
      )}

      {/* 模板变量输入 */}
      {templateValueEntries.length > 0 && (
        <div className="space-y-3">
          <FormLabel>
            {t("providerForm.parameterConfig", {
              name: templatePresetName,
              defaultValue: `${templatePresetName} 参数配置`,
            })}
          </FormLabel>
          <div className="space-y-4">
            {templateValueEntries.map(([key, config]) => (
              <div key={key} className="space-y-2">
                <FormLabel htmlFor={`template-${key}`}>
                  {config.label}
                </FormLabel>
                <Input
                  id={`template-${key}`}
                  type="text"
                  required
                  value={
                    templateValues[key]?.editorValue ??
                    config.editorValue ??
                    config.defaultValue ??
                    ""
                  }
                  onChange={(e) => onTemplateValueChange(key, e.target.value)}
                  placeholder={config.placeholder || config.label}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base URL 输入框 */}
      {shouldShowSpeedTest && (
        <EndpointField
          id="baseUrl"
          label={t("providerForm.apiEndpoint")}
          value={baseUrl}
          onChange={onBaseUrlChange}
          placeholder={t("providerForm.apiEndpointPlaceholder")}
          hint={
            apiFormat === "openai_responses"
              ? t("providerForm.apiHintResponses")
              : apiFormat === "openai_chat"
                ? t("providerForm.apiHintOAI")
                : apiFormat === "gemini_native"
                  ? t("providerForm.apiHintGeminiNative")
                  : t("providerForm.apiHint")
          }
          fullUrlHint={
            apiFormat === "gemini_native"
              ? t("providerForm.fullUrlHintGeminiNative")
              : undefined
          }
          onManageClick={() => onEndpointModalToggle(true)}
          showFullUrlToggle={true}
          isFullUrl={isFullUrl}
          onFullUrlChange={onFullUrlChange}
        />
      )}

      {/* 端点测速弹窗 */}
      {shouldShowSpeedTest && isEndpointModalOpen && (
        <EndpointSpeedTest
          appId="claude"
          providerId={providerId}
          value={baseUrl}
          onChange={onBaseUrlChange}
          initialEndpoints={speedTestEndpoints}
          visible={isEndpointModalOpen}
          onClose={() => onEndpointModalToggle(false)}
          autoSelect={autoSelect}
          onAutoSelectChange={onAutoSelectChange}
          onCustomEndpointsChange={onCustomEndpointsChange}
        />
      )}

      {/* 高级选项（API 格式 + 认证字段 + 模型映射） */}
      {shouldShowModelSelector && (
        <Collapsible open={advancedExpanded} onOpenChange={setAdvancedExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant={null}
              size="sm"
              className="h-8 gap-1.5 px-0 text-sm font-medium text-foreground hover:opacity-70"
            >
              {advancedExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {t("providerForm.advancedOptionsToggle")}
            </Button>
          </CollapsibleTrigger>
          {!advancedExpanded && (
            <p className="text-xs text-muted-foreground mt-1 ml-1">
              {t("providerForm.advancedOptionsHint")}
            </p>
          )}
          <CollapsibleContent className="space-y-4 pt-2">
            {/* API 格式选择（仅非云服务商显示） */}
            {category !== "cloud_provider" && (
              <div className="space-y-2">
                <FormLabel htmlFor="apiFormat">
                  {t("providerForm.apiFormat", { defaultValue: "API 格式" })}
                </FormLabel>
                <Select value={apiFormat} onValueChange={onApiFormatChange}>
                  <SelectTrigger id="apiFormat" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">
                      {t("providerForm.apiFormatAnthropic", {
                        defaultValue: "Anthropic Messages (原生)",
                      })}
                    </SelectItem>
                    <SelectItem value="openai_chat">
                      {t("providerForm.apiFormatOpenAIChat", {
                        defaultValue: "OpenAI Chat Completions (需转换)",
                      })}
                    </SelectItem>
                    <SelectItem value="openai_responses">
                      {t("providerForm.apiFormatOpenAIResponses", {
                        defaultValue: "OpenAI Responses API (需转换)",
                      })}
                    </SelectItem>
                    <SelectItem value="gemini_native">
                      {t("providerForm.apiFormatGeminiNative", {
                        defaultValue: "Gemini Native generateContent (需转换)",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("providerForm.apiFormatHint", {
                    defaultValue: "选择供应商 API 的输入格式",
                  })}
                </p>
              </div>
            )}

            {/* 认证字段选择器 */}
            <div className="space-y-2">
              <FormLabel>
                {t("providerForm.authField", { defaultValue: "认证字段" })}
              </FormLabel>
              <Select
                value={apiKeyField}
                onValueChange={(v) =>
                  onApiKeyFieldChange(v as ClaudeApiKeyField)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANTHROPIC_AUTH_TOKEN">
                    {t("providerForm.authFieldAuthToken", {
                      defaultValue: "ANTHROPIC_AUTH_TOKEN（默认）",
                    })}
                  </SelectItem>
                  <SelectItem value="ANTHROPIC_API_KEY">
                    {t("providerForm.authFieldApiKey", {
                      defaultValue: "ANTHROPIC_API_KEY",
                    })}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("providerForm.authFieldHint", {
                  defaultValue: "选择写入配置的认证环境变量名",
                })}
              </p>
            </div>

            {/* 模型映射 */}
            <div className="space-y-1 pt-2 border-t">
              <div className="flex items-center justify-between">
                <FormLabel>{t("providerForm.modelMappingLabel")}</FormLabel>
                <div className="flex gap-2">
                  {/* 一键设置按钮 */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const value =
                        claudeModel ||
                        defaultHaikuModel ||
                        defaultSonnetModel ||
                        defaultOpusModel;
                      if (value) {
                        onModelChange("ANTHROPIC_MODEL", value);
                        onModelChange("ANTHROPIC_DEFAULT_HAIKU_MODEL", value);
                        onModelChange("ANTHROPIC_DEFAULT_SONNET_MODEL", value);
                        onModelChange("ANTHROPIC_DEFAULT_OPUS_MODEL", value);
                        toast.success(
                          t("providerForm.quickSetSuccess", {
                            defaultValue: "已将模型名称应用到所有字段",
                          }),
                        );
                      }
                    }}
                    disabled={
                      !claudeModel &&
                      !defaultHaikuModel &&
                      !defaultSonnetModel &&
                      !defaultOpusModel
                    }
                    className="h-7 gap-1"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {t("providerForm.quickSetModels", {
                      defaultValue: "一键设置",
                    })}
                  </Button>
                  {!isCopilotPreset && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="h-7 gap-1"
                    >
                      {isFetchingModels ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {t("providerForm.fetchModels")}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("providerForm.modelMappingHint")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 主模型 */}
              <div className="space-y-2">
                <FormLabel htmlFor="claudeModel">
                  {t("providerForm.anthropicModel", {
                    defaultValue: "主模型",
                  })}
                </FormLabel>
                {renderModelInput(
                  "claudeModel",
                  claudeModel,
                  "ANTHROPIC_MODEL",
                  t("providerForm.modelPlaceholder", { defaultValue: "" }),
                )}
              </div>

              {/* 默认 Haiku */}
              <div className="space-y-2">
                <FormLabel htmlFor="claudeDefaultHaikuModel">
                  {t("providerForm.anthropicDefaultHaikuModel", {
                    defaultValue: "Haiku 默认模型",
                  })}
                </FormLabel>
                {renderModelInput(
                  "claudeDefaultHaikuModel",
                  defaultHaikuModel,
                  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                  t("providerForm.haikuModelPlaceholder", { defaultValue: "" }),
                )}
              </div>

              {/* 默认 Sonnet */}
              <div className="space-y-2">
                <FormLabel htmlFor="claudeDefaultSonnetModel">
                  {t("providerForm.anthropicDefaultSonnetModel", {
                    defaultValue: "Sonnet 默认模型",
                  })}
                </FormLabel>
                {renderModelInput(
                  "claudeDefaultSonnetModel",
                  defaultSonnetModel,
                  "ANTHROPIC_DEFAULT_SONNET_MODEL",
                  t("providerForm.modelPlaceholder", { defaultValue: "" }),
                )}
              </div>

              {/* 默认 Opus */}
              <div className="space-y-2">
                <FormLabel htmlFor="claudeDefaultOpusModel">
                  {t("providerForm.anthropicDefaultOpusModel", {
                    defaultValue: "Opus 默认模型",
                  })}
                </FormLabel>
                {renderModelInput(
                  "claudeDefaultOpusModel",
                  defaultOpusModel,
                  "ANTHROPIC_DEFAULT_OPUS_MODEL",
                  t("providerForm.modelPlaceholder", { defaultValue: "" }),
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
