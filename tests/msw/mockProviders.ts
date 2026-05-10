import type { AppId } from "@/lib/api/types";
import type { Provider } from "@/types";

type ProvidersByApp = Record<AppId, Record<string, Provider>>;
type CurrentProviderState = Record<AppId, string>;
type LiveProviderIdsByApp = Record<"opencode" | "openclaw" | "hermes", string[]>;

const ts = () => Date.now();

/** 单元测试 / MSW：与界面结构接近的供应商假数据（勿用于生产密钥）。 */
export function createMockProviderBundle(): {
  providers: ProvidersByApp;
  current: CurrentProviderState;
  liveProviderIds: LiveProviderIdsByApp;
} {
  const t0 = ts();
  const providers: ProvidersByApp = {
    claude: {
      "mock-claude-official": {
        id: "mock-claude-official",
        name: "Claude Official (Mock)",
        websiteUrl: "https://www.anthropic.com/claude-code",
        icon: "anthropic",
        iconColor: "#D4915D",
        category: "official",
        notes: "Mock：空 env，走 CLI 默认鉴权",
        settingsConfig: { env: {} },
        sortIndex: 0,
        createdAt: t0,
      },
      "mock-claude-proxy": {
        id: "mock-claude-proxy",
        name: "Mock 聚合 · Claude",
        websiteUrl: "https://example.com/mock-claude",
        icon: "claude",
        iconColor: "#6366F1",
        category: "aggregator",
        notes: "Mock 第三方代理",
        settingsConfig: {
          env: {
            ANTHROPIC_BASE_URL: "https://api.example.com/v1",
            ANTHROPIC_AUTH_TOKEN: "sk-mock-claude-xxxx",
            ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
          },
        },
        sortIndex: 1,
        createdAt: t0 + 1,
        inFailoverQueue: true,
      },
      "mock-claude-bedrock": {
        id: "mock-claude-bedrock",
        name: "Mock AWS Bedrock",
        websiteUrl: "https://aws.amazon.com/bedrock/",
        icon: "aws",
        iconColor: "#FF9900",
        category: "cloud_provider",
        settingsConfig: {
          env: {
            CLAUDE_CODE_USE_BEDROCK: "1",
            AWS_REGION: "us-east-1",
            ANTHROPIC_MODEL: "us.anthropic.claude-sonnet-4-20250514-v1:0",
          },
        },
        sortIndex: 2,
        createdAt: t0 + 2,
      },
    },
    codex: {
      "mock-codex-official": {
        id: "mock-codex-official",
        name: "OpenAI Official (Mock)",
        websiteUrl: "https://chatgpt.com/codex",
        icon: "openai",
        iconColor: "#00A67E",
        category: "official",
        settingsConfig: { auth: {}, config: "" },
        sortIndex: 0,
        createdAt: t0,
      },
      "mock-codex-compatible": {
        id: "mock-codex-compatible",
        name: "Mock OpenAI 兼容网关",
        websiteUrl: "https://example.com/mock-codex",
        icon: "openai",
        iconColor: "#10B981",
        category: "third_party",
        notes: "Mock：TOML 占位",
        settingsConfig: {
          auth: { OPENAI_API_KEY: "sk-mock-codex-xxxx" },
          config:
            'model_provider = "mock"\nmodel = "gpt-5.4"\n\n[model_providers.mock]\nname = "mock"\nbase_url = "https://api.example.com/v1"\nwire_api = "responses"\n',
        },
        sortIndex: 1,
        createdAt: t0 + 1,
      },
    },
    gemini: {
      "mock-gemini-official": {
        id: "mock-gemini-official",
        name: "Google Official (Mock)",
        websiteUrl: "https://ai.google.dev/",
        icon: "gemini",
        iconColor: "#4285F4",
        category: "official",
        settingsConfig: { env: {}, config: {} },
        sortIndex: 0,
        createdAt: t0,
      },
      "mock-gemini-vertex": {
        id: "mock-gemini-vertex",
        name: "Mock Vertex AI",
        websiteUrl: "https://cloud.google.com/vertex-ai",
        icon: "gemini",
        iconColor: "#1A73E8",
        category: "cloud_provider",
        settingsConfig: {
          env: {
            GEMINI_API_KEY: "mock-vertex-key",
            GOOGLE_GEMINI_BASE_URL: "https://us-central1-aiplatform.googleapis.com",
            GEMINI_MODEL: "gemini-2.5-pro",
          },
          config: {},
        },
        sortIndex: 1,
        createdAt: t0 + 1,
      },
    },
    opencode: {
      "mock-opencode-1": {
        id: "mock-opencode-1",
        name: "Mock OpenCode Provider",
        websiteUrl: "https://opencode.ai",
        icon: "opencode",
        iconColor: "#6366F1",
        category: "third_party",
        settingsConfig: {
          name: "mock-openai",
          npm: "@ai-sdk/openai-compatible",
          options: {
            baseURL: "https://api.example.com/opencode/v1",
            apiKey: "sk-mock-opencode",
          },
          models: {
            "gpt-5.4": {
              name: "GPT-5.4",
              limit: { context: 400000, output: 128000 },
            },
          },
        },
        sortIndex: 0,
        createdAt: t0,
      },
    },
    openclaw: {
      "mock-openclaw-1": {
        id: "mock-openclaw-1",
        name: "Mock OpenClaw Gateway",
        websiteUrl: "https://example.com/openclaw",
        icon: "openai",
        iconColor: "#00A67E",
        category: "third_party",
        settingsConfig: {
          baseUrl: "https://api.example.com/openclaw",
          apiKey: "sk-mock-openclaw",
          api: "openai-responses",
          models: [
            {
              id: "gpt-5.4",
              name: "GPT-5.4",
              contextWindow: 400000,
              maxTokens: 128000,
            },
          ],
        },
        sortIndex: 0,
        createdAt: t0,
      },
    },
    hermes: {
      "mock-hermes-1": {
        id: "mock-hermes-1",
        name: "Mock Hermes Agent",
        websiteUrl: "https://example.com/hermes",
        icon: "hermes",
        iconColor: "#8B5CF6",
        category: "third_party",
        settingsConfig: {
          name: "mock-hermes",
          base_url: "https://api.example.com/hermes/v1",
          api_key: "sk-mock-hermes",
          api_mode: "chat_completions",
          models: [
            {
              id: "openai/gpt-5.4",
              name: "GPT-5.4",
              context_length: 400000,
            },
          ],
        },
        sortIndex: 0,
        createdAt: t0,
      },
    },
    cursor: {
      "mock-cursor-1": {
        id: "mock-cursor-1",
        name: "Mock Cursor / OpenAI-compat",
        websiteUrl: "https://example.com/cursor",
        icon: "openai",
        iconColor: "#38BDF8",
        category: "third_party",
        notes: "Mock：手动配置场景占位",
        settingsConfig: {
          apiKey: "sk-mock-cursor",
          baseUrl: "https://api.example.com/v1",
        },
        sortIndex: 0,
        createdAt: t0,
      },
    },
  };

  const current: CurrentProviderState = {
    claude: "mock-claude-official",
    codex: "mock-codex-official",
    gemini: "mock-gemini-official",
    opencode: "mock-opencode-1",
    openclaw: "mock-openclaw-1",
    hermes: "mock-hermes-1",
    cursor: "mock-cursor-1",
  };

  const liveProviderIds: LiveProviderIdsByApp = {
    opencode: Object.keys(providers.opencode),
    openclaw: Object.keys(providers.openclaw),
    hermes: Object.keys(providers.hermes),
  };

  return { providers, current, liveProviderIds };
}
