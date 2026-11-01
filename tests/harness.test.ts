// Deterministic tests for the application harness and profile validation.
// Run with `npm test`. No model or network calls are made.

import test from 'node:test'
import assert from 'node:assert/strict'
import { containsPhrase, normalizeText } from '../lib/harness/text'
import { collectEvidence, findProfileSkill, gapSkillsFrom } from '../lib/harness/match'
import { aggregateGapSkills } from '../lib/harness/gap-skills'
import { buildWritingPlan } from '../lib/harness/plan'
import { validateGeneratedEmail, type ValidationContext } from '../lib/harness/validate'
import type { GeneratedEmail } from '../lib/types/applications'
import type { JobAnalysis } from '../lib/types/jobs'
import type { ProfileSnapshot } from '../lib/types/profile'
import { detailsSchema, experienceSchema, optionalDate, projectSchema, skillSchema } from '../lib/validation/profile'

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

const profile: ProfileSnapshot = {
    details: {
        full_name: 'Sam Rivera', headline: null, location: null, phone: null, contact_email: null, summary: null,
        linkedin_url: 'https://linkedin.com/in/sam', github_url: null, portfolio_url: null,
    },
    skills: [
        { id: id(1), name: 'Python', normalized_name: 'python', aliases: ['py'] },
        { id: id(2), name: 'PostgreSQL', normalized_name: 'postgresql', aliases: ['Postgres'] },
        { id: id(3), name: 'React', normalized_name: 'react', aliases: [] },
    ],
    experiences: [{
        id: 'exp-1', company: 'Acme', role: 'Backend Engineer', location: null,
        start_date: '2021-01-01', end_date: '2024-06-30',
        responsibilities: ['Built data pipelines in Python', 'Maintained the React admin console'],
        achievements: ['Cut API latency by 40% through query tuning'],
        skill_ids: [id(1), id(2)],
    }],
    projects: [{
        id: 'proj-1', name: 'Job Scraper', url: null, start_date: null, end_date: null,
        description: 'Scrapes job postings and stores them in PostgreSQL',
        contribution: 'Wrote the scraper and the storage layer', skill_ids: [id(1)],
    }],
    resume: null,
}

const analysis: JobAnalysis = {
    title: 'Backend Engineer', company: 'Globex', recruiter_name: null, recruiter_email: 'r@globex.com',
    location: null, work_type: null, experience: null, timings: null, summary: 'Backend role.',
    requirements: ['Strong Python skills', 'Kubernetes operations', 'Build data pipelines'],
    skills: ['Python', 'Kubernetes', 'Postgres'],
}

test('normalizeText and containsPhrase match whole words only', () => {
    assert.equal(normalizeText('Node.js'), 'node js')
    assert.equal(normalizeText('C++'), 'c++')
    assert.ok(containsPhrase(normalizeText('I use Python daily'), 'python'))
    assert.ok(!containsPhrase(normalizeText('pythonic style'), 'python'))
})

test('a gap skill is one the job names and the profile does not show', () => {
    assert.deepEqual(gapSkillsFrom(analysis, profile.skills), ['Kubernetes'])
})

test('gap-skill resolution uses aliases, never creates a new skill', () => {
    const aliased: JobAnalysis = { ...analysis, skills: ['psql'] }
    const withAlias: ProfileSnapshot = { ...profile, skills: [{ ...profile.skills[1], aliases: ['psql'] }] }
    assert.deepEqual(gapSkillsFrom(aliased, withAlias.skills), [])
})

test('a word-level synonym resolves -- "agents" is covered by a profile skill named "AI Agents"', () => {
    const aiSkills = [...profile.skills, { id: id(5), name: 'AI Agents', normalized_name: 'ai agents', aliases: ['ai agent'] }]
    assert.ok(findProfileSkill(aiSkills, 'agents'))
    assert.deepEqual(gapSkillsFrom({ ...analysis, skills: ['agents'] }, aiSkills), [])
})

test('two different vendor terms that only share one generic word are not treated as the same skill', () => {
    const withOpenAi = [...profile.skills, { id: id(6), name: 'OpenAI APIs', normalized_name: 'openai apis', aliases: ['openai'] }]
    assert.equal(findProfileSkill(withOpenAi, 'LLM APIs'), undefined)
    assert.deepEqual(gapSkillsFrom({ ...analysis, skills: ['LLM APIs'] }, withOpenAi), ['LLM APIs'])
})

