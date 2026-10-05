'use client'

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteExperience, saveExperience, type ExperienceInput } from '@/app/actions/profile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { Experience, ProfileSkill } from '@/lib/types/profile'
import { SkillPicker } from './skill-picker'
import { dateRangeLabel, linesToList, listToLines, toMonth } from './format'

interface ExperienceSectionProps {
    experiences: Experience[]
    setExperiences: Dispatch<SetStateAction<Experience[]>>
    skills: ProfileSkill[]
    setSkills: Dispatch<SetStateAction<ProfileSkill[]>>
}

export function ExperienceSection({ experiences, setExperiences, skills, setSkills }: ExperienceSectionProps) {
    const { toast } = useToast()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Experience | null>(null)
    const [session, setSession] = useState(0)
    const [removeTarget, setRemoveTarget] = useState<Experience | null>(null)

    // A new session remounts the form, so a cancelled edit never leaks into the next one.
    const openNew = () => {
        setEditing(null)
        setSession((n) => n + 1)
        setDialogOpen(true)
    }

    const openEdit = (experience: Experience) => {
        setEditing(experience)
        setSession((n) => n + 1)
        setDialogOpen(true)
    }

    const remove = async (experience: Experience) => {
        setExperiences((prev) => prev.filter((e) => e.id !== experience.id))
        const result = await deleteExperience(experience.id)
        if (!result.success) {
            setExperiences((prev) => [...prev, experience])
            toast({ title: 'Could not delete', description: result.message, variant: 'destructive' })
        }
    }

    return (
        <div className="space-y-4">
            {experiences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Add the roles you have held. Achievements and skills from here are the strongest evidence in an application.
                </p>
            ) : (
                <ul className="space-y-3">
                    {experiences.map((experience) => (
                        <li key={experience.id} className="rounded-md border p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground">{experience.role}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {experience.company}
                                        {experience.location ? ` · ${experience.location}` : ''}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{dateRangeLabel(experience.start_date, experience.end_date)}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(experience)} aria-label={`Edit ${experience.role} at ${experience.company}`}>
                                        <Pencil />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setRemoveTarget(experience)} aria-label={`Delete ${experience.role} at ${experience.company}`}>
                                        <Trash2 />
                                    </Button>
                                </div>
                            </div>
                            <SkillBadges ids={experience.skill_ids} skills={skills} />
                            <p className="mt-2 text-xs text-muted-foreground">
                                {experience.responsibilities.length} responsibilities · {experience.achievements.length} achievements
                            </p>
                        </li>
                    ))}
                </ul>
            )}

            <Button variant="outline" onClick={openNew}>
                <Plus />
                Add experience
            </Button>

            <ExperienceDialog
                key={`${editing?.id ?? 'new'}-${session}`}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                experience={editing}
                skills={skills}
                onSkillCreated={(skill) => setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)))}
                onSaved={(saved) => {
                    setExperiences((prev) => (prev.some((e) => e.id === saved.id) ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved]))
                }}
            />

            <ConfirmDialog
                open={removeTarget !== null}
                onOpenChange={(open) => !open && setRemoveTarget(null)}
                title="Delete this experience?"
                description={removeTarget ? `${removeTarget.role} at ${removeTarget.company} will be removed from your profile.` : ''}
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

export function SkillBadges({ ids, skills }: { ids: string[]; skills: ProfileSkill[] }) {
    const byId = new Map(skills.map((s) => [s.id, s.name]))
    const names = ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n))
    if (names.length === 0) return null
    return (
        <div className="mt-3 flex flex-wrap gap-1.5">
            {names.map((name) => (
                <Badge key={name} variant="outline" className="font-normal">{name}</Badge>
            ))}
        </div>
    )
}

function ExperienceDialog({
    open,
    onOpenChange,
    experience,
    skills,
    onSkillCreated,
    onSaved,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    experience: Experience | null
    skills: ProfileSkill[]
    onSkillCreated: (skill: ProfileSkill) => void
    onSaved: (experience: Experience) => void
}) {
    const { toast } = useToast()
    const [isSaving, setIsSaving] = useState(false)
    const [isCurrent, setIsCurrent] = useState(experience ? experience.end_date === null : true)
    const [skillIds, setSkillIds] = useState<string[]>(experience?.skill_ids ?? [])

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const get = (k: string) => String(form.get(k) ?? '')

        const input: ExperienceInput = {
            id: experience?.id,
            company: get('company'),
            role: get('role'),
            location: get('location'),
            start_date: get('start_date'),
            end_date: isCurrent ? '' : get('end_date'),
            responsibilities: linesToList(get('responsibilities')),
            achievements: linesToList(get('achievements')),
            skill_ids: skillIds,
        }

        setIsSaving(true)
        const result = await saveExperience(input)
        setIsSaving(false)

        if (!result.success) {
            toast({ title: 'Could not save experience', description: result.message, variant: 'destructive' })
            return
        }

        onSaved({
            id: result.data!.id,
            company: input.company,
            role: input.role,
            location: input.location || null,
            start_date: normalizeMonth(input.start_date ?? ''),
            end_date: isCurrent ? null : normalizeMonth(input.end_date ?? ''),
            responsibilities: input.responsibilities ?? [],
            achievements: input.achievements ?? [],
            skill_ids: skillIds,
        })
        toast({ title: experience ? 'Experience updated' : 'Experience added' })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{experience ? 'Edit experience' : 'Add experience'}</DialogTitle>
                    <DialogDescription>Write responsibilities and achievements as short lines. Only what you enter here can appear in an application.</DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="company">Company</Label>
                            <Input id="company" name="company" required defaultValue={experience?.company ?? ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Input id="role" name="role" required defaultValue={experience?.role ?? ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input id="location" name="location" defaultValue={experience?.location ?? ''} placeholder="Remote, City" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="start_date">Start</Label>
                                <Input id="start_date" name="start_date" type="month" defaultValue={toMonth(experience?.start_date ?? null)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="end_date">End</Label>
                                <Input id="end_date" name="end_date" type="month" disabled={isCurrent} defaultValue={toMonth(experience?.end_date ?? null)} />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                            <input
                                type="checkbox"
                                checked={isCurrent}
                                onChange={(e) => setIsCurrent(e.target.checked)}
                                className="h-4 w-4 accent-primary"
                            />
                            I currently work here
                        </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="responsibilities">Responsibilities</Label>
                            <Textarea id="responsibilities" name="responsibilities" rows={6} defaultValue={listToLines(experience?.responsibilities ?? [])} placeholder={'One per line\nBuilt the ingestion pipeline'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="achievements">Achievements</Label>
                            <Textarea id="achievements" name="achievements" rows={6} defaultValue={listToLines(experience?.achievements ?? [])} placeholder={'One per line\nCut p95 latency by 40%'} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Skills used</Label>
                        <SkillPicker
                            skills={skills}
                            selectedIds={skillIds}
                            onChange={setSkillIds}
                            onCreated={onSkillCreated}
                        />
                    </div>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="animate-spin" />}
                            {isSaving ? 'Saving' : 'Save experience'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// Month values come back as YYYY-MM. The stored form is the first day of that month.
export function normalizeMonth(value: string): string | null {
    if (!value) return null
    return value.length === 7 ? `${value}-01` : value
}
