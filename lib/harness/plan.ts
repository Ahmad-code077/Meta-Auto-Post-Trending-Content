import type { JobAnalysis } from '@/lib/types/jobs';
import type { WritingPlan } from '@/lib/types/applications';
import type { ProfileSnapshot } from '@/lib/types/profile';

export const MAX_APPLICATION_WORDS = 180;
export const MAX_FOLLOW_UP_WORDS = 90;
export const MIN_BODY_WORDS = 40;

// Decides what the writer is told about the job and what it must not claim.
export function buildWritingPlan({
    analysis,
    profile,
    gapSkills,
    includeLinks,
}: {
    analysis: JobAnalysis;
    profile: ProfileSnapshot;
    gapSkills: string[];
    includeLinks: boolean;
}): WritingPlan {
    const links = includeLinks
        ? [
            { label: 'LinkedIn', url: profile.details.linkedin_url },
            { label: 'GitHub', url: profile.details.github_url },
            { label: 'Portfolio', url: profile.details.portfolio_url },
        ].filter((l): l is { label: string; url: string } => Boolean(l.url))
        : [];

    return {
        role: analysis.title ?? 'the role',
        company: analysis.company,
        gap_skills: gapSkills,
        include_links: links,
        max_words: MAX_APPLICATION_WORDS,
    };
}