test('a short, unrelated word never matches as a substring of an unrelated longer skill name', () => {
    const withGitHub = [...profile.skills, { id: id(7), name: 'GitHub', normalized_name: 'github', aliases: [] }]
    assert.equal(findProfileSkill(withGitHub, 'Go'), undefined)
})

test('gap skills are deduplicated, case- and punctuation-insensitively', () => {
    const repeated: JobAnalysis = { ...analysis, skills: ['Kubernetes', 'kubernetes', 'KUBERNETES'] }
    assert.deepEqual(gapSkillsFrom(repeated, profile.skills), ['Kubernetes'])
})

test('a stack nickname the profile does not have a row for is still just one gap entry, not a crash', () => {
    const stackPosting: JobAnalysis = { ...analysis, skills: ['MERN stack'] }
    assert.deepEqual(gapSkillsFrom(stackPosting, profile.skills), ['MERN stack'])
})

test('evidence collects every experience and project bullet, unranked, with stable short ids', () => {
    const evidence = collectEvidence(profile)
    // 2 responsibilities + 1 achievement from the experience, description + contribution from the project.
    assert.equal(evidence.length, 5)
    assert.deepEqual(evidence.map((e) => e.id), evidence.map((_, i) => `E${i + 1}`))
    assert.ok(evidence.some((e) => e.text === 'Built data pipelines in Python'))
    assert.ok(evidence.some((e) => e.text === 'Maintained the React admin console'))
    assert.ok(evidence.some((e) => e.text === 'Cut API latency by 40% through query tuning'))
    assert.ok(evidence.some((e) => e.source === 'project' && e.source_name === 'Job Scraper'))
    // Nothing is invented: every bullet text must come from the profile itself.
    const profileText = JSON.stringify(profile)
    for (const item of evidence) assert.ok(profileText.includes(item.text), `not from profile: ${item.text}`)
})

test('evidence selection does not depend on the job at all -- it is the same for every posting', () => {
    // collectEvidence takes only the profile, so a bullet unrelated to any particular job (like the
    // React one here, for a posting that never mentions React) is still included -- nothing is filtered.
    const evidence = collectEvidence(profile)
    assert.ok(evidence.some((e) => e.text === 'Maintained the React admin console'))
})

test('the plan carries links only when allowed, and always names the gaps', () => {
    const gapSkills = gapSkillsFrom(analysis, profile.skills)
    const first = buildWritingPlan({ analysis, profile, gapSkills, includeLinks: true })
    assert.deepEqual(first.include_links, [{ label: 'LinkedIn', url: 'https://linkedin.com/in/sam' }])
    assert.deepEqual(first.gap_skills, ['Kubernetes'])
    const followUp = buildWritingPlan({ analysis, profile, gapSkills, includeLinks: false })
    assert.deepEqual(followUp.include_links, [])
})

const gapSkills = gapSkillsFrom(analysis, profile.skills)
const evidence = collectEvidence(profile)
const plan = buildWritingPlan({ analysis, profile, gapSkills, includeLinks: true })

const ctx: ValidationContext = {
    plan, evidence, profile,
    jobTitle: 'Backend Engineer', jobCompany: 'Globex',
    maxWords: 180, minWords: 5,
}

const goodEmail: GeneratedEmail = {
    subject: 'Backend Engineer application',
    body: 'I am applying for the Backend Engineer role at Globex. At Acme I built data pipelines in Python and cut API latency by 40% through query tuning. I would welcome a short call.',
}

test('a grounded email passes validation', () => {
    assert.deepEqual(validateGeneratedEmail(goodEmail, ctx), [])
})

