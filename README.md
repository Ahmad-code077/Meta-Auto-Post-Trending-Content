# Automation Hub

An internal admin dashboard that combines two independent products in one Next.js app:

1. **Meta Automation**: moderation of generated posts. Request an image, approve content, and publish to Instagram and Facebook through n8n.
2. **Job Applications**: a personal profile, a resume, and an AI harness that turns a job posting into a reviewed, evidence-based application email. Drafts are sent directly over SMTP after you approve them.

Both products share authentication, the Supabase client, the UI primitives and the app shell. Their pages, server actions, data helpers and components are kept apart.

## Status

| Area | State |
| --- | --- |
| Post moderation: list, filter, paginate, generate image, publish, delete old posts | Built (n8n) |
| Job applications: list, filter, details | Built |
| Job intake: paste posting, analyze, create draft | Built |
| Draft review, editing and SMTP send with the current resume attached | Built |
| Follow-ups: scheduled automatically 7 days after an application, sent by the cron scheduler, with retries | Built |
| Recruiter replies: detected over IMAP, cancels pending follow-ups | Built |
| Follow-up drafts written by hand (manual drafts, server actions) | Built. No UI yet |
| Personal profile: details, skills, experience, projects, resume (`/dashboard/profile`) | Built |
| Approve and reject posts | Server actions exist. No UI yet |
| Hashtag management, auto-replies, resume parsing | Not in this repo |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

Apply the database migration once: `supabase db push`, or run `supabase/migrations/*.sql` in the SQL editor.

Run the deterministic tests (no network, no model calls): `npm test`.

Access is admin-only. Signup is disabled, so create the admin user in the Supabase dashboard.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | proxy, server and browser clients | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | proxy, server and browser clients | Supabase publishable key |
| `OPENAI_API_KEY` | `lib/harness/openai.ts` | Job analysis and email writing |
| `OPENAI_MODEL` | `lib/harness/openai.ts` | Model id. Defaults to `gpt-4.1` |
| `SMTP_HOST` | `lib/mail/smtp.ts` | SMTP server hostname |
| `SMTP_PORT` | `lib/mail/smtp.ts` | `587` for STARTTLS (default), `465` for implicit TLS |
| `SMTP_SECURE` | `lib/mail/smtp.ts` | `true` for implicit TLS (port 465). Default `false` |
| `SMTP_REQUIRE_TLS` | `lib/mail/smtp.ts` | Default `true`. Refuses to send over an unencrypted connection |
| `SMTP_USER` / `SMTP_PASS` | `lib/mail/smtp.ts` | SMTP credentials |
| `SMTP_FROM` | `lib/mail/smtp.ts` | Display name for the From header, and the address only if `SMTP_USER` is not one. The From address is `SMTP_USER`; its domain is used for Message-IDs |
| `IMAP_HOST` | `lib/inbox/imap.ts` | Defaults to `imap.gmail.com` |
| `IMAP_PORT` | `lib/inbox/imap.ts` | Defaults to `993` (TLS) |
| `IMAP_USER` / `IMAP_PASS` | `lib/inbox/imap.ts` | Default to `SMTP_USER` / `SMTP_PASS`. Set them only if the mailbox differs |
| `CRON_SECRET` | `app/api/cron/follow-ups`, `app/api/cron/inbox-sync` | Bearer token that authorizes both cron routes. Vercel Cron sends it when set on the project. Unset means the endpoints refuse every request |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` | Service-role client for the scheduler, which has no user session. Server only. Bypasses row level security, so every scheduler query filters by `user_id` |
| `N8N_WEBHOOK_SECRET` | Meta actions | Sent as `Authorization: Bearer` to the Meta webhooks |
| `NEXT_PUBLIC_N8N_GENERATE_IMAGE_WEBHOOK_URL` | `app/actions/posts.ts` | Image generation webhook |
| `NEXT_PUBLIC_N8N_PUBLISH_POST_WEBHOOK_URL` | `app/actions/posts.ts` | Publish webhook |

The `NEXT_PUBLIC_` prefix on the n8n URLs is historical. Those values are read only in server code. Renaming them is a follow-up.

Email no longer goes through n8n. The `NEXT_PUBLIC_SEND_EMAIL_WEBHOOK_URL` and `N8N_JOB_INTAKE_WEBHOOK_URL` variables are obsolete and can be removed.

## Architecture

```
proxy.ts                          Refreshes the Supabase session; redirects signed-out users to /login
next.config.ts                    Redirects / to /dashboard
supabase/migrations/              Schema: profile, skills, experiences, projects, resumes, application emails

