'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Undo2, Loader2 } from 'lucide-react'
import { deleteJob, restoreDeletedJob } from '@/app/actions/applications'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

// Soft-deletes a job. Confirmed first -- unlike dismiss, this also cancels any pending follow-up,
// and hides the job from the applications list, not just the Command Center.
export function DeleteJobButton({ jobId, label }: { jobId: string; label: string }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    const confirm = () => {
        setOpen(false)
        startTransition(async () => {
            const result = await deleteJob(jobId)
            if (result.success) {
                toast({ title: 'Application deleted' })
                router.push('/dashboard/job-posts')
            } else {
                toast({ title: 'Could not delete', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={isPending} aria-label={`Delete ${label}`}>
                {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Delete this application?"
                description={`${label} will be removed from the Command Center and the applications list, and any pending follow-up will be cancelled. You can restore it from the Deleted list any time.`}
                confirmLabel="Delete"
                destructive
                onConfirm={confirm}
            />
        </>
    )
}

// Brings a deleted job back. No confirmation -- this only adds it back, which is reversible.
export function RestoreDeletedJobButton({ jobId }: { jobId: string }) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const restore = () => {
        startTransition(async () => {
            const result = await restoreDeletedJob(jobId)
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
