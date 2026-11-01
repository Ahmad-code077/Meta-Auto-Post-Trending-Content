// Aggregates gap skills across every analyzed job, for a read-only dashboard view answering
// "which skills keep showing up as gaps". Computed live from the current profile, not from stored
// generation snapshots, so adding an alias or a skill makes a skill disappear from this page
// immediately, and it covers every analyzed job, drafted or not.

import type { JobAnalysis } from '@/lib/types/jobs';
import type { ProfileSkill } from '@/lib/types/profile';
import { gapSkillsFrom } from './match';
import { normalizeText } from './text';

export interface GapSkillJobRef {
    id: string;
    title: string | null;
    company: string | null;
}

export interface GapSkillSummary {
    skill: string;
    jobCount: number;
    jobs: GapSkillJobRef[];
}

export function aggregateGapSkills(
    jobs: { id: string; title: string | null; company: string | null; analysis: JobAnalysis | null }[],
    profileSkills: ProfileSkill[]
): GapSkillSummary[] {
    const byKey = new Map<string, GapSkillSummary>();

    for (const job of jobs) {
        if (!job.analysis) continue;
        for (const gap of gapSkillsFrom(job.analysis, profileSkills)) {
            const key = normalizeText(gap);
            if (!key) continue;
            const existing = byKey.get(key) ?? { skill: gap, jobCount: 0, jobs: [] };
            existing.jobCount += 1;
            existing.jobs.push({ id: job.id, title: job.title, company: job.company });
            byKey.set(key, existing);
        }
    }

    return [...byKey.values()].sort((a, b) => b.jobCount - a.jobCount);
}
