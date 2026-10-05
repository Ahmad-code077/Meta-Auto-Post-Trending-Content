// Deterministic checks on generated text. A failed check sends the model back once with
// the reasons. A second failure stops the run, so nothing unverified is saved as a draft.

import type { EvidenceItem, GeneratedEmail, WritingPlan } from '@/lib/types/applications';
import type { ProfileSnapshot } from '@/lib/types/profile';
import { findProfileSkill, mentionsSkill } from './match';
import { containsPhrase, normalizeText } from './text';

export interface ValidationContext {
    kind: 'application' | 'follow_up';
    plan: WritingPlan | null;
    evidence: EvidenceItem[];
    profile: ProfileSnapshot;
    jobTitle: string | null;
    jobCompany: string | null;
    // Text the writer may draw numbers from: the job posting and any earlier email.
    sourceText: string;
    maxWords: number;
    minWords: number;
}

export function validateGeneratedEmail(email: GeneratedEmail, ctx: ValidationContext): string[] {
    const errors: string[] = [];
    const body = email.body.trim();
    const evidenceIds = new Set(ctx.evidence.map((e) => e.id));

    if (!email.subject.trim() || email.subject.length > 120 || /[\r\n]/.test(email.subject)) {
        errors.push('Subject must be one line of at most 120 characters.');
    }

    const words = body.split(/\s+/).filter(Boolean).length;
    if (words < ctx.minWords) errors.push(`Body is too short (${words} words, minimum ${ctx.minWords}).`);
    if (words > ctx.maxWords) errors.push(`Body is too long (${words} words, maximum ${ctx.maxWords}).`);

    // Citations: every claim points at evidence that exists.
    if (ctx.kind === 'application') {
        if (email.citations.length === 0) {
            errors.push('Cite at least one evidence item for each factual sentence.');
        }
    }
    for (const citation of email.citations) {
        if (citation.evidence_ids.length === 0 && ctx.kind === 'application') {
            errors.push(`Citation "${truncate(citation.sentence)}" has no evidence id.`);
        }
        for (const id of citation.evidence_ids) {
            if (!evidenceIds.has(id)) {
                errors.push(`Citation references unknown evidence id ${id}.`);
            }
        }
    }

    // Follow-ups restate the earlier email. They add no profile evidence and name no candidate skills.
    if (ctx.kind === 'follow_up') {
        if (email.citations.length > 0) errors.push('Follow-ups must not cite profile evidence.');
        if (email.skills_referenced.length > 0) errors.push('Follow-ups must not mention candidate skills.');
    }

    // Skills named by the writer must exist in the profile.
    for (const skill of email.skills_referenced) {
        if (!findProfileSkill(ctx.profile.skills, skill)) {
            errors.push(`Skill "${skill}" is not in the candidate's profile.`);
        }
    }

    // Gap skills are what the job asks for and the profile lacks. The writer must not claim them.
    const normalizedBody = normalizeText(`${email.subject} ${body}`);
    for (const gap of ctx.plan?.gap_skills ?? []) {
        if (containsPhrase(normalizedBody, normalizeText(gap))) {
            errors.push(`Do not mention "${gap}": the candidate has no evidence for it.`);
        }
    }

    // No links in the writer text. Links are appended by the system from the profile.
    if (/https?:\/\/|www\.|\b[\w-]+\.(com|io|dev|net|org)\b/i.test(body)) {
        errors.push('Do not include links in the body.');
    }

    // Every number must come from the source material, so it cannot be invented.
    const allowedNumbers = new Set<string>([
        ...(ctx.sourceText.match(/\d+(?:\.\d+)?/g) ?? []),
        ...ctx.evidence.flatMap((e) => e.text.match(/\d+(?:\.\d+)?/g) ?? []),
    ]);
    for (const number of body.match(/\d+(?:\.\d+)?/g) ?? []) {
        if (!allowedNumbers.has(number)) {
            errors.push(`The number ${number} does not appear in the job posting or the profile.`);
        }
    }

    // The email must be about this job.
    const mentionsJob =
        (ctx.jobCompany && mentionsPhrase(body, ctx.jobCompany)) ||
        (ctx.jobTitle && mentionsPhrase(body, ctx.jobTitle));
    if (!mentionsJob) {
        errors.push('Name the role or the company so the email is specific to this job.');
    }

    // Skills named in the body should also be listed in skills_referenced, which keeps the audit trail honest.
    for (const requested of ctx.plan?.matched_skills ?? []) {
        if (mentionsSkill(body, requested) && !email.skills_referenced.some((s) => normalizeText(s) === normalizeText(requested))) {
            errors.push(`Skill "${requested}" appears in the body but not in skills_referenced.`);
        }
    }

    return errors;
}

function mentionsPhrase(body: string, phrase: string): boolean {
    return containsPhrase(normalizeText(body), normalizeText(phrase));
}

function truncate(value: string): string {
    return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}
