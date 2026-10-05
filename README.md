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
| Follow-up drafts and sending | Built (server actions). No UI yet |
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
| `SMTP_FROM` | `lib/mail/smtp.ts` | Sender address, optionally `Name <address@example.com>`. Its domain is used for Message-IDs |
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

A failed SMTP attempt sets the row to `failed` with the error, and it can be retried. If SMTP accepted the message but the database update then fails, the row stays `sending` and the error log includes the Message-ID, so nobody resends it blindly.

### Conventions

- **Server actions** verify the session with `requireUser()` and filter every query by `user_id`. Do not rely on the proxy alone.
- **Actions return results, they do not throw.** `ActionResult` (`lib/types/actions.ts`) lets the UI show a message and revert optimistic state.
- **Optimistic updates** apply to user-visible status changes: generate, publish, and send email.
- **Irreversible actions** (publish, send email, delete old posts) go through `ConfirmDialog`.
- **Pages never mix products.** Meta lives under `/dashboard`, applications under `/dashboard/job-posts`.

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
