'use client'

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteProject, saveProject, type ProjectInput } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { Project, ProfileSkill } from '@/lib/types/profile'
import { dateRangeLabel, toMonth } from './format'
import { normalizeMonth, SkillBadges } from './experience-section'
import { SkillPicker } from './skill-picker'

interface ProjectSectionProps {
    projects: Project[]
    setProjects: Dispatch<SetStateAction<Project[]>>
    skills: ProfileSkill[]
    setSkills: Dispatch<SetStateAction<ProfileSkill[]>>
}

export function ProjectSection({ projects, setProjects, skills, setSkills }: ProjectSectionProps) {
    const { toast } = useToast()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Project | null>(null)
    const [session, setSession] = useState(0)
    const [removeTarget, setRemoveTarget] = useState<Project | null>(null)

    const open = (project: Project | null) => {
        setEditing(project)
        setSession((n) => n + 1)
        setDialogOpen(true)
    }

    const remove = async (project: Project) => {
        setProjects((prev) => prev.filter((p) => p.id !== project.id))
        const result = await deleteProject(project.id)
        if (!result.success) {
            setProjects((prev) => [...prev, project])
            toast({ title: 'Could not delete', description: result.message, variant: 'destructive' })
        }
    }

    return (
        <div className="space-y-4">
            {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Projects show work you did yourself. Describe your contribution, not only the project.
                </p>
            ) : (
                <ul className="space-y-3">
                    {projects.map((project) => (
                        <li key={project.id} className="rounded-md border p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground">{project.name}</p>
                                    {project.url && <p className="truncate text-sm text-muted-foreground">{project.url}</p>}
                                    {(project.start_date || project.end_date) && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">{dateRangeLabel(project.start_date, project.end_date)}</p>
                                    )}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => open(project)} aria-label={`Edit ${project.name}`}>
                                        <Pencil />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setRemoveTarget(project)} aria-label={`Delete ${project.name}`}>
                                        <Trash2 />
                                    </Button>
                                </div>
                            </div>
                            {project.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
                            <SkillBadges ids={project.skill_ids} skills={skills} />
                        </li>
                    ))}
                </ul>
            )}

            <Button variant="outline" onClick={() => open(null)}>
                <Plus />
                Add project
            </Button>

            {dialogOpen && (
                <ProjectDialog
                    key={`${editing?.id ?? 'new'}-${session}`}
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    project={editing}
                    skills={skills}
                    onSkillCreated={(skill) => setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)))}
                    onSaved={(saved) =>
                        setProjects((prev) => (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]))
                    }
                />
            )}

            <ConfirmDialog
                open={removeTarget !== null}
                onOpenChange={(open) => !open && setRemoveTarget(null)}
                title="Delete this project?"
                description={removeTarget ? `${removeTarget.name} will be removed from your profile.` : ''}
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                    const target = removeTarget
                    setRemoveTarget(null)
                    if (target) void remove(target)
                }}
            />
        </div>
    )
}

function ProjectDialog({
    open,
    onOpenChange,
    project,
    skills,
    onSkillCreated,
    onSaved,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    project: Project | null
    skills: ProfileSkill[]
    onSkillCreated: (skill: ProfileSkill) => void
    onSaved: (project: Project) => void
}) {
    const { toast } = useToast()
    const [isSaving, setIsSaving] = useState(false)
    const [skillIds, setSkillIds] = useState<string[]>(project?.skill_ids ?? [])

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const get = (k: string) => String(form.get(k) ?? '')

        const input: ProjectInput = {
            id: project?.id,
            name: get('name'),
            url: get('url'),
            description: get('description'),
            contribution: get('contribution'),
            start_date: get('start_date'),
            end_date: get('end_date'),
            skill_ids: skillIds,
        }

        setIsSaving(true)
        const result = await saveProject(input)
        setIsSaving(false)

        if (!result.success) {
            toast({ title: 'Could not save project', description: result.message, variant: 'destructive' })
            return
        }

        onSaved({
            id: result.data!.id,
            name: input.name,
            url: input.url || null,
            description: input.description || null,
            contribution: input.contribution || null,
            start_date: normalizeMonth(input.start_date ?? ''),
            end_date: normalizeMonth(input.end_date ?? ''),
            skill_ids: skillIds,
        })
        toast({ title: project ? 'Project updated' : 'Project added' })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{project ? 'Edit project' : 'Add project'}</DialogTitle>
                    <DialogDescription>Say what you built and what you personally did.</DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" name="name" required defaultValue={project?.name ?? ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="url">Link</Label>
                            <Input id="url" name="url" type="url" defaultValue={project?.url ?? ''} placeholder="https://" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                            <div className="space-y-2">
                                <Label htmlFor="start_date">Start</Label>
                                <Input id="start_date" name="start_date" type="month" defaultValue={toMonth(project?.start_date ?? null)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="end_date">End</Label>
                                <Input id="end_date" name="end_date" type="month" defaultValue={toMonth(project?.end_date ?? null)} />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="description">What it is</Label>
                            <Textarea id="description" name="description" rows={4} maxLength={1200} defaultValue={project?.description ?? ''} placeholder="The problem and the result, in two or three sentences." />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contribution">Your contribution</Label>
                            <Textarea id="contribution" name="contribution" rows={4} maxLength={1200} defaultValue={project?.contribution ?? ''} placeholder="What you designed, built or owned." />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Technologies</Label>
                        <SkillPicker skills={skills} selectedIds={skillIds} onChange={setSkillIds} onCreated={onSkillCreated} />
                    </div>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="animate-spin" />}
                            {isSaving ? 'Saving' : 'Save project'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
