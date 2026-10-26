// Deterministic tests for the application harness and profile validation.
// Run with `npm test`. No model or network calls are made.

import test from 'node:test'
import assert from 'node:assert/strict'
import { containsPhrase, normalizeText } from '../lib/harness/text'
import { matchProfile } from '../lib/harness/match'
import { buildWritingPlan } from '../lib/harness/plan'
import { validateGeneratedEmail, type ValidationContext } from '../lib/harness/validate'
import type { EvidenceItem, GeneratedEmail } from '../lib/types/applications'
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
    requirements: [
        { text: 'Strong Python skills', priority: 'required', skill: 'Python' },
        { text: 'Kubernetes operations', priority: 'required', skill: 'Kubernetes' },
        { text: 'Build data pipelines', priority: 'responsibility', skill: null },
        { text: 'Postgres experience', priority: 'preferred', skill: 'Postgres' },
    ],
}

const NOW = new Date('2026-10-06')

test('normalizeText and containsPhrase match whole words only', () => {
    assert.equal(normalizeText('Node.js'), 'node js')
    assert.equal(normalizeText('C++'), 'c++')
    assert.ok(containsPhrase(normalizeText('I use Python daily'), 'python'))
    assert.ok(!containsPhrase(normalizeText('pythonic style'), 'python'))
})

test('matching ranks required skills first and reports gaps', () => {
    const match = matchProfile(analysis, profile, NOW)
    assert.deepEqual(match.requestedSkills.map((s) => s.name), ['Python', 'Kubernetes', 'Postgres'])
    assert.deepEqual(match.matchedSkills, ['Python', 'Postgres'])
    assert.deepEqual(match.gapSkills, ['Kubernetes'])
})

test('matching resolves aliases to the existing skill, never a new one', () => {
    const aliased: JobAnalysis = { ...analysis, requirements: [{ text: 'psql', priority: 'required', skill: 'psql' }] }
    const alias = matchProfile(aliased, { ...profile, skills: [{ ...profile.skills[1], aliases: ['psql'] }] }, NOW)
    assert.deepEqual(alias.matchedSkills, ['psql'])
    assert.deepEqual(alias.gapSkills, [])
})

test('evidence is limited to the profile, with stable short ids, and carries responsibilities that match the job', () => {
    const { evidence } = matchProfile(analysis, profile, NOW)
    assert.ok(evidence.length > 0)
    assert.deepEqual(evidence.map((e) => e.id), evidence.map((_, i) => `E${i + 1}`))
    assert.ok(evidence.some((e) => e.text === 'Built data pipelines in Python'))
    assert.ok(evidence.some((e) => e.source === 'project' && e.source_name === 'Job Scraper'))
    // Every item must come from the profile text.
    const profileText = JSON.stringify(profile)
    for (const item of evidence) assert.ok(profileText.includes(item.text), `not from profile: ${item.text}`)
})

test('a project qualifies through a matched required skill even when its wording does not overlap', () => {
    const { evidence } = matchProfile(analysis, profile, NOW)
    assert.ok(evidence.some((e) => e.source_name === 'Job Scraper' && e.text.startsWith('Scrapes')))
})

test('evidence skills are limited to what this job requests, not every skill the source has', () => {
    const wideProfile: ProfileSnapshot = {
        ...profile,
        skills: [...profile.skills, { id: id(4), name: 'Docker', normalized_name: 'docker', aliases: [] }],
        experiences: [{ ...profile.experiences[0], skill_ids: [...profile.experiences[0].skill_ids, id(4)] }],
    }
    const { evidence } = matchProfile(analysis, wideProfile, NOW)
    const fromExperience = evidence.filter((e) => e.source === 'experience')
    assert.ok(fromExperience.length > 0)
    for (const item of fromExperience) {
        assert.ok(item.skills.includes('Python'), 'a skill this job requests is kept')
        assert.ok(!item.skills.includes('Docker'), 'a skill this job does not ask for is trimmed, even though the source has it')
    }
})

test('the plan carries links only when they are allowed, and always names the gaps', () => {
    const match = matchProfile(analysis, profile, NOW)
    const first = buildWritingPlan({ analysis, profile, match, includeLinks: true })
    assert.deepEqual(first.include_links, [{ label: 'LinkedIn', url: 'https://linkedin.com/in/sam' }])
    assert.deepEqual(first.gap_skills, ['Kubernetes'])
    const followUp = buildWritingPlan({ analysis, profile, match, includeLinks: false })
    assert.deepEqual(followUp.include_links, [])
})

const match = matchProfile(analysis, profile, NOW)
const plan = buildWritingPlan({ analysis, profile, match, includeLinks: true })

