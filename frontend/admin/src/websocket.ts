import { createWebSocket } from "@shared/websocket";
import { getConfig } from "@shared/config";
import { api } from "@/api";

const config = getConfig();

export const ws = createWebSocket({
  url: config.ws_url!,
  getToken: async () => {
    const { data } = await api.post<{ token: string }>("/auth/ws-token");
    return data.token;
  },
});
