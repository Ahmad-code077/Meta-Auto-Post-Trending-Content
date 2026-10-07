import { createHash } from 'node:crypto';
import type { JobAnalysis } from '@/lib/types/jobs';
import { generateStructured } from './openai';

// Bump when the prompt or schema changes so cached analyses are recomputed.
export const ANALYSIS_VERSION = 1;

const nullableString = { type: ['string', 'null'] };

const ANALYSIS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'company', 'recruiter_name', 'recruiter_email', 'location', 'work_type', 'experience', 'timings', 'summary', 'requirements'],
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
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'priority', 'skill'],
                properties: {
                    text: { type: 'string', description: 'The requirement, close to the original wording' },
                    priority: { type: 'string', enum: ['required', 'preferred', 'responsibility'] },
                    skill: { type: ['string', 'null'], description: 'Technology or skill name when the requirement is a skill, otherwise null' },
                },
            },
        },
    },
} as const;

const INSTRUCTIONS = `You analyze job postings for a candidate's application.
Extract only what the posting states. Do not infer requirements that are not written.
- "required" covers anything the posting says is needed, must-have, or mandatory.
- "preferred" covers nice-to-have, plus, bonus, or preferred items.
- "responsibility" covers day-to-day duties that are not a skill.
- Put a skill name in "skill" only for a named technology, tool, language or method. Use the name as written in the posting.
- Leave fields null when the posting does not state them. Never guess a recruiter email.`;

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

    return {
        ...raw,
        requirements: raw.requirements
            .filter((r) => r.text.trim().length > 0)
            .map((r) => ({ ...r, skill: r.skill?.trim() || null })),
    };
}
