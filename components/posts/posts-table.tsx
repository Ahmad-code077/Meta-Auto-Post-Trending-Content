'use client'

import { useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { Check, ExternalLink, Facebook, ImageIcon, Instagram, Loader2, Send } from 'lucide-react'
import { requestImageGeneration, requestPublish } from '@/app/actions/posts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Platform, Post, PostStatus } from '@/lib/types/posts'

interface PostsTableProps {
    posts: Post[]
}

const PLATFORM_OPTIONS: { value: Platform; label: string; Icon: typeof Instagram }[] = [
    { value: 'instagram', label: 'Instagram', Icon: Instagram },
    { value: 'facebook', label: 'Facebook', Icon: Facebook },
]

const STATUS_BADGE: Record<PostStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'outline' },
    approved: { label: 'Approved', variant: 'secondary' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    published: { label: 'Published', variant: 'default' },
}

type Busy = 'generating' | 'publishing'

export default function PostsTable({ posts }: PostsTableProps) {
    const { toast } = useToast()

    // Platform choices per post. Keyed by id so they survive refreshes.
    const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, Platform[]>>({})
    // Requests in flight, shown as inline progress on the row.
    const [busy, setBusy] = useState<Record<string, Busy>>({})
    // Status changes shown before the server confirms them. Each override keeps the
    // post object it was made from, so it stops applying once fresh server data arrives.
    const [optimisticStatus, setOptimisticStatus] = useState<Record<string, { status: PostStatus; base: Post }>>({})
    const [publishTarget, setPublishTarget] = useState<{ post: Post; platforms: Platform[] } | null>(null)

    const statusFor = (post: Post): PostStatus => {
        const override = optimisticStatus[post.id]
        return override && override.base === post ? override.status : post.status
    }

    const togglePlatform = (postId: string, platform: Platform) => {
        setSelectedPlatforms((prev) => {
            const current = prev[postId] ?? []
            const next = current.includes(platform)
                ? current.filter((p) => p !== platform)
                : [...current, platform]
            return { ...prev, [postId]: next }
        })
    }

    const setBusyFor = (postId: string, value: Busy | null) => {
        setBusy((prev) => {
            const next = { ...prev }
            if (value) next[postId] = value
            else delete next[postId]
            return next
        })
    }

    const generateImage = async (post: Post) => {
        setBusyFor(post.id, 'generating')
        const result = await requestImageGeneration(post.id)
        setBusyFor(post.id, null)

        if (result.success) {
            toast({ title: 'Image requested', description: 'The post will update when the image is ready.' })
        } else {
            toast({ title: 'Could not generate image', description: result.message, variant: 'destructive' })
        }
    }

    const publish = async (post: Post, platforms: Platform[]) => {
        setPublishTarget(null)
        setOptimisticStatus((prev) => ({ ...prev, [post.id]: { status: 'published', base: post } }))
        setBusyFor(post.id, 'publishing')

        const result = await requestPublish(post.id, platforms)
        setBusyFor(post.id, null)

        if (result.success) {
            toast({ title: 'Publish requested', description: 'Posting to ' + platforms.map(labelFor).join(' and ') + '.' })
        } else {
            setOptimisticStatus((prev) => {
                const next = { ...prev }
                delete next[post.id]
                return next
            })
            toast({ title: 'Could not publish', description: result.message, variant: 'destructive' })
        }
    }

    if (posts.length === 0) {
        return (
            <div className="py-16 text-center">
                <p className="text-sm font-medium text-foreground">No posts match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a different status or search term.</p>
            </div>
        )
    }

    return (
        <>
            <div className="overflow-hidden rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[260px]">Post</TableHead>
                            <TableHead className="w-28">Status</TableHead>
                            <TableHead className="w-36">Publish date</TableHead>
                            <TableHead className="min-w-[240px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {posts.map((post) => {
                            const status = statusFor(post)
                            const isBusy = busy[post.id]
                            const platforms = selectedPlatforms[post.id] ?? []

                            return (
                                <TableRow key={post.id}>
                                    <TableCell className="align-top">
                                        <div className="flex items-start gap-3">
                                            {post.image_url ? (
                                                <Image
                                                    src={post.image_url}
                                                    alt=""
                                                    width={40}
                                                    height={40}
                                                    className="h-10 w-10 shrink-0 rounded-md border object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                                                    <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                </div>
                                            )}
                                            <div className="min-w-0 space-y-1">
                                                <p className="font-medium text-foreground">{post.title}</p>
                                                <p className="line-clamp-2 text-sm text-muted-foreground">{post.content}</p>
                                                {post.hashtags && post.hashtags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 pt-1">
                                                        {post.hashtags.slice(0, 3).map((tag) => (
                                                            <Badge key={tag} variant="outline" className="text-xs">
                                                                #{tag}
                                                            </Badge>
                                                        ))}
                                                        {post.hashtags.length > 3 && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                +{post.hashtags.length - 3}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell className="align-top">
                                        <Badge variant={STATUS_BADGE[status].variant}>
                                            {STATUS_BADGE[status].label}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="align-top text-sm text-muted-foreground">
                                        {post.pub_date ? format(new Date(post.pub_date), 'MMM d, yyyy') : 'Not set'}
                                    </TableCell>

                                    <TableCell className="align-top">
                                        <div className="flex flex-col items-start gap-3">
                                            {status === 'pending' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => generateImage(post)}
                                                    disabled={isBusy === 'generating'}
                                                >
                                                    {isBusy === 'generating' ? (
                                                        <Loader2 className="animate-spin" />
                                                    ) : (
                                                        <ImageIcon />
                                                    )}
                                                    {isBusy === 'generating' ? 'Generating image' : 'Generate image'}
                                                </Button>
                                            )}

                                            {status === 'approved' && !post.image_url && (
                                                <p className="text-sm text-muted-foreground">No image yet</p>
                                            )}

                                            {status === 'approved' && post.image_url && (
                                                <>
                                                    <div className="flex items-center gap-2" role="group" aria-label="Platforms">
                                                        {PLATFORM_OPTIONS.map(({ value, label, Icon }) => {
                                                            const pressed = platforms.includes(value)
                                                            return (
                                                                <Button
                                                                    key={value}
                                                                    variant={pressed ? 'default' : 'outline'}
                                                                    size="icon"
                                                                    aria-pressed={pressed}
                                                                    aria-label={label}
                                                                    title={label}
                                                                    onClick={() => togglePlatform(post.id, value)}
                                                                    disabled={isBusy === 'publishing'}
                                                                >
                                                                    <Icon />
                                                                </Button>
                                                            )
                                                        })}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setPublishTarget({ post, platforms })}
                                                        disabled={platforms.length === 0 || isBusy === 'publishing'}
                                                    >
                                                        {isBusy === 'publishing' ? <Loader2 className="animate-spin" /> : <Send />}
                                                        {isBusy === 'publishing' ? 'Publishing' : 'Publish'}
                                                    </Button>
                                                </>
                                            )}

                                            {status === 'published' && (
                                                <p className={cn('flex items-center gap-1 text-sm', isBusy ? 'text-muted-foreground' : 'text-primary')}>
                                                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                    {isBusy ? 'Publishing' : 'Published'}
                                                </p>
                                            )}

                                            {post.link && (
                                                <a
                                                    href={post.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                                    View original
                                                </a>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            <ConfirmDialog
                open={publishTarget !== null}
                onOpenChange={(open) => !open && setPublishTarget(null)}
                title="Publish this post?"
                description={
                    publishTarget
                        ? `"${publishTarget.post.title}" will be published to ${publishTarget.platforms.map(labelFor).join(' and ')}. This cannot be undone from here.`
                        : ''
                }
                confirmLabel="Publish"
                onConfirm={() => publishTarget && publish(publishTarget.post, publishTarget.platforms)}
            />
        </>
    )
}

function labelFor(platform: Platform) {
    return PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform
}
