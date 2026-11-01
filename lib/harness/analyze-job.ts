import { createHash } from 'node:crypto';
import type { JobAnalysis } from '@/lib/types/jobs';
import { generateStructured } from './openai';

// Bump when the prompt or schema changes so cached analyses are recomputed.
export const ANALYSIS_VERSION = 3;

const nullableString = { type: ['string', 'null'] };

const ANALYSIS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'company', 'recruiter_name', 'recruiter_email', 'location', 'work_type', 'experience', 'timings', 'summary', 'requirements', 'skills'],
    properties: {
        title: nullableString,
        company: nullableString,
        recruiter_name: nullableString,
        recruiter_email: nullableString,
        location: nullableString,
        work_type: { type: ['string', 'null'], description: 'remote, hybrid, onsite, contract, full-time or part-time' },
        experience: { type: ['string', 'null'], description: 'Years or level of experience asked for' },
        timings: nullableString,
        summary: { type: 'string', description: 'Two sentences on what the role is for' },
        requirements: {
            type: 'array',
            items: { type: 'string', description: 'A requirement or responsibility, close to the original wording' },
        },
        skills: {
            type: 'array',
            items: { type: 'string', description: 'A named technology, tool, language or method, written as in the posting' },
        },
    },
} as const;

const INSTRUCTIONS = `You analyze job postings for a candidate's application.
Extract only what the posting states. Do not infer requirements or skills that are not written.
- "requirements" lists each requirement or responsibility sentence, close to the original wording.
- "skills" lists every named technology, tool, language or method the posting mentions, once each, written as in the posting. Do not list a skill that is not explicitly named.
- "recruiter_email" is whatever email address the posting gives for applying or getting in touch -- a named person's address, a role-based address (hr@, careers@, jobs@, recruiting@), or a generic company inbox all count. Extract it exactly as written whenever one appears anywhere in the posting, even without a named contact. Leave it null only when the posting truly gives no email address at all.
- Leave other fields null when the posting does not state them. Never invent an email address that is not written in the posting.`;

export function hashJobDescription(rawPost: string): string {
    return createHash('sha256').update(rawPost.trim()).digest('hex');
}

export async function analyzeJobDescription(rawPost: string, jobId?: string): Promise<JobAnalysis> {
    const raw = await generateStructured<JobAnalysis>({
        name: 'job_analysis',
        schema: ANALYSIS_SCHEMA,
        instructions: INSTRUCTIONS,
        input: `Job posting:\n"""\n${rawPost.trim()}\n"""`,
        debug: { stage: 'analysis', jobId: jobId ?? null },
    });

    const seenSkills = new Set<string>();
    return {
        ...raw,
        requirements: raw.requirements.map((r) => r.trim()).filter((r) => r.length > 0),
        skills: raw.skills
            .map((s) => s.trim())
            .filter((s) => {
                if (!s || seenSkills.has(s.toLowerCase())) return false;
                seenSkills.add(s.toLowerCase());
                return true;
            }),
    };
}
