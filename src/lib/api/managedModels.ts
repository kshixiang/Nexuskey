import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";

export interface ManagedModelOption {
  id: string;
  name?: string;
}

export interface ManagedModelState {
  providerId: string;
  selectedModel?: string;
  options: ManagedModelOption[];
}

export const managedModelsApi = {
  async getState(appId: AppId): Promise<ManagedModelState> {
    return await invoke("get_managed_model_state", { app: appId });
  },

  async setModel(appId: AppId, model: string): Promise<ManagedModelState> {
    return await invoke("set_managed_model", { app: appId, model });
  },
};
