'use client'

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Loader2, X } from 'lucide-react'
import { deleteSkill, saveSkill } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { normalizeText } from '@/lib/harness/text'
import type { ProfileSkill } from '@/lib/types/profile'

interface SkillsSectionProps {
    skills: ProfileSkill[]
    setSkills: Dispatch<SetStateAction<ProfileSkill[]>>
    usage: Record<string, number>
}

const byName = (a: ProfileSkill, b: ProfileSkill) => a.name.localeCompare(b.name)

export function parseAliases(value: string): string[] {
    return [...new Set(value.split(',').map((a) => a.trim()).filter(Boolean))].slice(0, 10)
}

// Skills are shown as pills. Click a pill to edit it, and use its cross to remove it.
export function SkillsSection({ skills, setSkills, usage }: SkillsSectionProps) {
    const { toast } = useToast()
    const [name, setName] = useState('')
    const [aliases, setAliases] = useState('')
    const [isAdding, setIsAdding] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [removeTarget, setRemoveTarget] = useState<ProfileSkill | null>(null)

    const editing = skills.find((s) => s.id === editingId) ?? null

    // Optimistic add: the pill appears at once with a temporary id, which is replaced by the saved id.
    const addSkill = async (event: FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return

        const key = normalizeText(trimmed)
        if (skills.some((s) => s.normalized_name === key || s.aliases.some((a) => normalizeText(a) === key))) {
            toast({ title: 'You already have this skill', description: 'Select it in experiences or projects instead.' })
            return
        }

        const tempId = `temp-${crypto.randomUUID()}`
        const nextAliases = parseAliases(aliases)
        const optimistic: ProfileSkill = { id: tempId, name: trimmed, normalized_name: key, aliases: nextAliases }

        setSkills((prev) => [...prev, optimistic].sort(byName))
        setName('')
        setAliases('')
        setIsAdding(true)

        const result = await saveSkill({ name: trimmed, aliases: nextAliases })
        setIsAdding(false)

        if (!result.success) {
            setSkills((prev) => prev.filter((s) => s.id !== tempId))
            setName(trimmed)
            setAliases(nextAliases.join(', '))
            toast({ title: 'Could not add skill', description: result.message, variant: 'destructive' })
            return
        }

        const savedId = result.data!.id
        setSkills((prev) => prev.map((s) => (s.id === tempId ? { ...s, id: savedId } : s)))
    }

    const updateSkill = async (skill: ProfileSkill, nextName: string, nextAliases: string[]) => {
        const previous = skill
        const updated: ProfileSkill = { ...skill, name: nextName, normalized_name: normalizeText(nextName), aliases: nextAliases }
        setSkills((prev) => prev.map((s) => (s.id === skill.id ? updated : s)).sort(byName))
        setEditingId(null)

        const result = await saveSkill({ id: skill.id, name: nextName, aliases: nextAliases })
        if (!result.success) {
            setSkills((prev) => prev.map((s) => (s.id === skill.id ? previous : s)).sort(byName))
            toast({ title: 'Could not update skill', description: result.message, variant: 'destructive' })
        }
    }

    const removeSkill = async (skill: ProfileSkill) => {
        setSkills((prev) => prev.filter((s) => s.id !== skill.id))
        const result = await deleteSkill(skill.id)
        if (!result.success) {
            setSkills((prev) => [...prev, skill].sort(byName))
            toast({ title: 'Could not remove skill', description: result.message, variant: 'destructive' })
        }
    }

    const requestRemove = (skill: ProfileSkill) => {
        if ((usage[skill.id] ?? 0) > 0) {
            setRemoveTarget(skill)
        } else {
            void removeSkill(skill)
        }
    }

    const isTemp = (skill: ProfileSkill) => skill.id.startsWith('temp-')

    return (
        <div className="space-y-5">
            {skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add the technologies and skills you want matched against job postings.</p>
            ) : (
                <ul className="flex flex-wrap gap-2" aria-label="Skills">
                    {skills.map((skill) => {
                        const count = usage[skill.id] ?? 0
                        const isActive = editingId === skill.id
                        return (
                            <li
                                key={skill.id}
                                className={`inline-flex h-8 items-center rounded-full border pl-4 pr-1.5 text-sm transition-colors ${
                                    isActive ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setEditingId(isActive ? null : skill.id)}
                                    disabled={isTemp(skill)}
                                    title={
                                        skill.aliases.length > 0
                                            ? `Also known as ${skill.aliases.join(', ')}. Used in ${count} ${count === 1 ? 'entry' : 'entries'}. Click to edit.`
                                            : `Used in ${count} ${count === 1 ? 'entry' : 'entries'}. Click to edit.`
                                    }
                                    className="max-w-[16rem] truncate px-0.5 text-foreground disabled:opacity-60"
                                >
                                    {skill.name}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => requestRemove(skill)}
                                    disabled={isTemp(skill)}
                                    aria-label={`Remove ${skill.name}`}
                                    className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}

            {editing && (
                <div className="rounded-md border p-3">
                    <SkillEditor
                        key={editing.id}
                        skill={editing}
                        onCancel={() => setEditingId(null)}
                        onSave={(n, a) => updateSkill(editing, n, a)}
                    />
                </div>
            )}

            <form onSubmit={addSkill} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                    <label htmlFor="new-skill" className="text-sm font-medium">Skill</label>
                    <Input id="new-skill" value={name} onChange={(e) => setName(e.target.value)} placeholder="PostgreSQL" maxLength={60} />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="new-skill-aliases" className="text-sm font-medium">Other names <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <Input id="new-skill-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Postgres, psql" />
                </div>
                <Button type="submit" disabled={!name.trim() || isAdding}>
                    {isAdding && <Loader2 className="animate-spin" />}
                    Add skill
                </Button>
            </form>

            <ConfirmDialog
                open={removeTarget !== null}
                onOpenChange={(open) => !open && setRemoveTarget(null)}
                title={`Remove ${removeTarget?.name ?? 'skill'}?`}
                description={`It will be unlinked from ${removeTarget ? usage[removeTarget.id] ?? 0 : 0} experiences and projects. Those entries stay.`}
                confirmLabel="Remove skill"
                destructive
                onConfirm={() => {
                    const target = removeTarget
                    setRemoveTarget(null)
                    if (target) void removeSkill(target)
                }}
            />
        </div>
    )
}

function SkillEditor({ skill, onSave, onCancel }: { skill: ProfileSkill; onSave: (name: string, aliases: string[]) => void; onCancel: () => void }) {
    const [name, setName] = useState(skill.name)
    const [aliases, setAliases] = useState(skill.aliases.join(', '))

    return (
        <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
            onSubmit={(event) => {
                event.preventDefault()
                if (name.trim()) onSave(name.trim(), parseAliases(aliases))
            }}
        >
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Skill name" maxLength={60} autoFocus />
            <Input value={aliases} onChange={(e) => setAliases(e.target.value)} aria-label="Other names" placeholder="Other names, comma separated" />
            <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </form>
    )
}
