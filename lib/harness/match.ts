// Deterministic profile matching. No model calls here, so every score can be reproduced.
//
// 1. Requested skills come from the job analysis, required before preferred.
// 2. Each experience and project is scored: requested skills it uses (weighted by
//    priority), plus overlap between its bullets and the job's requirement wording,
//    scaled by how recent it is.
// 3. The best sources are kept, and within each source the best bullets.

import type { JobAnalysis } from '@/lib/types/jobs';
import type { EvidenceItem } from '@/lib/types/applications';
import type { Experience, ProfileSkill, ProfileSnapshot } from '@/lib/types/profile';
import { containsPhrase, normalizeText, tokens } from './text';

const SKILL_WEIGHT = { required: 3, preferred: 2 } as const;
const MAX_EXPERIENCES = 3;
const MAX_PROJECTS = 2;
const MAX_BULLETS_PER_SOURCE = 3;
const MAX_EVIDENCE = 8;

export interface RequestedSkill {
    name: string;
    priority: 'required' | 'preferred';
    profileSkillId: string | null;
}

export interface MatchResult {
    requestedSkills: RequestedSkill[];
    matchedSkills: string[];
    gapSkills: string[];
    evidence: EvidenceItem[];
}

export function findProfileSkill(skills: ProfileSkill[], name: string): ProfileSkill | undefined {
    const target = normalizeText(name);
    return skills.find((skill) =>
        skill.normalized_name === target ||
        skill.aliases.some((alias) => normalizeText(alias) === target)
    );
}

export function requestedSkillsFrom(analysis: JobAnalysis, skills: ProfileSkill[]): RequestedSkill[] {
    const byName = new Map<string, RequestedSkill>();

    for (const requirement of analysis.requirements) {
        if (!requirement.skill) continue;

        const key = normalizeText(requirement.skill);
        if (!key) continue;

        const priority = requirement.priority === 'required' ? 'required' : 'preferred';
        const existing = byName.get(key);
        if (existing && existing.priority === 'required') continue;

        byName.set(key, {
            name: requirement.skill,
            priority,
            profileSkillId: findProfileSkill(skills, requirement.skill)?.id ?? null,
        });
    }

    // Required first, then preferred. Stable within each group.
    return [...byName.values()].sort((a, b) =>
        (a.priority === b.priority ? 0 : a.priority === 'required' ? -1 : 1)
    );
}

export function matchProfile(analysis: JobAnalysis, profile: ProfileSnapshot, now = new Date()): MatchResult {
    const requestedSkills = requestedSkillsFrom(analysis, profile.skills);
    const skillNameById = new Map(profile.skills.map((s) => [s.id, s.name]));

    const requirementTokens = new Set(
        analysis.requirements.flatMap((r) => tokens(r.text))
    );

    const skillWeight = (skillIds: string[]) =>
        requestedSkills.reduce((sum, requested) => {
            if (!requested.profileSkillId || !skillIds.includes(requested.profileSkillId)) return sum;
            return sum + SKILL_WEIGHT[requested.priority];
        }, 0);

    const overlap = (text: string) => {
        const shared = new Set(tokens(text).filter((t) => requirementTokens.has(t)));
        return Math.min(shared.size, 4) * 0.5;
    };

    const experienceCandidates = profile.experiences
        .map((experience) => {
            const bullets = [
                ...experience.achievements.map((text, index) => ({ text, kind: 'achievement' as const, index })),
                ...experience.responsibilities.map((text, index) => ({ text, kind: 'responsibility' as const, index })),
            ];
            const scoredBullets = bullets
                .map((bullet) => ({ ...bullet, score: overlap(bullet.text) + (bullet.kind === 'achievement' ? 0.5 : 0) }))
                .sort((a, b) => b.score - a.score);

            const raw = skillWeight(experience.skill_ids) + scoredBullets.slice(0, 3).reduce((s, b) => s + b.score, 0);
            return { experience, bullets: scoredBullets, score: raw * recencyFactor(experience.end_date, now) };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_EXPERIENCES);

    const projectCandidates = profile.projects
        .map((project) => {
            const items = [project.description, project.contribution].filter((t): t is string => Boolean(t?.trim()));
            const scored = items.map((text) => ({ text, score: overlap(text) }));
            const skillScore = skillWeight(project.skill_ids);
            const raw = skillScore + scored.reduce((s, i) => s + i.score, 0);
            return { project, items: scored, skillHit: skillScore > 0, score: raw * recencyFactor(project.end_date, now) };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_PROJECTS);

    const evidence: EvidenceItem[] = [];

    for (const candidate of experienceCandidates) {
        const { experience } = candidate;
        const picked = candidate.bullets.filter((b) => b.score > 0).slice(0, MAX_BULLETS_PER_SOURCE);
        const fallback = picked.length === 0 && candidate.bullets.length > 0 ? [candidate.bullets[0]] : picked;

        for (const bullet of fallback) {
            evidence.push(evidenceFromExperience(experience, bullet.text, bullet.score + candidate.score / 10, skillNameById));
        }
    }

    for (const candidate of projectCandidates) {
        // A project qualifies through a matched skill even when its wording does not overlap.
        for (const item of candidate.items.filter((i) => i.score > 0 || candidate.skillHit)) {
            evidence.push({
                id: '',
                source: 'project',
                source_id: candidate.project.id,
                source_name: candidate.project.name,
                text: item.text,
                skills: skillNamesFor(candidate.project.skill_ids, skillNameById),
                score: item.score + candidate.score / 10,
            });
        }
    }

    const ranked = evidence
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_EVIDENCE)
        .map((item, index) => ({ ...item, id: `E${index + 1}` }));

    // A skill counts as matched when the profile has it. Gaps are what the job asks for and the profile does not show.
    const matchedSkills = requestedSkills.filter((s) => s.profileSkillId).map((s) => s.name);
    const gapSkills = requestedSkills.filter((s) => !s.profileSkillId).map((s) => s.name);

    return { requestedSkills, matchedSkills, gapSkills, evidence: ranked };
}

function evidenceFromExperience(
    experience: Experience,
    text: string,
    score: number,
    skillNameById: Map<string, string>
): EvidenceItem {
    return {
        id: '',
        source: 'experience',
        source_id: experience.id,
        source_name: `${experience.role} at ${experience.company}`,
        text,
        skills: skillNamesFor(experience.skill_ids, skillNameById),
        score,
    };
}

function skillNamesFor(skillIds: string[], skillNameById: Map<string, string>): string[] {
    return skillIds.map((id) => skillNameById.get(id)).filter((n): n is string => Boolean(n));
}

// Recent work counts more than old work. Open-ended roles count as current.
function recencyFactor(endDate: string | null, now: Date): number {
    if (!endDate) return 1;
    const years = (now.getTime() - new Date(endDate).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years <= 2) return 0.9;
    return 0.7;
}

// Exposed for validation: true when a requested skill name is mentioned in the text.
export function mentionsSkill(text: string, skillName: string): boolean {
    return containsPhrase(normalizeText(text), normalizeText(skillName));
}
