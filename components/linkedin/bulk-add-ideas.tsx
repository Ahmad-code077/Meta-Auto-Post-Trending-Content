'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { bulkCreateIdeas } from '@/app/actions/linkedin-ideas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { parseIdeaLines } from '@/lib/linkedin-ideas/parse'

interface BulkAddIdeasProps {
    // "empty-state": shown inline, large, as the board's only content when there are no cards yet.
    // "button": a small "Add ideas" button that opens the same textarea in a dialog.
    variant: 'empty-state' | 'button'
    onAdded: () => void
}

// Copied verbatim into the clipboard -- this is a prompt for the user's AI, not UI copy, so it is
// not reformatted or shortened for display.
const FORMAT_PROMPT = `When you give me the ideas, output them in this exact format so I can paste them into my tool:

- One idea per line
- Plain text only
- No numbering, no bullets, no dashes, no markdown
- No blank lines between ideas
- No intro sentence, no outro, no explanation — just the ideas, one per line

Example:
Idea one goes here on its own line
Idea two goes here on its own line
Idea three goes here on its own line`

export function BulkAddIdeas({ variant, onAdded }: BulkAddIdeasProps) {
    const { toast } = useToast()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [text, setText] = useState('')
    const [isPending, startTransition] = useTransition()
    const count = parseIdeaLines(text).length

    const copyFormatPrompt = () => {
        navigator.clipboard
            .writeText(FORMAT_PROMPT)
            .then(() => toast({ title: 'Copied.' }))
            .catch(() => toast({ title: 'Could not copy', variant: 'destructive' }))
    }

    const submit = () => {
        startTransition(async () => {
            const result = await bulkCreateIdeas(text)
            if (result.success) {
                toast({ title: `${result.data?.created ?? 0} idea${result.data?.created === 1 ? '' : 's'} added` })
                setText('')
                setDialogOpen(false)
                onAdded()
            } else {
                toast({ title: 'Could not add those ideas', description: result.message, variant: 'destructive' })
            }
        })
    }

    const form = (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" variant="outline" size="sm" onClick={copyFormatPrompt}>
                    Copy formatting prompt for your AI
                </Button>
                <p className="text-xs text-muted-foreground">
                    Paste this into your AI so ideas come out one per line, paste-ready.
                </p>
            </div>
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={variant === 'empty-state' ? 10 : 8}
                placeholder={'One idea per line, for example:\n5 lessons from shipping a side project\nWhy I stopped using X for Y'}
                className="resize-y"
            />
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{count} idea{count === 1 ? '' : 's'} will be added</p>
                <Button onClick={submit} disabled={isPending || count === 0}>
                    {isPending && <Loader2 className="animate-spin" />}
                    Add{count > 0 ? ` ${count}` : ''} idea{count === 1 ? '' : 's'}
                </Button>
            </div>
        </div>
    )

    if (variant === 'empty-state') {
        return (
            <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 text-sm font-medium text-foreground">Paste your ideas</h3>
                {form}
            </div>
        )
    }

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus />
                Add ideas
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add ideas</DialogTitle>
                    </DialogHeader>
                    {form}
                </DialogContent>
            </Dialog>
        </>
    )
}
