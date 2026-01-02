'use client'

import { Post, PostStatus, Platform } from '@/lib/types/posts'
import { JSX, useState, useEffect } from 'react'
import { sendToWebhook } from '@/app/actions/webhooks'
import {
    Loader2,
    Check,
    Eye,
    Image as ImageIcon,
    Send,
    Instagram,
    Facebook,
    ExternalLink,
    MoreHorizontal,
} from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import Image from 'next/image'

interface PostsTableProps {
    posts: Post[]
}

const platformIcons: Record<Platform, JSX.Element> = {
    instagram: <Instagram className="w-4 h-4" />,
    facebook: <Facebook className="w-4 h-4" />,
}

export default function PostsTable({ posts }: PostsTableProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, Platform[]>>({})

    useEffect(() => {
        setSelectedPlatforms({})
    }, [posts])

    const togglePlatform = (postId: string, platform: Platform) => {
        setSelectedPlatforms(prev => {
            const current = prev[postId] || []
            const updated = current.includes(platform)
                ? current.filter(p => p !== platform)
                : [...current, platform]
            return { ...prev, [postId]: updated }
        })
    }

    const handleWebhookAction = async (
        postId: string,
        action: 'generate_image' | 'publish',
        platforms?: Platform[]
    ) => {
        setLoadingId(postId)
        try {
            await sendToWebhook({ postId, action, platforms })
        } catch (error) {
            console.error(`Error sending ${action} webhook:`, error)
        } finally {
            setLoadingId(null)
        }
    }

    const getStatusVariant = (status: PostStatus) => {
        switch (status) {
            case 'pending': return 'default'
            case 'approved': return 'secondary'
            case 'rejected': return 'destructive'
            case 'published': return 'outline'
            default: return 'default'
        }
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Not set'
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }

    const renderPlatformSelector = (postId: string) => {
        const platforms: Platform[] = ['instagram', 'facebook']
        const currentPlatforms = selectedPlatforms[postId] || []

        return (
            <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">Select Platforms</p>
                <div className="flex flex-wrap gap-2">
                    {platforms.map(platform => (
                        <Button
                            key={platform}
                            onClick={() => togglePlatform(postId, platform)}
                            variant={currentPlatforms.includes(platform) ? "default" : "outline"}
                            size="sm"
                            className="gap-1"
                        >
                            {platformIcons[platform]}
                            {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>
        )
    }

    if (posts.length === 0) {
        return (
            <Card>
                <CardContent className="py-12">
                    <div className="text-center">
                        <p className="text-muted-foreground">No posts found with the current filters.</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="rounded-md border">
            {/* Mobile: Full width scrollable container */}
            <div className="block sm:hidden w-full overflow-x-auto">
                <div className="min-w-[600px]"> {/* Minimum width for mobile scroll */}
                    <Table className="w-full table-fixed">
                        {/* Same table content but with smaller widths for mobile */}
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Post</TableHead> {/* Smaller on mobile */}
                                <TableHead className="w-[80px]">Status</TableHead>
                                <TableHead className="w-[90px]">Date</TableHead>
                                <TableHead className="w-[160px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {posts.map((post) => (
                                <TableRow key={post.id}>
                                    <TableCell className="w-[180px] overflow-hidden p-2">
                                        {/* Mobile-optimized post content */}
                                        <div className="flex items-start gap-2">
                                            <div className="shrink-0">
                                                {post.image_url ? (
                                                    <div className="relative">
                                                        <Image
                                                            src={post.image_url}
                                                            alt={post.title}
                                                            width={32}
                                                            height={32}
                                                            className="rounded-lg object-cover border w-8 h-8"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                                                        <ImageIcon className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <h4 className="font-medium text-foreground truncate text-xs">
                                                    {post.title}
                                                </h4>
                                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                                    {post.content}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell className="w-[80px] overflow-hidden p-2">
                                        <Badge variant={getStatusVariant(post.status)} className="truncate text-xs px-1.5 py-0">
                                            {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="w-[90px] overflow-hidden p-2">
                                        <div className="text-xs text-muted-foreground truncate">
                                            {formatDate(post.pub_date)}
                                        </div>
                                    </TableCell>

                                    <TableCell className="w-[160px] overflow-hidden p-2">
                                        {/* Mobile-optimized actions */}
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1">
                                                {post?.link && (
                                                    <Button
                                                        onClick={() => window.open(post?.link as string, '_blank')}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                    </Button>
                                                )}

                                                {post.status === 'pending' && (
                                                    <Button
                                                        onClick={() => handleWebhookAction(post.id, 'generate_image')}
                                                        disabled={loadingId === post.id}
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 flex-1 text-xs"
                                                    >
                                                        {loadingId === post.id ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <ImageIcon className="w-3 h-3" />
                                                        )}
                                                        <span className="ml-1">Gen</span>
                                                    </Button>
                                                )}
                                            </div>

                                            {post.status === 'approved' && post.image_url && (
                                                <div className="space-y-1.5">
                                                    <div className="flex gap-1">
                                                        <Button
                                                            onClick={() => togglePlatform(post.id, 'instagram')}
                                                            variant={selectedPlatforms[post.id]?.includes('instagram') ? "default" : "outline"}
                                                            size="sm"
                                                            className="h-6 flex-1 text-xs px-1"
                                                        >
                                                            <Instagram className="w-2.5 h-2.5" />
                                                        </Button>
                                                        <Button
                                                            onClick={() => togglePlatform(post.id, 'facebook')}
                                                            variant={selectedPlatforms[post.id]?.includes('facebook') ? "default" : "outline"}
                                                            size="sm"
                                                            className="h-6 flex-1 text-xs px-1"
                                                        >
                                                            <Facebook className="w-2.5 h-2.5" />
                                                        </Button>
                                                    </div>

                                                    <Button
                                                        onClick={() => handleWebhookAction(
                                                            post.id,
                                                            'publish',
                                                            selectedPlatforms[post.id] || []
                                                        )}
                                                        disabled={loadingId === post.id || !selectedPlatforms[post.id]?.length}
                                                        variant="default"
                                                        size="sm"
                                                        className="h-6 w-full text-xs"
                                                    >
                                                        {loadingId === post.id ? (
                                                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                        ) : (
                                                            <Send className="w-2.5 h-2.5" />
                                                        )}
                                                        <span className="ml-1">Post</span>
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Desktop/Tablet: Normal responsive table */}
            <div className="hidden sm:block w-full overflow-x-auto">
                <Table className="w-full table-fixed">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-2/5 md:w-1/2">Post</TableHead>
                            <TableHead className="w-1/6">Status</TableHead>
                            <TableHead className="w-1/6">Publish Date</TableHead>
                            <TableHead className="w-1/4">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {posts.map((post) => (
                            <TableRow key={post.id} className="hover:bg-muted/50">
                                <TableCell className="w-2/5 md:w-1/2 overflow-hidden">
                                    {/* Desktop post content */}
                                    <div className="flex items-start gap-3">
                                        <div className="shrink-0">
                                            {post.image_url ? (
                                                <div className="relative">
                                                    <Image
                                                        src={post.image_url}
                                                        alt={post.title}
                                                        width={48}
                                                        height={48}
                                                        className="rounded-lg object-cover border w-12 h-12"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                                    <ImageIcon className="w-5 h-5" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 overflow-hidden">
                                            <h4 className="font-medium text-foreground truncate">
                                                {post.title}
                                            </h4>
                                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                {post.content}
                                            </p>
                                            {post.hashtags && post.hashtags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {post.hashtags.slice(0, 3).map((tag, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs truncate max-w-[100px]">
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

                                <TableCell className="w-1/6 overflow-hidden">
                                    <Badge variant={getStatusVariant(post.status)} className="truncate">
                                        {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                                    </Badge>
                                </TableCell>

                                <TableCell className="w-1/6 overflow-hidden">
                                    <div className="text-sm text-muted-foreground truncate">
                                        {formatDate(post.pub_date)}
                                    </div>
                                </TableCell>

                                <TableCell className="w-1/4 overflow-hidden">
                                    {/* Desktop actions */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            {post?.link && (
                                                <Button
                                                    onClick={() => window.open(post?.link as string, '_blank')}
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    title="View original"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            )}

                                            {post.status === 'pending' && (
                                                <Button
                                                    onClick={() => handleWebhookAction(post.id, 'generate_image')}
                                                    disabled={loadingId === post.id}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 flex-1"
                                                >
                                                    {loadingId === post.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                    ) : (
                                                        <ImageIcon className="w-4 h-4 mr-2" />
                                                    )}
                                                    Generate Image
                                                </Button>
                                            )}
                                        </div>

                                        {post.status === 'approved' && post.image_url && (
                                            <div className="space-y-3">
                                                <div className="flex flex-col gap-2">
                                                    <p className="text-sm font-medium text-foreground">Publish to:</p>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            onClick={() => togglePlatform(post.id, 'instagram')}
                                                            variant={selectedPlatforms[post.id]?.includes('instagram') ? "default" : "outline"}
                                                            size="sm"
                                                            className="flex-1"
                                                        >
                                                            <Instagram className="w-4 h-4 mr-2" />
                                                            Instagram
                                                        </Button>
                                                        <Button
                                                            onClick={() => togglePlatform(post.id, 'facebook')}
                                                            variant={selectedPlatforms[post.id]?.includes('facebook') ? "default" : "outline"}
                                                            size="sm"
                                                            className="flex-1"
                                                        >
                                                            <Facebook className="w-4 h-4 mr-2" />
                                                            Facebook
                                                        </Button>
                                                    </div>
                                                </div>

                                                <Button
                                                    onClick={() => handleWebhookAction(
                                                        post.id,
                                                        'publish',
                                                        selectedPlatforms[post.id] || []
                                                    )}
                                                    disabled={loadingId === post.id || !selectedPlatforms[post.id]?.length}
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full"
                                                >
                                                    {loadingId === post.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                    ) : (
                                                        <Send className="w-4 h-4 mr-2" />
                                                    )}
                                                    Publish Now
                                                </Button>
                                            </div>
                                        )}

                                        {post.status === 'approved' && post.image_url && (
                                            <div className="flex items-center gap-1 text-xs text-green-600">
                                                <Check className="w-3 h-3" />
                                                Image ready for publishing
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}