app/
  login/, auth/confirm/, api/auth/confirm/
  dashboard/
    page.tsx                      Meta: posts moderation
    job-posts/page.tsx            Applications list, details, send
    job-posts/new/page.tsx        Paste a job posting, analyze, create draft
    components/                   Shell. Navigation comes from lib/nav.ts
  actions/
    posts.ts                      Meta server actions (ownership-checked)
    applications.ts               Job intake, draft, follow-up, send
    profile.ts                    Profile, skills, experiences, projects, resume upload

lib/
  harness/                        The application pipeline (see below)
  mail/
    smtp.ts                       nodemailer transport, configured from env
    send.ts                       Claims a draft, sends it, records the result
  data/
    posts.ts, jobs.ts             Read queries
    profile.ts                    Loads the whole profile in one call
  supabase/                       Clients, plus requireUser() for server actions
  types/                          Domain types, ActionResult, application and profile shapes
  nav.ts                          Navigation config

components/
  ui/                             Shared primitives, plus confirm-dialog.tsx
  posts/                          Meta UI only
  jobs/                           Application UI only
```

### The application harness

A draft is produced by a fixed sequence. Only two steps call the model.

```
job posting
  -> 1. analyze        (model, structured)   requirements tagged required / preferred / responsibility
  -> 2. match          (deterministic)       skill aliases, weighted skill hits, bullet overlap, recency
  -> 3. evidence       (deterministic)       best experience bullets and project descriptions, given stable ids E1..En
  -> 4. plan           (deterministic)       requested skills, matched skills, GAP skills, links allowed
  -> 5. write          (model, structured)   sees only the plan and the evidence pack; must cite evidence ids
  -> 6. validate       (deterministic)       every citation exists; skills exist in profile; gaps not mentioned;
                                             no links; numbers come from the source; email names the job
                                             one retry with the failures listed, then the run stops
  -> 7. draft          persisted to application_emails with the full generation record
