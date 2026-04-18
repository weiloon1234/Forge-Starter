import { getConfig } from "@shared/config";
import type { WsTokenResponse } from "@shared/types/generated";
import { createWebSocket } from "@shared/websocket";
import { api } from "@/api";

const config = getConfig();
const wsUrl = config.ws_url;

if (!wsUrl) {
  throw new Error("Missing runtime config: ws_url");
}

export const ws = createWebSocket({
  url: wsUrl,
  getToken: async () => {
    const { data } = await api.post<WsTokenResponse>("/auth/ws-token");
    return data.token;
  },
});
