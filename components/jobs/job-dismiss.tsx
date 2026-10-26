'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Undo2, Loader2 } from 'lucide-react'
import { dismissJob, restoreJob } from '@/app/actions/applications'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

// Hides a job from the Command Center. Confirmed first, since it removes the card from view.
export function DismissJobButton({ jobId, label }: { jobId: string; label: string }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    const confirm = () => {
        setOpen(false)
        startTransition(async () => {
            const result = await dismissJob(jobId)
            if (result.success) {
                router.refresh()
            } else {
                toast({ title: 'Could not dismiss', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setOpen(true)
                }}
                disabled={isPending}
                aria-label={`Dismiss ${label}`}
                title="Dismiss from Command Center"
            >
                {isPending ? <Loader2 className="animate-spin" /> : <X />}
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Dismiss this application?"
                description={`${label} will no longer appear in the Command Center. It stays on the applications list, and nothing about it changes. You can restore it from "Show dismissed" any time.`}
                confirmLabel="Dismiss"
                onConfirm={confirm}
            />
        </>
    )
}

// Brings a dismissed job back. No confirmation -- this only adds the card back, which is reversible.
export function RestoreJobButton({ jobId }: { jobId: string }) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const restore = () => {
        startTransition(async () => {
            const result = await restoreJob(jobId)
            if (result.success) {
                router.refresh()
            } else {
                toast({ title: 'Could not restore', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <Button variant="outline" size="sm" onClick={restore} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
            Restore
        </Button>
    )
}
