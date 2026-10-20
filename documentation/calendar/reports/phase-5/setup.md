# Connected calendar setup

Implementation is in this checkout. Real Google/Microsoft account qualification and a deployment of Phase 5 remain required; mocked tests do not replace those steps.

The non-secret variable template is [environment.example](../../environment.example).

## 1. Choose the deployment origin

On 18 October 2026, TLS-validated checks returned HTTP 200 for **https://sylf-alium41rs-projects.vercel.app/**. **https://sylf.app/** failed certificate validation because its certificate was expired. No TLS bypass was used. Fix the custom-domain certificate in Vercel/domain DNS before switching to it.

Deploy this checkout's intended release before connecting an account. The additive calendar migration has been applied to this checkout's configured database; apply it through the project's migration process for any other deployment database and regenerate Prisma. Do not reset existing data or rerun SQL already applied. The existing public deployment was reachable, but its presence does not mean Phase 5 is deployed. Set this **server-only** environment variable on the deployment:

```dotenv
CALENDAR_PUBLIC_URL="https://sylf-alium41rs-projects.vercel.app"
```

This single configurable origin generates the dedicated OAuth callbacks and notification URLs. After the custom domain has valid TLS and serves the same release, change the variable to `https://sylf.app` and register its callback URLs too. Start new connections from the same origin as the callback so the existing signed-in Sylf cookie/session can validate the response. Avoid deployment-protection/login gates on provider notification endpoints; never bypass authentication on account endpoints.

For localhost-only development, `CALENDAR_PUBLIC_URL=http://127.0.0.1:3000` is supported outside production. Register matching loopback callbacks in a development OAuth app. Provider webhooks require a publicly reachable HTTPS origin; polling/manual sync still work when local webhooks are unavailable. Use the verified Vercel origin for public end-to-end qualification after deployment.

## 2. Configure encryption and scheduler secrets

```dotenv
CALENDAR_ENCRYPTION_KEY="<32 random bytes encoded as base64>"
CRON_SECRET="<strong independent random secret>"
```

A random encryption key was prepared in the ignored, owner-readable `.env.local` for this development checkout. No secret value is included in this guide or committed files. Back up your production key in your secret manager; use the same key on every server instance/deployment reading this database. Do not casually rotate it: changing it without re-encrypting existing records requires reconnecting affected accounts. OAuth credentials, feed URLs, PKCE verifiers and sync cursors remain server-side; never use a `NEXT_PUBLIC_` variable.

To generate a separate production key locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the output directly in your hosting secret settings. Use a separate database/key pair for staging where practical.

## 3. Google Cloud

1. Open Google Cloud Console. Select the existing Sylf sign-in project or create a dedicated calendar app/project. Enable **Google Calendar API** under APIs & Services → Library.
2. Configure Google Auth Platform / OAuth consent: app name, support contact, privacy policy, intended audience and authorized domains. Add test accounts while the app is in Testing. Calendar access is additional consent; ordinary Google sign-in does not grant it. Public production use may require Google's sensitive-scope verification. Testing-mode refresh tokens can expire after seven days; do not treat Testing as production availability.
3. Create an OAuth **Web application** client, or extend the existing compatible client. Register this exact Authorized redirect URI:

   `https://sylf-alium41rs-projects.vercel.app/api/calendar/connections/callback/google`

   When the certificate is repaired, also register:

   `https://sylf.app/api/calendar/connections/callback/google`

   Keep the existing sign-in callback registered. A dedicated calendar OAuth client is preferable when you want separate grants/revocation from sign-in.
4. Configure server secrets:

```dotenv
GOOGLE_CALENDAR_CLIENT_ID="<web client ID>"
GOOGLE_CALENDAR_CLIENT_SECRET="<web client secret>"
```

   These are optional overrides: if omitted, the calendar reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Their mere presence does not prove the credentials are valid or callbacks registered.
5. The implemented delegated permissions are `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, and `https://www.googleapis.com/auth/calendar.events`. The latter permits editing events on calendars the account can edit; it is needed for existing external events, rather than just app-created events. Do not add Drive, Gmail or directory-wide permissions.
6. The server registers and renews calendar watches automatically after consent. Its public notification receiver is:

   `https://sylf-alium41rs-projects.vercel.app/api/calendar/connections/notifications/google`

   No browser API key or manually copied access token is needed. Keep HTTPS valid and allow provider POSTs to this path. Notifications contain no trusted event payload; they only queue authenticated sync. If registration fails, polling remains the fallback.

