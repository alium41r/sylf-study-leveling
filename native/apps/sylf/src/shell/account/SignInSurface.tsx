// The way into Sylf with a backend behind it. One quiet page on the app's own ground: what Sylf keeps for you on one side, and the door on the
// other. It never appears in a build with no backend. Everything it says is true of this build: there is no password reset on any client, so
// it says that, and it says what happens to study time on this device, because that is what someone locked out wants to know.
import { useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Activity, Button, Callout, Marker, Plane, Segmented, Stack, Text, TextField, useTheme, useWindowClass } from "@sylf/design-system";
import { describeFailureText } from "./failure";
import { useKeyboardLift } from "../useKeyboardLift";
import type { Backend, OAuthProvider } from "@sylf/backend";

type Mode = "sign-in" | "create";

const PROVIDERS: { id: OAuthProvider; label: string }[] = [{ id: "google", label: "Google" }, { id: "github", label: "GitHub" }, { id: "discord", label: "Discord" }, { id: "instagram", label: "Instagram" }];
const KEPT = ["Your sessions, subjects and streak", "Today's plan, on every device", "Your friends and study parties"];
const timezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

export function SignInSurface({ backend, ended, onLater }: { backend: Backend; ended: boolean; onLater: () => void }) {
  const { color, space } = useTheme();
  const { size } = useWindowClass();
  const insets = useSafeAreaInsets();
  const lifted = useKeyboardLift();
  const wide = size !== "compact";
  const [mode, setMode] = useState<Mode>("sign-in");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Asking for a reset link. The answer is the same whether or not an account matches, so it says only that a link is on its way, if there is one to send.
  const [resetting, setResetting] = useState(false);
  const [asked, setAsked] = useState(false);
  const passwordField = useRef<ComponentRef<typeof TextInput>>(null);

  const attempt = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setFailure(null);
    // Success unmounts this page, so only a failure comes back here.
    try { await work(); }
    catch (error) { setFailure(describeFailureText(error)); setBusy(null); }
  };
  const ready = mode === "sign-in" ? identifier.trim() && password : identifier.trim() && password && name.trim() && username.trim();
  const submit = () => {
    if (!ready || busy) return;
    void attempt("password", () => (mode === "sign-in"
      ? backend.auth.signIn({ identifier: identifier.trim(), password })
      : backend.auth.register({ email: identifier.trim(), password, name: name.trim(), username: username.trim(), timezone: timezone() })));
  };
  const switchMode = (next: Mode) => { setMode(next); setFailure(null); setResetting(false); setAsked(false); };
  const sendLink = async () => {
    if (!identifier.includes("@") || busy) return;
    setBusy("reset");
    setFailure(null);
    try { await backend.auth.requestPasswordReset(identifier.trim()); setAsked(true); }
    catch (error) { setFailure(describeFailureText(error)); }
    setBusy(null);
  };
  const stopResetting = () => { setResetting(false); setAsked(false); setFailure(null); };

  const door = (
    <Plane level="raised" radius="xl" testID="signin-plane" style={{ padding: space.xl, gap: space.lg, width: "100%", maxWidth: 420 }}>
      <Segmented<Mode> label="Account" value={mode} options={[{ value: "sign-in", label: "Sign in" }, { value: "create", label: "Create account" }]} onChange={switchMode} />
      {ended ? <View testID="signin-ended"><Callout tone="caution" title="You've been signed out" message="This device's session ended, on another device or because it expired. Sign in to carry on. Anything you studied here stays on this device, and is saved when you're back." /></View> : null}
      {resetting ? (
        <Stack gap="md" testID="signin-reset">
          <Text variant="subheading">Choose a new password</Text>
          {asked ? (
            <Callout tone="positive" title="Check your email" message="If an account uses that address, a link is on its way. It opens in your browser, works once, and lasts 30 minutes." />
          ) : (
            <>
              <Text variant="small" tone="soft">Enter the email you signed up with. Sylf sends a link to choose a new password.</Text>
              <TextField testID="signin-reset-email" label="Email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="go" onSubmitEditing={() => void sendLink()} />
              {failure ? <View testID="signin-error" role="alert"><Text variant="small" tone="critical">{failure}</Text></View> : null}
              <Button title={busy === "reset" ? "Sending" : "Send the link"} variant="emphasis" fill disabled={!identifier.includes("@") || busy !== null} testID="signin-reset-send" onPress={() => void sendLink()} />
            </>
          )}
          <Button title="Back to sign in" variant="ghost" size="small" testID="signin-reset-back" style={{ alignSelf: "flex-start" }} onPress={stopResetting} />
        </Stack>
      ) : (
        <>
          <Stack gap="md">
            {mode === "create" ? <TextField testID="signin-name" label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" returnKeyType="next" /> : null}
            {mode === "create" ? <TextField testID="signin-username" label="Username" helper="Letters, numbers and underscores. Friends find you by this." value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username-new" returnKeyType="next" /> : null}
            <TextField testID="signin-identifier" label={mode === "sign-in" ? "Email or username" : "Email"} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete={mode === "sign-in" ? "username" : "email"} textContentType="username" returnKeyType="next" onSubmitEditing={() => passwordField.current?.focus()} />
            <TextField ref={passwordField} testID="signin-password" label="Password" helper={mode === "create" ? "At least 6 characters." : undefined} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} textContentType={mode === "sign-in" ? "password" : "newPassword"} returnKeyType="go" onSubmitEditing={submit} />
          </Stack>
          {failure ? <View testID="signin-error" role="alert"><Text variant="small" tone="critical">{failure}</Text></View> : null}
          <Button title={busy === "password" ? (mode === "sign-in" ? "Signing in" : "Creating your account") : mode === "sign-in" ? "Sign in" : "Create account"} variant="emphasis" fill disabled={!ready || busy !== null} testID="signin-submit" onPress={submit} />
          {mode === "sign-in" ? <Button title="Forgot your password?" variant="ghost" size="small" testID="signin-forgot" style={{ alignSelf: "flex-start" }} onPress={() => { setResetting(true); setFailure(null); }} /> : null}
          <Stack gap="sm">
            <Text variant="caption" tone="soft">Or continue with</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {PROVIDERS.map((provider) => <Button key={provider.id} title={busy === provider.id ? "Waiting for the browser" : provider.label} size="small" disabled={busy !== null} testID={`signin-${provider.id}`} onPress={() => void attempt(provider.id, () => backend.auth.signInWithProvider(provider.id))} />)}
            </View>
          </Stack>
        </>
      )}
    </Plane>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: color.ground }}>
      <Animated.View style={[{ flex: 1 }, lifted]}>
      <ScrollView testID="signin-surface" keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }}>
        <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", justifyContent: "center", gap: wide ? space.sky : space.xl, width: "100%", maxWidth: 960, alignSelf: "center" }}>
          <Stack gap="lg" flex={wide ? 1 : undefined} style={{ maxWidth: 440 }}>
            <Stack gap="xs">
              <Text variant="display" role="heading" aria-level={1}>Sylf</Text>
              <Text tone="soft">One place for the work in front of you, and everything you've already done.</Text>
            </Stack>
            {wide ? (
              <Stack gap="sm">
                {KEPT.map((line) => <View key={line} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}><Marker /><Text variant="small" tone="soft">{line}</Text></View>)}
              </Stack>
            ) : null}
            <Button title="Study without an account" variant="ghost" size="small" testID="signin-later" style={{ alignSelf: "flex-start" }} onPress={onLater} />
            <Text variant="caption" tone="soft" style={{ maxWidth: 360 }}>Without an account, time stays on this device and earns nothing.</Text>
          </Stack>
          <View style={{ flex: wide ? 1 : undefined, alignItems: wide ? "flex-end" : "stretch" }}>{door}</View>
        </View>
        {busy ? <View aria-hidden style={{ position: "absolute", top: insets.top + space.sm, left: 0, right: 0, alignItems: "center" }}><Activity label="Working" /></View> : null}
      </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
