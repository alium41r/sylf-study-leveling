# Waitlist confirmation email

`app/api/waitlist/route.ts` commits a new entry before calling
`sendWaitlistWelcomeEmail` in `lib/email.ts`. Existing entries do not receive
duplicate confirmations. An email failure is logged and never reverses signup.
`lib/emails/waitlist-welcome.ts` produces the HTML and plain-text versions.

## Current Gmail configuration

Keep `SMTP_USER` and `SMTP_PASS` (a Google app password), with
`WAITLIST_EMAIL_PROVIDER=auto` or `smtp`. Defaults are `smtp.gmail.com`, port
465. Port 587 uses required STARTTLS. A personal Gmail account must send as its
authenticated address; the default display name is Sylf. Do not replace its
From address with `hello@sylf.study` while still using personal Gmail SMTP.
Use a monitored sending mailbox or `WAITLIST_EMAIL_REPLY_TO` for replies and
waitlist removal requests. Removal requests are handled manually; this email
does not implement automated unsubscribe or a launch-announcement sender.

`auto` preserves SMTP-first selection, then Resend if SMTP credentials are
absent. There is no cross-provider retry after a dispatch failure, avoiding
duplicates and unexpected sender changes. Missing configuration in production
returns a failure; development can log a preview. Provider acceptance does not
establish receipt or inbox placement.

## Gmail spam troubleshooting

In Gmail on the web, open the affected message, select its three-dot menu and
**Show original**. Check SPF, DKIM and DMARC results, the actual From address,
and the Return-Path. SPF authorizes sending servers, DKIM authenticates the
signature, and DMARC checks alignment with the visible sending domain. Personal
Gmail manages authentication for its own domain; do not add gmail.com DNS records
to a Sylf domain. The screenshot alone cannot establish why Gmail filtered it.

After deploying, use a new signup with a Gmail mailbox you control to inspect the
received message and its authentication results. A repeat signup intentionally
does not resend. Check server logs for the provider acceptance ID or failure.
Use **Not spam** for the expected confirmation that Gmail already misplaced.
Sender reputation and recipient feedback can still affect placement even when
authentication passes. The design/content update is not an inbox guarantee.

See [Google sender requirements](https://support.google.com/mail/answer/81126)
and [Resend's Gmail delivery guidance](https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder).

## Optional domain sender migration

First own and configure the domain. Add it in Resend and publish the exact DKIM
and SPF records Resend provides; verify the domain in that dashboard. Configure
DMARC for the sending domain and a monitored reply mailbox. Disable click/open
tracking for this confirmation in the provider settings. Do not invent DNS
values or enable a strict DMARC policy before verifying legitimate senders.

Then set these production variables and redeploy:

```dotenv
WAITLIST_EMAIL_PROVIDER=resend
RESEND_API_KEY=<your-provider-key>
WAITLIST_EMAIL_FROM="Sylf <hello@your-verified-domain>"
WAITLIST_EMAIL_REPLY_TO=<your-monitored-mailbox>
```

The waitlist overrides leave the SMTP sender used by authentication/security
emails intact. `EMAIL_FROM` and `EMAIL_REPLY_TO` are fallback values for waitlist
mail. Resend requires an explicit sender; its testing domain and Gmail sender
addresses are rejected. Domain verification is the provider's responsibility.

On 3 October 2026, a public Google DNS lookup for `sylf.study` returned NXDOMAIN
(no published domain). This is dated evidence, not a statement of ownership or
registration availability. The user chose to keep Gmail.