```

The model never receives the whole profile. It only sees the plan and the evidence pack, so it cannot draw on skills that were not selected. Validation runs on the output regardless, so a wrong draft is rejected even if the model ignores its instructions.

**Persisted:** profile, skills, experiences, projects, resume versions, job analysis (cached on `jobs.analysis` by a hash of the posting), drafts, and their generation record (plan, evidence, citations, model, prompt version, attempts).

**Recomputed:** match scores and the evidence ranking. They are cheap and always derive from the current profile. The ranking used for a sent email is kept in its generation record.

Follow-ups use a separate pipeline. They receive the job, the previous email, and the number of days since it was sent. They receive no profile, no links and no skills. Validation rejects any new claim, link, or number not found in the earlier email.

### Sending

`lib/mail/send.ts` is the only code that marks an email as sent.

1. The draft is claimed atomically (`draft` or `failed` to `sending`). Two requests cannot both send.
2. The resume is attached to the first application only. It is downloaded from the private `resumes` bucket.
3. SMTP accepts the message. Only then is the row set to `sent`, with the SMTP Message-ID.
4. The job advances: `sent` with a 7-day follow-up date, or `follow_up_1` / `follow_up_2`.

The message is plain text only: one `text` part, no HTML. The From address is the authenticated SMTP account (`SMTP_USER`), with the display name from `SMTP_FROM`. The Message-ID uses the same domain. See [Sending domain](#sending-domain-spf-dkim-dmarc).

A failed SMTP attempt sets the row to `failed` with the error, and it can be retried. If SMTP accepted the message but the database update then fails, the row stays `sending` and the error log includes the Message-ID, so nobody resends it blindly.

### Conventions

- **Server actions** verify the session with `requireUser()` and filter every query by `user_id`. Do not rely on the proxy alone.
- **Actions return results, they do not throw.** `ActionResult` (`lib/types/actions.ts`) lets the UI show a message and revert optimistic state.
- **Optimistic updates** apply to user-visible status changes: generate, publish, and send email.
- **Irreversible actions** (publish, send email, delete old posts) go through `ConfirmDialog`.
- **Pages never mix products.** Meta lives under `/dashboard`, applications under `/dashboard/job-posts`.

## Sending domain (SPF, DKIM, DMARC)

The repo does not change DNS. These are the records the sending domain needs, set at the DNS provider.

- **The From address is the SMTP account.** `SMTP_USER` is the sender and `SMTP_FROM` gives the display name. Gmail and most providers rewrite a From that does not match the authenticated account, and a From from another domain fails DMARC alignment. The Message-ID uses the same domain.
- **SPF.** A TXT record on the domain lists the servers allowed to send for it, for example `v=spf1 include:<provider> ~all`. Use exactly one SPF record per domain.
- **DKIM.** The provider gives a public key to publish as a TXT (or CNAME) record under a selector, such as `selector._domainkey.<domain>`. Messages are signed with the matching private key.
- **DMARC.** A TXT record at `_dmarc.<domain>`, for example `v=DMARC1; p=none; rua=mailto:<reports address>`. Start with `p=none` to see reports, then move to `quarantine` and `reject` once SPF and DKIM pass for every sender.
- **Gmail accounts (`@gmail.com`).** Google publishes SPF, DKIM and DMARC for these domains, and you cannot add your own DMARC record there. The From is the Gmail account itself, so alignment holds without changes.
- **Check before a campaign.** Send one message to a test inbox and check the headers for `spf=pass`, `dkim=pass` and `dmarc=pass`.

## Follow-up scheduler

An application that is sent gets a follow-up scheduled 7 days later. The follow-up is an `application_emails` row with `kind = 'follow_up'`, `follow_up_number = 1`, and `status = 'scheduled'`. Its text is written when it is processed, not when it is scheduled, so the content reflects the job and the earlier email as they are then.

### Managing follow-ups

The application review page (`/dashboard/job-posts/<id>`) shows each follow-up with its status, scheduled or sent time and attempts. While a follow-up is `scheduled`, you can change its date or cancel it, and both actions ask for confirmation. A `failed` follow-up can be retried only when nothing could have reached the recipient. A `processing` or `sent` follow-up cannot be changed. The server checks ownership and the current status on every action (`lib/followups/manage.ts`), and each change is a conditional update, so a change that races the scheduler is refused.

### When follow-ups are sent

Follow-ups go out on Tuesday, Wednesday or Thursday, between 9:00 and 11:00 AM in `FOLLOW_UP_TIMEZONE` (default `Asia/Karachi`). Mondays, Fridays and weekends are skipped, because inboxes are busiest on Monday and quiet on Friday. An automatic follow-up is due 7 days after the application is sent. Its due time is then placed at a random point inside the window: between 9:00 and 10:59 AM on the first Tuesday-to-Thursday day that falls on or after that date (`jitteredSendSlot` in `lib/followups/schedule.ts`). The random point is picked once, when the follow-up is scheduled, so two follow-ups do not share a due time. Manual reschedules outside the window are refused with the rule in the message.

Jitter is applied by the scheduler at run time too:

- **Window check before each send.** A run never sends outside the window. If the window has closed, or the run has already sent `MAX_SENDS_PER_RUN` (8), the follow-up moves to a jittered slot in the next window without being claimed. Its attempt count does not change.
- **Pauses between sends.** Each send after the first waits a random 5 to 20 seconds, so one run does not send in a steady rhythm.
- **Unchanged rules.** The claim, the fenced writes, the retry policy and the cancellation checks run exactly as before. A moved follow-up is not an attempt.

The cron runs at 04:00 UTC, which is 09:00 in Karachi. If you change `FOLLOW_UP_TIMEZONE`, change the cron times in `vercel.json` by the same offset. The inbox sync runs at 03:00 UTC, so replies are checked before the follow-ups go out.

### Trigger

`vercel.json` runs `GET /api/cron/follow-ups` once a day at 04:00 UTC (`0 4 * * *`), which is 09:00 in Karachi. That schedule works on every Vercel plan. Retries and due times depend on the frequency: with a daily trigger, a retry runs on the next day's trigger.

**The daily trigger limits the jitter.** A daily run only sends follow-ups that are due at the moment it runs. Follow-ups due later in the window wait for the next run, which is the next day. On a Hobby plan that means most sends happen at about 09:00 Karachi, and the jitter only moves the due date, not the send time. To spread sends across the window, run the scheduler more often during the window, for example hourly on Tuesday to Thursday (`0 4-6 * * 2-4`, which needs a plan that allows more than one run per day). Test this before relying on it.

The route only authenticates and reports. `lib/followups/scheduler.ts` decides what is due and what to do with it.

### Authentication

The route requires `Authorization: Bearer <CRON_SECRET>`. The comparison is constant time. If `CRON_SECRET` is not set, the route returns 503 and never authorizes a request. Failed attempts are logged as `cron.unauthorized` without the header value.

### States

```
scheduled --claim (due)--> processing --generate & send--> sent
scheduled <--release-- processing                        (retry, while attempts remain)
processing --------------> failed                        (not retryable, attempts used up, or stale claim)
scheduled --------------> cancelled                     (the job no longer awaits this follow-up)
```

- `scheduled`: `due_at` is set. `attempts` counts the attempts made so far.
- `processing`: claimed by one worker. `claim_token` and `claimed_at` identify the claim.
- `sent`: only written after SMTP accepts the message. `message_id` and `sent_at` are set.
- `failed`: `error` and `error_code` say why. A person can resend it from the review page.
- `cancelled`: the job was replied to or closed before the follow-up was due.

### Idempotency

- **Claim.** A single conditional `UPDATE` moves a row from `scheduled` to `processing`. It matches only when the status is `scheduled`, `due_at` has passed, and `attempts` equals the value the worker read. If two workers read the same row, only one matches.
- **Fencing.** Every later write requires the same `claim_token` and `status = 'processing'`. A worker that lost its claim cannot overwrite the result of the worker that took over.
- **Database guard.** A partial unique index allows at most one live (`scheduled` or `processing`) follow-up per job and number.
- **Stale claims.** A `processing` row whose claim is older than 20 minutes has lost its worker. It is marked `failed` with `STALE_CLAIM`, and never resent automatically, because the email may already have been delivered.

### Retry policy

| Failure | Where | Outcome |
| --- | --- | --- |
| Generation error (AI or network) | before send | retry, nothing was sent |
| SMTP `ECONNECTION` or `EDNS` | before the message body | retry |
| SMTP `ETIMEDOUT`, `ESOCKET`, `EAUTH`, `EENVELOPE`, other | after the message may have reached the server | `failed`, no retry |
| No earlier sent email, job no longer awaiting a reply | any | `failed` or `cancelled`, no retry |

Retries wait 15 minutes after the first failure, 60 minutes after the second, and then stop at the third attempt, which marks the row `failed`. The delays are in `lib/followups/policy.ts`. A failed follow-up is never retried after an SMTP failure that could have delivered the message, so a retry can never send a second copy.

### Logs

Each run writes one-line JSON to the function logs, with events such as `followup.scheduler.start`, `followup.discovered`, `followup.claimed`, `followup.generation.start|success|failed`, `followup.send.start|success|failed`, `followup.retry_scheduled`, `followup.sent`, `followup.failed`, `followup.cancelled`, and `followup.scheduler.end`. Each carries the follow-up, job and attempt ids, plus `error_code` and a scrubbed `error_message` where relevant.

Passwords, API keys, `CRON_SECRET`, the service-role key, tokens, email bodies and subjects, recipient addresses and resume contents are never logged. `lib/log/logger.ts` drops keys that could hold them, and tests check that they do not appear.

## Recruiter replies

The app sends mail over SMTP but could not read any, so replies were invisible. The inbox sync reads the sending mailbox over IMAP, read-only, and records replies.

### Architecture

- **Provider: IMAP with an app password.** Gmail API was not chosen. It needs a Google Cloud project, an OAuth consent screen, and a restricted-scope review for the read scope. Refresh tokens also expire every seven days while the app is in test mode. IMAP needs only the credentials the SMTP account already uses.
- **Read-only, headers only.** The provider fetches `In-Reply-To`, `References`, `Auto-Submitted`, `Precedence` and the envelope with `BODY.PEEK`. Messages are not marked read, and no body is downloaded or stored.
- **Trigger: `GET /api/cron/inbox-sync`.** Vercel Cron calls it at 03:00 UTC, an hour before the follow-up scheduler (04:00 UTC), so a reply that arrived overnight is recorded before the day's follow-ups run. It can also be called by hand with `Authorization: Bearer <CRON_SECRET>`. Replies are picked up at most once a day on the Hobby plan.

### Matching

`lib/inbox/match.ts` is deterministic. In order:

1. `In-Reply-To` names one of our sent Message-IDs. Match.
2. `References` names one of our sent Message-IDs. Match.
3. The sender is the recruiter address we wrote to, and that address belongs to exactly one awaiting application. Match.
4. The subject names the company or role of one application. This is reported for review and never changes the application.

Ignored: automated mail (Auto-Submitted, bulk precedence, bounces, no-reply senders), mail from our own address, mail received before we sent the email, a message with no Message-ID, and any sender whose address maps to more than one application. Only awaiting statuses (`sent`, `follow_up_1`, `follow_up_2`) can be marked.

### What is recorded, and the state change

Outbound headers are already stored on each sent email (`message_id`, `in_reply_to`, `references_header`, `to_email`, `sent_at`). Matching uses them directly.

When a reply is matched, the job is updated first, then its scheduled follow-ups are cancelled:

- `jobs.status = 'replied'`, which is an existing status. The job is no longer awaiting a reply, so every existing guard refuses to send. That includes the scheduler, manual follow-up drafts, the reschedule and retry actions, and the send path.
- `jobs.replied_at`, `jobs.reply_message_id` (normalized, used to recognise the same message again), `jobs.reply_match` (the method that matched).
- Scheduled follow-ups become `cancelled` with `error_code = 'RECIPIENT_REPLIED'`. Processing and sent follow-ups are not touched.

### Scheduler and race handling

The scheduler checks eligibility at the claim, before it writes any text, and again after the text is written and immediately before the SMTP call. A reply recorded at either point cancels the follow-up with no AI call after the first check and no SMTP call at all. The check after the text is written covers replies that arrive during generation.

A reply that is recorded in the final moments, after the second check and before SMTP accepts the message, cannot be stopped. SMTP cannot be undone. The window is the time of one SMTP call.

### Required database changes (not in the repo)

These must be applied by your database process:

```sql
alter table public.jobs
    add column if not exists replied_at        timestamptz,
    add column if not exists reply_message_id  text,
    add column if not exists reply_match       text;