const ctx: ValidationContext = {
    kind: 'application', plan, evidence: match.evidence, profile,
    jobTitle: 'Backend Engineer', jobCompany: 'Globex',
    sourceText: 'Job posting text 2026 2021 2024', maxWords: 180, minWords: 5,
}

const goodEmail: GeneratedEmail = {
    subject: 'Backend Engineer application',
    body: 'I am applying for the Backend Engineer role at Globex. At Acme I built data pipelines in Python and cut API latency by 40% through query tuning. I would welcome a short call.',
    skills_referenced: ['Python'],
}

test('a grounded email passes validation', () => {
    assert.deepEqual(validateGeneratedEmail(goodEmail, ctx), [])
})

test('validation rejects a number that is not in the source material', () => {
    const e = { ...goodEmail, body: goodEmail.body + ' I also led a team of 12 engineers.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('12')))
})

test('a digit inside a real skill name attached to the evidence, like S3 or EC2, is allowed', () => {
    const evidenceWithDigitSkills: EvidenceItem[] = [{
        id: 'E1', source: 'experience', source_id: 'exp-1', source_name: 'Backend Engineer at Acme',
        text: 'Deployed services to AWS', skills: ['AWS S3', 'AWS EC2'], score: 1,
    }]
    const e = {
        ...goodEmail,
        body: 'I am applying for the Backend Engineer role at Globex. At Acme I deployed services using AWS S3 and EC2 for storage and compute. I would welcome a short call.',
        skills_referenced: [],
    }
    assert.deepEqual(validateGeneratedEmail(e, { ...ctx, evidence: evidenceWithDigitSkills }), [])
})

test('a matched skill mentioned in the body and backed by the selected evidence is accepted even if the model forgot to list it in skills_referenced', () => {
    const evidenceWithAws: EvidenceItem[] = [{
        id: 'E1', source: 'experience', source_id: 'exp-1', source_name: 'Backend Engineer at Acme',
        text: 'Deployed services to AWS', skills: ['AWS'], score: 1,
    }]
    const planWithAws = { ...plan, matched_skills: [...plan.matched_skills, 'AWS'] }
    const e = {
        ...goodEmail,
        body: 'I am applying for the Backend Engineer role at Globex. At Acme I deployed services to AWS for production workloads. I would welcome a short call.',
        skills_referenced: [],
    }
    assert.deepEqual(validateGeneratedEmail(e, { ...ctx, plan: planWithAws, evidence: evidenceWithAws }), [])
})

// The two failure modes the reconciliation above must not weaken -- a skill not in the profile
// ('validation rejects skills that are not in the profile') and a gap skill ('validation rejects
// claims about a gap skill') -- are already covered by the existing tests below, unchanged.

test('an invented statistic, like a made-up percentage, is still rejected', () => {
    const e = { ...goodEmail, body: goodEmail.body + ' I have mentored 99% of engineers on my team.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('99')))
})

test('validation rejects claims about a gap skill', () => {
    const e = { ...goodEmail, body: goodEmail.body + ' I have hands-on Kubernetes experience.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('Kubernetes')))
})

test('validation rejects skills that are not in the profile', () => {
    const e = { ...goodEmail, skills_referenced: ['Python', 'Rust'] }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('Rust')))
})

test('validation rejects links in the body, since the system adds them', () => {
    const e = { ...goodEmail, body: goodEmail.body + ' See https://example.com for more.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('links')))
})

test('validation requires the email to name the job', () => {
    const e = { ...goodEmail, body: 'I would like to talk about Python and pipelines. I cut latency by 40% in past work.' }
    assert.ok(validateGeneratedEmail(e, ctx).some((m) => m.includes('specific')))
})

test('a follow-up may not name candidate skills, and must stay short', () => {
    const followUp: ValidationContext = { ...ctx, kind: 'follow_up', plan: null, evidence: [], minWords: 5, maxWords: 90 }
    const ok = { subject: 'Following up', body: 'Following up on the Backend Engineer role at Globex. Is there an update I can share?', skills_referenced: [] }
    assert.deepEqual(validateGeneratedEmail(ok, followUp), [])
    const withSkill = { ...ok, skills_referenced: ['Python'] }
    assert.ok(validateGeneratedEmail(withSkill, followUp).some((m) => m.includes('skills')))
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

test('profile links must be https URLs', () => {
    assert.ok(detailsSchema.safeParse({ linkedin_url: 'linkedin.com/in/sam' }).success === false)
    assert.ok(detailsSchema.safeParse({ linkedin_url: 'https://linkedin.com/in/sam' }).success)
    assert.ok(detailsSchema.safeParse({ contact_email: 'not an email' }).success === false)
})