test('validation rejects claims about a gap skill', () => {
    const e = { ...goodEmail, body: goodEmail.body + ' I have hands-on Kubernetes experience.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('Kubernetes')))
})

test('validation rejects links in the body, since the system adds them', () => {
    const e = { ...goodEmail, body: goodEmail.body + ' See https://example.com for more.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('links')))
})

test('validation requires the email to name the job', () => {
    const e = { ...goodEmail, body: 'I would like to talk about Python and pipelines. I cut latency by 40% in past work.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('specific')))
})

test('a gap skill inside the job title does not block naming the role, with no company to fall back on', () => {
    const titleCtx: ValidationContext = { ...ctx, jobCompany: null, jobTitle: 'RabbitMQ Developer', plan: { ...plan, gap_skills: ['RabbitMQ'] } }
    const e = { subject: 'Application for RabbitMQ Developer', body: 'I am writing about the RabbitMQ Developer role. I have built scalable backend services and would welcome a short call.' }
    assert.deepEqual(validateGeneratedEmail(e, titleCtx), [])
})

test('naming the role does not excuse a separate, real claim of the same gap skill', () => {
    const titleCtx: ValidationContext = { ...ctx, jobCompany: null, jobTitle: 'RabbitMQ Developer', plan: { ...plan, gap_skills: ['RabbitMQ'] } }
    const e = { subject: 'Application for RabbitMQ Developer', body: 'I am writing about the RabbitMQ Developer role. I have hands-on RabbitMQ experience and would welcome a short call.' }
    assert.ok(validateGeneratedEmail(e, titleCtx).some((m) => m.includes('RabbitMQ')))
})

test('a follow-up has no plan and no evidence, and still must be grounded and name the job', () => {
    const followUp: ValidationContext = { ...ctx, plan: null, evidence: [], minWords: 5, maxWords: 90 }
    const ok = { subject: 'Following up', body: 'Following up on the Backend Engineer role at Globex. Is there an update I can share?' }
    assert.deepEqual(validateGeneratedEmail(ok, followUp), [])
})

test('profile dates accept a month or a day, and store a month as its first day', () => {
    assert.equal(optionalDate.parse('2023-06'), '2023-06-01')
    assert.equal(optionalDate.parse('2023-06-15'), '2023-06-15')
    assert.equal(optionalDate.parse(''), null)
    assert.throws(() => optionalDate.parse('2023-13'))
    assert.throws(() => optionalDate.parse('June 2023'))
})

test('experience end date must not be before its start date', () => {
    const base = { company: 'Acme', role: 'Engineer', skill_ids: [], responsibilities: [], achievements: [] }
    assert.ok(experienceSchema.safeParse({ ...base, start_date: '2024-01', end_date: '2023-06' }).success === false)
    assert.ok(experienceSchema.safeParse({ ...base, start_date: '2023-01', end_date: '2023-06' }).success)
    assert.ok(experienceSchema.safeParse({ ...base, start_date: '2023-01', end_date: '' }).success, 'open-ended role is allowed')
})

test('project dates follow the same rule', () => {
    assert.ok(projectSchema.safeParse({ name: 'X', start_date: '2024-03', end_date: '2024-02' }).success === false)
})

test('skill names are required and capped', () => {
    assert.ok(skillSchema.safeParse({ name: '   ' }).success === false)
    assert.ok(skillSchema.safeParse({ name: 'Go', aliases: ['golang'] }).success)
})

test('gap skills are aggregated across jobs, sorted by how many jobs ask for each one', () => {
    const jobs = [
        { id: 'j1', title: 'Backend Engineer', company: 'Globex', analysis: { ...analysis, skills: ['Kubernetes', 'RabbitMQ'] } },
        { id: 'j2', title: 'Platform Engineer', company: 'Initech', analysis: { ...analysis, skills: ['Kubernetes'] } },
        { id: 'j3', title: 'SRE', company: 'Hooli', analysis: { ...analysis, skills: ['Python'] } },
    ]
    const summaries = aggregateGapSkills(jobs, profile.skills)
    assert.deepEqual(summaries.map((s) => s.skill), ['Kubernetes', 'RabbitMQ'])
    assert.equal(summaries[0].jobCount, 2)
    assert.deepEqual(summaries[0].jobs.map((j) => j.id), ['j1', 'j2'])
    assert.equal(summaries[1].jobCount, 1)
})

test('aggregation groups case/punctuation variants of the same skill and skips unanalyzed jobs', () => {
    const jobs = [
        { id: 'j1', title: null, company: null, analysis: { ...analysis, skills: ['Kubernetes'] } },
        { id: 'j2', title: null, company: null, analysis: { ...analysis, skills: ['KUBERNETES'] } },
        { id: 'j3', title: null, company: null, analysis: null },
    ]
    const summaries = aggregateGapSkills(jobs, profile.skills)
    assert.equal(summaries.length, 1)
    assert.equal(summaries[0].jobCount, 2)
})

test('profile links must be https URLs', () => {
    assert.ok(detailsSchema.safeParse({ linkedin_url: 'linkedin.com/in/sam' }).success === false)
    assert.ok(detailsSchema.safeParse({ linkedin_url: 'https://linkedin.com/in/sam' }).success)
    assert.ok(detailsSchema.safeParse({ contact_email: 'not an email' }).success === false)
})
