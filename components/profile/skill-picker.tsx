'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { saveSkill } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { normalizeText } from '@/lib/harness/text'
import type { ProfileSkill } from '@/lib/types/profile'

interface SkillPickerProps {
    skills: ProfileSkill[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
    onCreated: (skill: ProfileSkill) => void
}

// Chooses from the profile's skills. A typed name that matches an existing skill (by name or alias)
// selects that skill instead of creating a second one.
export function SkillPicker({ skills, selectedIds, onChange, onCreated }: SkillPickerProps) {
    const { toast } = useToast()
    const [draft, setDraft] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    const toggle = (id: string) => {
        onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
    }

    const addTyped = async (event: FormEvent) => {
        event.preventDefault()
        const name = draft.trim()
        if (!name) return

        const key = normalizeText(name)
        const existing = skills.find((s) => s.normalized_name === key || s.aliases.some((a) => normalizeText(a) === key))
        if (existing) {
            if (!selectedIds.includes(existing.id)) onChange([...selectedIds, existing.id])
            setDraft('')
            return
        }

        setIsCreating(true)
        const result = await saveSkill({ name })
        setIsCreating(false)

        if (!result.success) {
            toast({ title: 'Could not add skill', description: result.message, variant: 'destructive' })
            return
        }

        const created: ProfileSkill = { id: result.data!.id, name, normalized_name: key, aliases: [] }
        onCreated(created)
        onChange([...selectedIds, created.id])
        setDraft('')
    }

    return (
        <div className="space-y-3">
            {skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skills yet. Add one below.</p>
            ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Skills">
                    {skills.map((skill) => {
                        const pressed = selectedIds.includes(skill.id)
                        return (
                            <Button
                                key={skill.id}
                                type="button"
                                size="sm"
                                variant={pressed ? 'default' : 'outline'}
                                aria-pressed={pressed}
                                onClick={() => toggle(skill.id)}
                                className="h-7 rounded-full px-3 text-xs"
                            >
                                {skill.name}
                            </Button>
                        )
                    })}
                </div>
            )}

            <form onSubmit={addTyped} className="flex gap-2">
                <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Add a skill not listed above"
                    aria-label="Add a skill"
                    maxLength={60}
                    className="h-8"
                />
                <Button type="submit" variant="outline" size="sm" disabled={!draft.trim() || isCreating}>
                    {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                    Add
                </Button>
            </form>
        </div>
    )
}
