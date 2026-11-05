// The real socket: @supabase/realtime-js, which is what the web's Supabase client uses underneath. This file is the only place that names it, so the rest of
// the package is tested without it and a build without a Realtime address never pays for it.
import { RealtimeClient } from "@supabase/realtime-js";
import type { RealtimeSocketFactory } from "./realtime";

export const createSupabaseSocket: RealtimeSocketFactory = (config, token) => {
  const socket = new RealtimeClient(`${config.url.replace(/\/+$/, "").replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: config.key }, accessToken: token });
  return socket as unknown as ReturnType<RealtimeSocketFactory>;
};
