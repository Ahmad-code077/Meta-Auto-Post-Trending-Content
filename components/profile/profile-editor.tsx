'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Experience, Project, ProfileDetails, ProfileSkill, ResumeSummary } from '@/lib/types/profile'
import { DetailsForm } from './details-form'
import { ExperienceSection } from './experience-section'
import { ProjectSection } from './project-section'
import { ResumeSection } from './resume-section'
import { SkillsSection } from './skills-section'
import { useServerList } from './use-server-list'

interface ProfileEditorProps {
    details: ProfileDetails
    signInEmail: string | null
    skills: ProfileSkill[]
    experiences: Experience[]
    projects: Project[]
    resume: ResumeSummary | null
    resumeVersions: number
}

// The profile is the single source the application harness reads from.
// Every section edits the same records; nothing is copied elsewhere.
export function ProfileEditor({ details, signInEmail, skills: serverSkills, experiences: serverExperiences, projects: serverProjects, resume, resumeVersions }: ProfileEditorProps) {
    const [skills, setSkills] = useServerList(serverSkills)
    const [experiences, setExperiences] = useServerList(serverExperiences)
    const [projects, setProjects] = useServerList(serverProjects)

    const usage: Record<string, number> = {}
    for (const e of experiences) for (const id of e.skill_ids) usage[id] = (usage[id] ?? 0) + 1
    for (const p of projects) for (const id of p.skill_ids) usage[id] = (usage[id] ?? 0) + 1

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Basic information</CardTitle>
                    <CardDescription>Your contact details and links. These appear on every application.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DetailsForm details={details} signInEmail={signInEmail} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Skills</CardTitle>
                    <CardDescription>Each skill is stored once. Experiences and projects link to these, so renaming or removing one is reflected everywhere.</CardDescription>
                </CardHeader>
                <CardContent>
                    <SkillsSection skills={skills} setSkills={setSkills} usage={usage} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Work experience</CardTitle>
                    <CardDescription>Roles, responsibilities, achievements and the skills you used in each.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ExperienceSection experiences={experiences} setExperiences={setExperiences} skills={skills} setSkills={setSkills} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Projects</CardTitle>
                    <CardDescription>Work outside a job. Focus on what you personally contributed.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ProjectSection projects={projects} setProjects={setProjects} skills={skills} setSkills={setSkills} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Resume</CardTitle>
                    <CardDescription>One current resume. It is attached automatically when you send an application.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResumeSection resume={resume} versions={resumeVersions} />
                </CardContent>
            </Card>
        </div>
    )
}
