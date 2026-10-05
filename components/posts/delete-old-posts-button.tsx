'use client'

import { useState, useTransition } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteOldPosts } from '@/app/actions/posts'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

interface DeleteOldPostsButtonProps {
    count: number
}

export function DeleteOldPostsButton({ count }: DeleteOldPostsButtonProps) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    const handleConfirm = () => {
        setOpen(false)
        startTransition(async () => {
            const result = await deleteOldPosts()
            if (result.success) {
                toast({ title: 'Old posts deleted', description: `${result.data ?? 0} posts removed.` })
            } else {
                toast({ title: 'Delete failed', description: result.message, variant: 'destructive' })
            }
        })
    }

    if (count === 0) {
        return <p className="text-sm text-muted-foreground">Nothing older than 24 hours to clean up</p>
    }

    return (
        <>
            <Button variant="destructive" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
                {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {isPending ? 'Deleting' : `Delete ${count} old ${count === 1 ? 'post' : 'posts'}`}
            </Button>

            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Delete old posts?"
                description={`${count} unpublished ${count === 1 ? 'post' : 'posts'} older than 24 hours will be permanently deleted. Published posts are never removed.`}
                confirmLabel="Delete"
                destructive
                onConfirm={handleConfirm}
            />
        </>
    )
}
