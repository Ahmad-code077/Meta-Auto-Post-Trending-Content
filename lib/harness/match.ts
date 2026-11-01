// Deterministic, minimal matching. No model calls, no scoring, so every result is reproducible.
//
// Two things only: which of the job's named skills the profile doesn't show (gap skills, which the
// writer must never claim), and the full set of experience/project bullets, unranked, for the
// writer to draw on freely.

import type { JobAnalysis } from '@/lib/types/jobs';
import type { EvidenceItem } from '@/lib/types/applications';
import type { ProfileSkill, ProfileSnapshot } from '@/lib/types/profile';
import { normalizeText } from './text';

// A sanity cap on payload size for an unusually large profile. Not a ranking -- order is profile order.
const MAX_EVIDENCE = 24;

// True when every word of the shorter list appears as a whole word in the longer one. Word-level,
// not a character substring -- "go" never matches inside "github" this way, but "agents" matches
// inside "ai agents". Two phrases that only share one generic word ("llm apis" vs "openai apis",
// sharing only "apis") do not match -- those are different vendor terms, not a known synonym.
function wordSetContains(shorter: string[], longer: string[]): boolean {
    return shorter.length > 0 && shorter.every((word) => longer.includes(word));
}

export function findProfileSkill(skills: ProfileSkill[], name: string): ProfileSkill | undefined {
    const target = normalizeText(name);
    const targetWords = target.split(' ');
    return skills.find((skill) => {
        if (skill.normalized_name === target) return true;
        if (skill.aliases.some((alias) => normalizeText(alias) === target)) return true;
        const skillWords = skill.normalized_name.split(' ');
        const [shorter, longer] = targetWords.length <= skillWords.length ? [targetWords, skillWords] : [skillWords, targetWords];
        return wordSetContains(shorter, longer);
    });
}

// Named skills the job asks for that the profile does not show. The writer must never claim these.
export function gapSkillsFrom(analysis: JobAnalysis, profileSkills: ProfileSkill[]): string[] {
    const seen = new Set<string>();
    const gaps: string[] = [];

    for (const skill of analysis.skills) {
        const key = normalizeText(skill);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!findProfileSkill(profileSkills, skill)) gaps.push(skill);
    }

    return gaps;
}

// Every experience and project bullet, unranked. The writer decides what's relevant; nothing here
// picks "the best" evidence or filters it by job relevance.
export function collectEvidence(profile: ProfileSnapshot): EvidenceItem[] {
    const evidence: EvidenceItem[] = [];

    for (const experience of profile.experiences) {
        const bullets = [...experience.achievements, ...experience.responsibilities];
        for (const text of bullets) {
            evidence.push({
                id: '',
                source: 'experience',
                source_id: experience.id,
                source_name: `${experience.role} at ${experience.company}`,
                text,
            });
        }
    }

    for (const project of profile.projects) {
        const items = [project.description, project.contribution].filter((t): t is string => Boolean(t?.trim()));
        for (const text of items) {
            evidence.push({
                id: '',
                source: 'project',
                source_id: project.id,
                source_name: project.name,
                text,
            });
        }
    }

    return evidence.slice(0, MAX_EVIDENCE).map((item, index) => ({ ...item, id: `E${index + 1}` }));
}
