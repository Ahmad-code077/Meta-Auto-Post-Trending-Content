// Deterministic checks on generated text. A failed check sends the model back once with
// the reasons. A second failure stops the run, so nothing unverified is saved as a draft.

import type { EvidenceItem, GeneratedEmail, WritingPlan } from '@/lib/types/applications';
import type { ProfileSnapshot } from '@/lib/types/profile';
import { containsPhrase, normalizeText } from './text';

export interface ValidationContext {
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

    if (!email.subject.trim() || email.subject.length > 120 || /[\r\n]/.test(email.subject)) {
        errors.push('Subject must be one line of at most 120 characters.');
    }

    const words = body.split(/\s+/).filter(Boolean).length;
    if (words < ctx.minWords) errors.push(`Body is too short (${words} words, minimum ${ctx.minWords}).`);
    if (words > ctx.maxWords) errors.push(`Body is too long (${words} words, maximum ${ctx.maxWords}).`);

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

    // Every number must come from the source material, so it cannot be invented. This includes digits
    // inside a real profile skill name (e.g. "S3", "EC2") -- those are not invented statistics,
    // they are real skill names that happen to contain a digit.
    const allowedNumbers = new Set<string>([
        ...(ctx.sourceText.match(/\d+(?:\.\d+)?/g) ?? []),
        ...ctx.evidence.flatMap((e) => e.text.match(/\d+(?:\.\d+)?/g) ?? []),
        ...ctx.profile.skills.flatMap((s) => s.name.match(/\d+(?:\.\d+)?/g) ?? []),
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

    return errors;
}

function mentionsPhrase(body: string, phrase: string): boolean {
    return containsPhrase(normalizeText(body), normalizeText(phrase));
}
