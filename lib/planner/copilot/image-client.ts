"use client";
import { postJson } from "../transport";

export function plannerChatBody(payload: Record<string, unknown>, images?: File[]): RequestInit {
  if (!images?.length) return postJson(payload);
  const body = new FormData(); body.append("request", JSON.stringify(payload));
  for (const image of images) body.append("images", image);
  return { method: "POST", body };
}
