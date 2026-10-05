-- Personal profile, resume storage and application emails.
--
-- Extends the existing `jobs` table (one row per job posting and application)
-- instead of creating a separate applications table. Every table is scoped to
-- auth.users via user_id and protected by row level security.
--
-- Apply with `supabase db push`, or paste into the SQL editor.

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
    user_id        uuid primary key references auth.users (id) on delete cascade,
    full_name      text,
    headline       text,
    location       text,
    phone          text,
    contact_email  text,
    summary        text,
    linkedin_url   text,
    github_url     text,
    portfolio_url  text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- One skill row per user. `normalized_name` drives matching against job requirements,
-- `aliases` covers spelling variants such as "Postgres" and "PostgreSQL".
create table if not exists public.profile_skills (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    name            text not null,
    normalized_name text not null,
    aliases         text[] not null default '{}',
    created_at      timestamptz not null default now(),
    unique (user_id, normalized_name)
);

create table if not exists public.experiences (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    company          text not null,
    role             text not null,
    location         text,
    start_date       date,
    end_date         date,                 -- null means current role
    responsibilities text[] not null default '{}',
    achievements     text[] not null default '{}',
    position         integer not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create table if not exists public.experience_skills (
    experience_id uuid not null references public.experiences (id) on delete cascade,
    skill_id      uuid not null references public.profile_skills (id) on delete cascade,
    user_id       uuid not null references auth.users (id) on delete cascade,
    primary key (experience_id, skill_id)
);

create table if not exists public.projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    name         text not null,
    url          text,
    description  text,
    contribution text,                     -- what the user personally did
    start_date   date,
    end_date     date,
    position     integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists public.project_skills (
    project_id uuid not null references public.projects (id) on delete cascade,
    skill_id   uuid not null references public.profile_skills (id) on delete cascade,
    user_id    uuid not null references auth.users (id) on delete cascade,
    primary key (project_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- Resume
-- ---------------------------------------------------------------------------

-- Files live in a private bucket at `<user_id>/<resume_id>.pdf`. Replacing the
-- resume inserts a new row and marks the old one as not current. Old files are
-- kept so that sent applications still point at the version they used.
create table if not exists public.resumes (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    storage_path text not null,
    file_name    text not null,
    content_type text not null,
    size_bytes   integer not null,
    is_current   boolean not null default true,
    created_at   timestamptz not null default now()
);

create unique index if not exists resumes_one_current_per_user
    on public.resumes (user_id) where is_current;

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Applications: extend jobs
-- ---------------------------------------------------------------------------

alter table public.jobs
    add column if not exists analysis         jsonb,
    add column if not exists analysis_version integer,
    add column if not exists analysis_hash    text,
    add column if not exists analyzed_at      timestamptz;

-- ---------------------------------------------------------------------------
-- Application emails: drafts, sent mail and follow-ups
-- ---------------------------------------------------------------------------

create table if not exists public.application_emails (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid not null references auth.users (id) on delete cascade,
    job_id               uuid not null references public.jobs (id) on delete cascade,
    kind                 text not null check (kind in ('application', 'follow_up')),
    follow_up_number     smallint check (follow_up_number between 1 and 2),
    status               text not null default 'draft'
                             check (status in ('draft', 'sending', 'sent', 'failed')),
    subject              text not null,
    body                 text not null,
    to_email             text not null,
    resume_id            uuid references public.resumes (id) on delete set null,
    message_id           text,              -- RFC 5322 Message-ID we sent
    in_reply_to          text,
    references_header    text,
    sent_at              timestamptz,
    error                text,
    generation           jsonb,             -- plan, evidence pack, citations, model, prompt version
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    constraint follow_up_number_matches_kind
        check ((kind = 'follow_up') = (follow_up_number is not null))
);

create index if not exists application_emails_job_idx
    on public.application_emails (job_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array[
        'profiles', 'profile_skills', 'experiences', 'experience_skills',
        'projects', 'project_skills', 'resumes', 'application_emails'
    ]
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists "owner access" on public.%I', t);
        execute format(
            'create policy "owner access" on public.%I for all to authenticated '
            'using (user_id = auth.uid()) with check (user_id = auth.uid())', t
        );
    end loop;
end $$;

-- Resume files: each user can only touch objects under their own folder.
drop policy if exists "owner resume files" on storage.objects;
create policy "owner resume files" on storage.objects for all to authenticated
    using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