```

The sync and the timeline read these columns. If they are missing, the sync fails before it changes anything, because the job update is one statement.

### Configuration

For Gmail: enable 2-Step Verification on the account, create an app password, and use it as `SMTP_PASS`. Enable IMAP in Gmail settings. Set the same values on Vercel for Production.

Confirmed in testing: Gmail keeps the Message-ID we set on outgoing mail, so a reply's `In-Reply-To` matches it exactly, and matching by header is the normal path. The sender fallback exists for mail systems that do rewrite it.

## Using the system end to end

1. **Profile** (`/dashboard/profile`): details and links, skills, experience, projects, and the resume. The profile is the only source the harness uses.
2. **New application** (`/dashboard/job-posts/new`): paste the job posting. It is analyzed, matched against the profile, and a draft is written.
3. **Review** (`/dashboard/job-posts/<id>`): edit the subject and body, see which profile entries the draft is based on, regenerate, or send. Sending requires saved edits, and attaches the resume that is current at send time.

## Data model

Every table has `user_id` and row level security (`user_id = auth.uid()`).

| Table | Purpose |
| --- | --- |
| `profiles` | One per user: name, headline, location, contact email, summary, LinkedIn, GitHub, portfolio |
| `profile_skills` | Each skill once per user, with `normalized_name` and `aliases` for matching |
| `experiences` | Company, role, dates, `responsibilities[]`, `achievements[]` |
| `experience_skills` | Which skills an experience used |
| `projects` | Name, URL, description, contribution, dates |
| `project_skills` | Which skills a project used |
| `resumes` | One row per upload. `is_current` marks the active version. Files are in the private `resumes` bucket at `<user_id>/<resume_id>.pdf` |
| `application_emails` | Drafts, sent mail and follow-ups. `kind`, `status`, `message_id`, threading headers, `generation` |
| `jobs` (existing) | One row per posting and application. Extended with `analysis`, `analysis_hash`, `analysis_version`, `analyzed_at` |
| `posts` (existing) | Meta product |

Skills are stored once and linked from experiences and projects. Skill names are never copied into those rows.

## Tests

Inbox matching, the sync, and the scheduler's reply checks are covered by `tests/inbox.test.ts` and `tests/followups.test.ts`. They use in-memory stores and providers, so no mailbox, Supabase or OpenAI is contacted.

`npm test` compiles `tests/` with the TypeScript compiler already in the repo, and runs each file with Node's built-in test runner. No new dependency is needed, and no test calls OpenAI, SMTP or Supabase. The scheduler tests run the real state machine against an in-memory store that follows the same conditional-write rules as the database. Those rules are checked by the tests, not by a live database, so a real two-worker race in production is still worth a manual check.

## Webhook contract (n8n, Meta only)

All requests are `POST` with a JSON body and `Authorization: Bearer <N8N_WEBHOOK_SECRET>`.

| Action | Body |
| --- | --- |
| Generate image | `{ postId, action: "generate_image" }` |
| Publish | `{ postId, action: "publish", platforms: ["instagram" \| "facebook"] }` |

Open question: publishing does not write `published` to Supabase on our side. The app assumes n8n does, so confirm the workflow updates the row.

## Layout

The `lg` breakpoint (1024px) switches the sidebar to a drawer and job applications to cards. Posts use a single table that scrolls horizontally on narrow screens.

Colors are oklch tokens in `app/globals.css`, with light and dark variants. The primary color is the green in `--primary`.