References: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync), [push notifications](https://developers.google.com/workspace/calendar/api/guides/push).

## 4. Microsoft Entra

1. Entra admin center → App registrations → New registration. Choose **Accounts in any organizational directory and personal Microsoft accounts** if both Outlook.com and work/school accounts should be supported. The implemented authority is the Microsoft `common` v2 endpoint. Organizational policies may still require administrator consent.
2. Add a **Web** redirect URI:

   `https://sylf-alium41rs-projects.vercel.app/api/calendar/connections/callback/microsoft`

   After custom-domain repair, register `https://sylf.app/api/calendar/connections/callback/microsoft` too. Do not enable an implicit flow or treat this as a browser-only SPA.
3. API permissions → Microsoft Graph → **Delegated**: `User.Read` and `Calendars.ReadWrite`; consent also requests `openid` and `offline_access`. No application-wide mailbox permission or client-credentials flow is used. This implementation targets the signed-in account's calendars; organization-wide/shared-mailbox permissions are not added.
4. Create a client secret under Certificates & secrets. Store its **value**, not its identifier, on the server with the Application (client) ID:

```dotenv
MICROSOFT_CALENDAR_CLIENT_ID="<application client ID>"
MICROSOFT_CALENDAR_CLIENT_SECRET="<secret value>"
```

   Record its expiry in your secret-management process. No Microsoft secret was available during implementation.
5. The app registers and renews the Graph subscription automatically. Its validation/notification receiver is:

   `https://sylf-alium41rs-projects.vercel.app/api/calendar/connections/notifications/microsoft`

   Microsoft must reach it anonymously for its bounded plain-text validation challenge; subsequent notifications are checked against the stored subscription/client-state secret. All account operations still require a valid Sylf session.
6. Default-calendar changes use stable Graph v1.0 `calendarView/delta`. Additional Outlook calendars use paginated bounded `calendarView` snapshots because specific-calendar delta is only documented in beta. No beta scheduling API is enabled.

References: [authorization code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [event delta v1.0](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0), [Graph change notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview), [event resource and transaction IDs](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0).

## 5. Keep sync running while Sylf is closed

Schedule authenticated **GET `/api/cron/calendar-sync` every five minutes**, or more often if the backlog requires it. Send `Authorization: Bearer <CRON_SECRET>`. The receiver uses bounded batches and database leases; overlapping runs are safe. Monitor errors/backlog and ensure your hosting request duration supports 60-second routes. A large installation needs sufficient scheduler/worker throughput; five minutes is a target, not an unconditional delivery guarantee.

`scripts/db/run-calendar-sync.mjs` can be invoked by an existing scheduler with `CALENDAR_PUBLIC_URL` and `CRON_SECRET` in its environment. It calls the deployed endpoint without a browser. If using Vercel Cron, add `/api/cron/calendar-sync` with schedule `*/5 * * * *` to the deployment's existing `vercel.json` cron list, configure the same `CRON_SECRET`, and use a plan that supports that frequency. [Vercel Hobby limits cron to once daily](https://vercel.com/docs/cron-jobs/usage-and-pricing); that is insufficient for this polling fallback. No paid service or hosting upgrade was purchased or enabled. An existing suitable scheduler is also supported.

Provider notifications and post-response drains accelerate updates, but they do not replace the scheduler: notifications can be lost and subscriptions expire. OAuth and notification endpoints are implemented; no scheduler was provisioned in an external account by this task.

## 6. Apple / other calendars

Calendar settings → Connected calendars → Apple or another calendar subscription. Supply a public HTTPS or `webcal` ICS subscription and a name. For iCloud, use the calendar's **Public Calendar** share link. Such a link grants read access to anyone holding it; choose a calendar you intend to expose and do not paste account passwords. Sylf encrypts the link at rest and fetches it server-side. This is **read-only**, not Apple account OAuth or CalDAV write synchronization. Public DNS/TLS access is required; private network feeds and authenticated URLs are deliberately unsupported.

[Apple calendar sharing guidance](https://support.apple.com/en-mide/guide/iphone/iph7613c4fb/ios).

## 7. Required real-account qualification

After deploying and setting secrets, sign into Sylf at the configured origin and connect a Google test account, then personal and/or work Microsoft accounts. Verify consent/reconnect, multiple calendars, first sync, an event changed in the provider, a Sylf-created external event, edited/deleted events, recurring series and one moved/cancelled occurrence, reminders delivered only by the provider, simultaneous edits returning a conflict, disconnect preserving native Sylf content, and sync with every Sylf tab closed.

For Graph, explicitly qualify conditional PATCH/DELETE (`If-Match`, including 412 handling), local timezone/DST (including repeated hours and month-end/leap-day recurrence), transaction-ID replay, additional-calendar pagination and organizational consent on the target tenants. Mocked tests assert these contracts but cannot prove a tenant's behavior. For Google, qualify token expiry/revocation, watch renewal, incremental reset and original occurrence identities. Do not advertise real-account readiness until these checks pass. The [implementation report](report.md) records the local evidence and remaining limits.
