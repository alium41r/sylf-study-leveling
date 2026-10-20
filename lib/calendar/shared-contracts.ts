import { z } from "zod";
export const sharedCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"),
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
  }),
  z.strictObject({
    action: z.literal("rename"),
    id: z.uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
  }),
  z.strictObject({
    action: z.literal("invite"),
    id: z.uuid(),
    revision: z.number().int().positive(),
    username: z.string().trim().min(1).max(80),
    role: z.enum(["VIEWER", "EDITOR"]),
  }),
  z.strictObject({
    action: z.literal("member"),
    id: z.uuid(),
    revision: z.number().int().positive(),
    userId: z.number().int().positive(),
    role: z.enum(["VIEWER", "EDITOR"]).optional(),
  }),
  z.strictObject({
    action: z.literal("respond"),
    id: z.uuid(),
    accept: z.boolean(),
  }),
  z.strictObject({ action: z.literal("leave"), id: z.uuid() }),
  z.strictObject({
    action: z.literal("delete"),
    id: z.uuid(),
    revision: z.number().int().positive(),
  }),
]);
export interface SharedCalendarSummary {
  id: string;
  name: string;
  revision: number;
  role: "OWNER" | "EDITOR" | "VIEWER";
  status: "ACTIVE" | "PENDING";
  owner: { username: string };
  members?: {
    userId: number;
    role: string;
    status: string;
    user: { username: string };
  }[];
}
