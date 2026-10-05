import type { JobAnalysis } from '@/lib/types/jobs';
import type { WritingPlan } from '@/lib/types/applications';
import type { ProfileSnapshot } from '@/lib/types/profile';
import type { MatchResult } from './match';

export const MAX_APPLICATION_WORDS = 180;
export const MAX_FOLLOW_UP_WORDS = 90;
export const MIN_BODY_WORDS = 40;

// Decides what the writer is allowed to say. The writer never sees the whole profile,
// only the plan and the evidence it cites.
export function buildWritingPlan({
    analysis,
    profile,
    match,
    includeLinks,
}: {
    analysis: JobAnalysis;
    profile: ProfileSnapshot;
    match: MatchResult;
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
        requested_skills: match.requestedSkills.map((s) => ({ name: s.name, priority: s.priority })),
        matched_skills: match.matchedSkills,
        gap_skills: match.gapSkills,
        evidence_ids: match.evidence.map((e) => e.id),
        include_links: links,
        max_words: MAX_APPLICATION_WORDS,
    };
}
