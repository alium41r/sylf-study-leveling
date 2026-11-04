# Account and profile on Sylf Native

One long page with an index beside it, reached from the foot of Home's rail (`shell/account/AccountPage.tsx`). Only Home has it ([ADR 0012](../decisions/0012-connected-app.md) decision 17). Source wins over this page.

## Sections

| Section | Does | Owner |
| --- | --- | --- |
| You | A live "What others see" preview. Name, username, time zone, email. Bio, frame, title, name colour and links | `user/account`, `profile/customization`, `cosmetics` |
| Study | A doorway: the daily target, rest days and subjects open Plan, the rhythms open Focus. **No second copy** | Plan, Focus |
| Appearance | The Theme Studio, out from behind `DEV_TOOLS`, as its own page. Kept on the device | `packages/design-system/src/studio` |
| Privacy | Eight settings, each with who sees what in a sentence. Three levels | `user/privacy`, `lib/privacy.ts` |
| Notifications | The account's switches, and this device's permission beside them | `notifications/preferences`, `shell/focus/alerts.ts` |
| Security | Change password, devices with this one marked, sign out everywhere, linked accounts | `user/security`, `user/sessions`, `auth/logout-all`, `user/connections` |
| Leaving | Reset progress, delete account. Two steps each | `user/reset-progress`, `user/account/delete`, `user/security/send-code` |

Reads are in `packages/backend/src/account.ts` and `shell/account/useAccount.ts`. All of it is memory only and goes at sign-out with the rest of the cache.

## Rules that hold

- **Email change** takes the password, or a `CHANGE_EMAIL` code for an account with no password, and the old address is told (step 0).
- **Reset and delete** ask a verified account for an emailed code, and an unverified one for its password (`ProofSheet`). The first step says what is lost, and the second is the proof. Deleting also removes the account's sessions and unsent journal from the device (`forgetOwner` on the session model and the backend), so nothing of it is left.
- **Privacy has three levels,** Public, Friends and Only me. `GROUPS` exists in code and not in the database's enum, so it is never offered.
- **Profile is chosen from what is owned.** The server refuses anything else (`lib/cosmetic-policy.ts`), and buying stays in World. Aura is not here yet: owned auras live in the inventory, which Native does not read.
- **Appearance stays on the device.** It is seeded once, per account, from `activeTheme` and `activeBackground` when they hold a real custom colour and the appearance is untouched (`appearance-seed.ts`), and nothing is written back, because Native's themes are not web's.
- **No stubs.** There is no two-step sign-in and no "link an account": both are 501 stubs on the server, so no control exists for them.
- **An account with no password** says so, and offers none. Linked accounts can't be unlinked if one is the only way in.

## Password reset

A student who has forgotten their password asks for a link, from the web's sign-in or from Native's ("Forgot your password?").

| Step | Route | Rule |
| --- | --- | --- |
| Ask | `POST /api/auth/forgot-password` | Unauthenticated, **neutral**: the same answer whether or not an account matches, and the work happens after the answer, so timing says nothing. 5 requests per address per 15 minutes, 3 per email per 30 minutes (the second is silent) |
| Link | `lib/password-reset.ts` | 32 random bytes, only the **hash** stored, **30 minutes**, one link per account (a newer one replaces it). The address comes from `APP_PUBLIC_URL` (or `VERCEL_PROJECT_PRODUCTION_URL`), never from the request's Host header. The token is in the URL fragment, so it reaches no server log or Referer |
| Use | `POST /api/auth/reset-password`, page `/reset-password` | **Single use**: deleting the token is the claim, inside the transaction that sets the password and bumps `tokenVersion`. Every device is signed out, and the owner is mailed |

Only an account that has a password can be reset this way. An account made with Google, Apple or another provider has none to forget, and giving it one by email alone would change how it is protected. Without `APP_PUBLIC_URL` in production, no link is sent and the server says so in its log. Tests: `__tests__/backend/postgres/password-reset.postgres.ts` (written, not run).

## Not built

- Aura choice, banner and avatar upload (approved hosts only).
- Linking a provider.
- A "this is how a friend sees it" check against `profile/[username]`: the preview uses the same fields from `user/stats`.
