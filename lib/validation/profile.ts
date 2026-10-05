import { z } from 'zod';

// Server-side validation for profile input. Shared by the server actions and the tests.

export const optionalText = (max: number) =>
    z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const optionalUrl = z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https?:\/\/\S+$/.test(v), 'Enter a full URL starting with https://');

// Accepts YYYY-MM (month pickers) or YYYY-MM-DD. Stored as the first day of the month when only a month is given.
export const optionalDate = z
    .string()
    .optional()
    .transform((v) => (v ? v.trim() : null))
    .refine(
        (v) => v === null || /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(v),
        'Enter a valid date'
    )
    .transform((v) => (v && v.length === 7 ? `${v}-01` : v));

export function checkDateOrder(
    value: { start_date: string | null; end_date: string | null },
    ctx: z.RefinementCtx
) {
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date must be after the start date' });
    }
}

export const detailsSchema = z.object({
    full_name: optionalText(120),
    headline: optionalText(160),
    location: optionalText(120),
    phone: optionalText(40),
    contact_email: z.string().trim().email().max(200).optional().or(z.literal('')).transform((v) => (v ? v : null)),
    summary: optionalText(1200),
    linkedin_url: optionalUrl,
    github_url: optionalUrl,
    portfolio_url: optionalUrl,
});

export const skillSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Skill name is required').max(60),
    aliases: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});

export const experienceSchema = z
    .object({
        id: z.string().uuid().optional(),
        company: z.string().trim().min(1, 'Company is required').max(120),
        role: z.string().trim().min(1, 'Role is required').max(120),
        location: optionalText(120),
        start_date: optionalDate,
        end_date: optionalDate,
        responsibilities: z.array(z.string().trim().min(1).max(400)).max(30).default([]),
        achievements: z.array(z.string().trim().min(1).max(400)).max(30).default([]),
        skill_ids: z.array(z.string().uuid()).max(60).default([]),
    })
    .superRefine(checkDateOrder);

export const projectSchema = z
    .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1, 'Project name is required').max(120),
        url: optionalUrl,
        description: optionalText(1200),
        contribution: optionalText(1200),
        start_date: optionalDate,
        end_date: optionalDate,
        skill_ids: z.array(z.string().uuid()).max(60).default([]),
    })
    .superRefine(checkDateOrder);

