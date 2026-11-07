'use client'

import { useState, useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { deleteIdea, updateIdea } from '@/app/actions/linkedin-ideas'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { Idea } from '@/lib/types/linkedin-ideas'

interface IdeaEditDialogProps {
    idea: Idea | null
    onOpenChange: (open: boolean) => void
    onSaved: (id: string, patch: { title: string; body: string }) => void
    onDeleted: (id: string) => void
}

// Full-screen below sm: a cramped small modal is unusable for writing a post draft on a phone.
export function IdeaEditDialog({ idea, onOpenChange, onSaved, onDeleted }: IdeaEditDialogProps) {
    return (
        <Dialog open={idea !== null} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-screen w-screen max-w-none flex-col rounded-none sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-lg">
                <DialogHeader>
                    <DialogTitle>Edit idea</DialogTitle>
                </DialogHeader>
                {/* Keyed by id so each card gets a fresh form instance -- its initial state comes
                    straight from props, no effect needed to resync when the open card changes. */}
                {idea && (
                    <IdeaEditForm key={idea.id} idea={idea} onOpenChange={onOpenChange} onSaved={onSaved} onDeleted={onDeleted} />
                )}
            </DialogContent>
        </Dialog>
    )
}

function IdeaEditForm({
    idea,
    onOpenChange,
    onSaved,
    onDeleted,
}: {
    idea: Idea
    onOpenChange: (open: boolean) => void
    onSaved: (id: string, patch: { title: string; body: string }) => void
    onDeleted: (id: string) => void
}) {
    const { toast } = useToast()
    const [title, setTitle] = useState(idea.title)
    const [body, setBody] = useState(idea.body)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [isSaving, startSaving] = useTransition()
    const [isDeleting, startDeleting] = useTransition()

    const save = () => {
        const trimmedTitle = title.trim()
        if (!trimmedTitle) {
            toast({ title: 'Title is required', variant: 'destructive' })
            return
        }
        startSaving(async () => {
            const result = await updateIdea(idea.id, { title: trimmedTitle, body })
            if (result.success) {
                onSaved(idea.id, { title: trimmedTitle, body })
                onOpenChange(false)
            } else {
                toast({ title: 'Could not save', description: result.message, variant: 'destructive' })
            }
        })
    }

    const confirmDeleteNow = () => {
        setConfirmDelete(false)
        startDeleting(async () => {
            const result = await deleteIdea(idea.id)
            if (result.success) {
                onDeleted(idea.id)
                onOpenChange(false)
            } else {
                toast({ title: 'Could not delete', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
                <div className="space-y-2">
                    <Label htmlFor="idea-title">Title</Label>
                    <Input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                    <Label htmlFor="idea-body">Draft</Label>
                    <Textarea
                        id="idea-body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={10}
                        maxLength={10000}
                        className="flex-1 resize-none leading-relaxed"
                        placeholder="Write the actual post here..."
                    />
                </div>
            </div>
            <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-4 sm:justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    disabled={isDeleting}
                >
                    <Trash2 />
                    Delete
                </Button>
                <Button onClick={save} disabled={isSaving}>
                    {isSaving && <Loader2 className="animate-spin" />}
                    Save
                </Button>
            </DialogFooter>
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete this idea?"
                description="This removes the card and anything written in it. This cannot be undone."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDeleteNow}
            />
        </>
    )
}
