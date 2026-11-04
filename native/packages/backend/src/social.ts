// Circle's reads and writes (Part 3 slice C): finding people, managing friends, and messages. The server decides who may message whom, who is
// blocked and who may manage a group, and it refuses in words written for people. Nothing here checks a rule the server owns. A message the person
// sent is theirs to edit or delete; everything else about a conversation is read-only to the client. Text only: the schema has no attachments.
import { z } from "zod";
import type { BackendClient } from "./client";

const person = z.object({ id: z.number().int(), name: z.string().nullable(), username: z.string(), hunterRank: z.string().nullable().optional(), level: z.number().nullable().optional(), avatarUrl: z.string().nullable().optional(), activeAvatar: z.string().nullable().optional(), activeFrame: z.string().nullable().optional(), isOnline: z.boolean().optional() }).loose();
export type Person = z.infer<typeof person>;

export const userSearchSchema = z.array(person.extend({ isFriend: z.boolean().optional() }));
export type UserSearchResult = z.infer<typeof userSearchSchema>[number];

export const conversationListSchema = z.array(z.object({
  id: z.number().int(), name: z.string().nullable(), avatarUrl: z.string().nullable().optional(), isGroup: z.boolean(),
  participants: z.array(person),
  lastMessage: z.object({ content: z.string(), senderName: z.string().nullable().optional(), senderId: z.number().int(), createdAt: z.string() }).loose().nullable(),
  hasUnread: z.boolean(), updatedAt: z.string(),
}).loose());
export type ConversationSummary = z.infer<typeof conversationListSchema>[number];

export const messageSchema = z.object({ id: z.number().int(), content: z.string(), senderId: z.number().int().optional(), createdAt: z.string(), editedAt: z.string().nullable().optional(), sender: person.partial().nullable().optional() }).loose();
export type ChatMessage = z.infer<typeof messageSchema>;
export const conversationSchema = z.object({
  conversation: z.object({ id: z.number().int(), name: z.string().nullable(), isGroup: z.boolean(), createdBy: z.number().int().nullable().optional(), participants: z.array(person) }).loose(),
  messages: z.array(messageSchema), hasMore: z.boolean(),
}).loose();
export type Conversation = z.infer<typeof conversationSchema>;
export const notificationsSchema = z.array(z.object({ id: z.number().int(), content: z.string(), type: z.string(), read: z.boolean(), createdAt: z.string() }).loose());
export type AppNotification = z.infer<typeof notificationsSchema>[number];
const newerSchema = z.object({ messages: z.array(messageSchema) });

export function createSocialReads(client: BackendClient) {
  return {
    /** Two characters or more. The server returns at most ten, and marks the people who are already friends. */
    search: (query: string, signal: AbortSignal) => client.get(`/api/users/search?q=${encodeURIComponent(query)}`, userSearchSchema, { signal }),
    /** The server refuses with its own words when the other person does not accept requests, or has blocked this one. */
    sendRequest: (receiverId: number) => client.send("POST", "/api/friends/requests", { body: { receiverId } }),
    removeFriend: (userId: number) => client.send("POST", "/api/friends/remove", { body: { targetUserId: userId } }),
    block: (userId: number) => client.send("POST", "/api/friends/block", { body: { targetUserId: userId } }),
    unblock: (userId: number) => client.send("POST", "/api/friends/unblock", { body: { targetUserId: userId } }),

    /** The newest 15. Local only: nothing here is pushed to the device. */
    notifications: (signal: AbortSignal) => client.get("/api/notifications", notificationsSchema, { signal }),
    markNotificationsRead: () => client.send("PATCH", "/api/notifications"),
    clearNotifications: () => client.send("DELETE", "/api/notifications"),

    conversations: (signal: AbortSignal) => client.get("/api/conversations", conversationListSchema, { signal }),
    /** The newest 50, oldest first, and opening it marks it read. `before` pages backwards. */
    conversation: (id: number, before: number | null, signal: AbortSignal) => client.get(`/api/conversations/${id}${before ? `?before=${before}` : ""}`, conversationSchema, { signal }),
    /** Messages after the last one seen, oldest first. The bounded fallback when Realtime is off. */
    newerThan: (id: number, after: number, signal: AbortSignal) => client.get(`/api/conversations/${id}/messages?after=${after}`, newerSchema, { signal }),
    startConversation: (participantIds: number[], group?: { name: string }) => client.send<{ id: number; existing?: boolean }>("POST", "/api/conversations", { body: { participantIds, isGroup: !!group, ...(group ? { name: group.name } : {}) } }),
    send: (id: number, content: string) => client.send<ChatMessage>("POST", `/api/conversations/${id}/messages`, { body: { content } }),
    edit: (id: number, messageId: number, content: string) => client.send("PATCH", `/api/conversations/${id}/messages/${messageId}`, { body: { content } }),
    remove: (id: number, messageId: number) => client.send("DELETE", `/api/conversations/${id}/messages/${messageId}`),
    /** Only a group's creator may rename or add. Anyone may leave by removing themselves. */
    changeGroup: (id: number, change: { name?: string; addMemberIds?: number[]; removeMemberIds?: number[] }) => client.send("PATCH", `/api/conversations/${id}`, { body: change }),
  };
}
export type SocialReads = ReturnType<typeof createSocialReads>;
