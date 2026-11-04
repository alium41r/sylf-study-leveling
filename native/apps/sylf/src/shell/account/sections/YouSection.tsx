// You: who this person is, and what others see. Name, username, email and time zone are the account. Bio, frame, title, name colour and links are the
// profile, chosen only from what is owned, because the server refuses anything else. A live preview shows it as a friend sees it. Buying stays in World.
import { useState } from "react";
import { View } from "react-native";
import { Avatar, Button, Callout, Chip, Plane, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { UserStats } from "@sylf/backend";
import { useLiveBackend } from "../../backend";
import { describeFailureText } from "../failure";
import { ProofSheet } from "../ProofSheet";
import { refreshIdentity, useOwnedCosmetics } from "../useAccount";
import { AccountSection } from "./Section";

const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };
const LINKS = ["github", "linkedin", "discord", "twitter", "website"] as const;

function IdentitySheet({ stats, open, onClose }: { stats: UserStats; open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [name, setName] = useState(stats.name ?? "");
  const [username, setUsername] = useState(stats.username ?? "");
  const [zone, setZone] = useState(stats.timezone ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const device = deviceZone();
  const changed = { ...(name.trim() !== (stats.name ?? "") ? { name: name.trim() } : {}), ...(username.trim() !== (stats.username ?? "") ? { username: username.trim() } : {}), ...(zone.trim() && zone.trim() !== stats.timezone ? { timezone: zone.trim() } : {}) };
  const save = async () => {
    if (!backend || busy || !Object.keys(changed).length) return;
    setBusy(true); setFailure(null);
    try { await backend.reads.saveAccount(changed); refreshIdentity(backend); notice("Saved."); onClose(); }
    catch (error) { setFailure(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your details">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" testID="account-name-field" />
          <TextField label="Username" helper="Friends find you by this." value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} testID="account-username-field" />
          <TextField label="Time zone" helper="Your days start and end by this." value={zone} onChangeText={setZone} autoCapitalize="none" autoCorrect={false} testID="account-timezone-field" />
          {device && device !== zone ? <View style={{ flexDirection: "row" }}><Button title={`Use this device's: ${device}`} size="small" variant="ghost" testID="account-use-device-zone" onPress={() => setZone(device)} /></View> : null}
          {failure ? <View role="alert" testID="account-identity-error"><Text variant="small" tone="critical">{failure}</Text></View> : null}
          <Button title={busy ? "Saving" : "Save"} variant="emphasis" disabled={busy || !Object.keys(changed).length} testID="account-identity-save" onPress={() => void save()} />
        </Stack>
      </View>
    </Sheet>
  );
}

function ProfileEditor({ stats }: { stats: UserStats }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const owned = useOwnedCosmetics();
  const [bio, setBio] = useState(stats.bio ?? "");
  const [links, setLinks] = useState<Record<string, string>>(() => Object.fromEntries(LINKS.map((key) => [key, stats.socialLinks?.[key] ?? ""])));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const keysOf = (category: string) => (owned?.data?.cosmetics ?? []).filter((item) => item.category === category).map((item) => item.itemKey);
  const nameOf = (category: string, key: string) => backend?.reads.cosmetic(category, key).name ?? key;
  const save = async (change: Parameters<NonNullable<typeof backend>["reads"]["account"]["saveProfile"]>[0], done = "Saved.") => {
    if (!backend || busy) return;
    setBusy(true); setFailure(null);
    try { await backend.reads.account.saveProfile(change); refreshIdentity(backend); notice(done); }
    catch (error) { setFailure(describeFailureText(error)); }
    setBusy(false);
  };
  const wear = (field: "activeFrame" | "activeTitle" | "activeNameColor", category: string, current: string | null | undefined, free: string) => {
    const keys = [...new Set([free, ...(current ? [current] : []), ...keysOf(category)])];
    return (
      <Stack gap="xs">
        <Text variant="caption" tone="soft">{{ activeFrame: "Frame", activeTitle: "Title", activeNameColor: "Name colour" }[field]}</Text>
        <View role="radiogroup" aria-label={field} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {keys.map((key) => <Chip key={key} radio label={key === free ? "None" : nameOf(category, key)} selected={(current ?? free) === key} disabled={busy} onPress={() => void save({ [field]: key })} />)}
        </View>
      </Stack>
    );
  };
  return (
    <Stack gap="lg" testID="account-profile-editor">
      <TextField label="Bio" helper="Up to 500 characters." value={bio} onChangeText={setBio} multiline maxLength={500} testID="account-bio" />
      <View style={{ flexDirection: "row" }}><Button title="Save bio" size="small" disabled={busy || bio === (stats.bio ?? "")} testID="account-bio-save" onPress={() => void save({ bio: bio.trim() || null })} /></View>
      {wear("activeFrame", "FRAME", stats.activeFrame, "none")}
      {wear("activeTitle", "TITLE", stats.activeTitle, "Novice")}
      {wear("activeNameColor", "NAME_COLOR", stats.activeNameColor, "default")}
      <Text variant="caption" tone="soft">Only what you own is listed. New frames, titles and colours are earned or bought in World.</Text>
      <Stack gap="sm">
        <Text variant="caption" tone="soft">Links</Text>
        {LINKS.map((key) => <TextField key={key} label={key[0].toUpperCase() + key.slice(1)} value={links[key]} onChangeText={(value) => setLinks({ ...links, [key]: value })} autoCapitalize="none" autoCorrect={false} testID={`account-link-${key}`} />)}
        <View style={{ flexDirection: "row" }}><Button title="Save links" size="small" disabled={busy} testID="account-links-save" onPress={() => void save({ socialLinks: Object.fromEntries(LINKS.map((key) => [key, links[key].trim() || null])) })} /></View>
      </Stack>
      {failure ? <View role="alert" testID="account-profile-error"><Text variant="small" tone="critical">{failure}</Text></View> : null}
    </Stack>
  );
}

/** What a friend sees: the same fields, as the server holds them. */
function Preview({ stats }: { stats: UserStats }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const title = stats.activeTitle && stats.activeTitle !== "Novice" ? backend?.reads.cosmetic("TITLE", stats.activeTitle).name ?? stats.activeTitle : null;
  const name = stats.name || stats.username || "You";
  return (
    <Plane level="raised" radius="lg" testID="account-preview" style={{ padding: space.lg, gap: space.md }}>
      <Text variant="caption" tone="soft">What others see</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={name} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="subheading" numberOfLines={1}>{name}</Text>
          <Text variant="caption" tone="soft" numberOfLines={1}>{[stats.username ? `@${stats.username}` : null, title, `Level ${stats.level}`].filter(Boolean).join(" · ")}</Text>
        </View>
      </View>
      {stats.bio ? <Text variant="small">{stats.bio}</Text> : <Text variant="small" tone="soft">No bio yet.</Text>}
    </Plane>
  );
}

export function YouSection({ stats, onPlace }: { stats: UserStats; onPlace: (id: string, y: number) => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [editing, setEditing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [zoneMismatch] = useState(() => { const device = deviceZone(); return device && stats.timezone && device !== stats.timezone ? device : null; });
  const by = stats.hasPassword ? "password" : "code";
  const changeEmail = async (proof: { code: string } | { password: string }) => {
    if (!backend) return;
    await backend.reads.saveAccount({ email: email.trim(), ...("code" in proof ? { code: proof.code } : { currentPassword: proof.password }) });
    refreshIdentity(backend);
    notice("Email changed. The old address was told.");
  };
  return (
    <AccountSection id="you" title="You" onPlace={onPlace}>
      <Preview stats={stats} />
      <Stack gap="xs">
        <Text variant="small" testID="account-email">{stats.email}</Text>
        <Text variant="caption" tone="soft">{stats.timezone ? `Time zone ${stats.timezone}.` : "No time zone set."}</Text>
      </Stack>
      {zoneMismatch ? <Callout title="This device is in another time zone" message={`It says ${zoneMismatch}, and your account says ${stats.timezone}. Your days follow the account until you change it.`} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button title="Edit details" testID="account-edit" onPress={() => setEditing(true)} />
        <Button title="Change email" variant="ghost" testID="account-change-email" onPress={() => setEmailing(true)} />
      </View>
      <ProfileEditor stats={stats} />
      {editing ? <IdentitySheet stats={stats} open onClose={() => setEditing(false)} /> : null}
      <Sheet open={emailing} onClose={() => setEmailing(false)} title="Change email">
        <View style={{ padding: space.lg }}>
          <Stack gap="md">
            <Text variant="small">Your old address is told, so nobody can move your account quietly.</Text>
            <TextField label="New email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" testID="account-new-email" />
            <Button title="Continue" variant="emphasis" disabled={!email.includes("@")} testID="account-email-continue" onPress={() => { setEmailing(false); setAsking(true); }} />
          </Stack>
        </View>
      </Sheet>
      <ProofSheet open={asking} onClose={() => setAsking(false)} action="CHANGE_EMAIL" title="Confirm it's you" consequence={by === "password" ? `Enter your password to change your email to ${email.trim()}.` : `We'll email a code to ${stats.email}. Enter it to change your email to ${email.trim()}.`} confirmLabel="Change email" by={by} onConfirm={changeEmail} />
    </AccountSection>
  );
}
