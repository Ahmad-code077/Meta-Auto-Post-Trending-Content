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
            <div className="overflow-x-auto">
                <Table className="w-full table-fixed">
                    <TableHeader>
                        <TableRow>
                            {/* Using percentage-based widths */}
                            <TableHead className="w-2/5 sm:w-1/2">Post</TableHead>
                            <TableHead className="w-1/6">Status</TableHead>
                            <TableHead className="w-1/6">Publish Date</TableHead>
                            <TableHead className="w-1/4">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {posts.map((post) => (
                            <TableRow key={post.id} className="hover:bg-muted/50">
                                <TableCell className="w-2/5 sm:w-1/2 overflow-hidden">
                                    <div className="flex items-start gap-2 sm:gap-3">
                                        {/* Image */}
                                        <div className="shrink-0">
                                            {post.image_url ? (
                                                <div className="relative">
                                                    <Image
                                                        src={post.image_url}
                                                        alt={post.title}
                                                        width={40}
                                                        height={40}
                                                        className="rounded-lg object-cover border w-10 h-10"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                                    <ImageIcon className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Content - MUST have overflow-hidden */}
                                        <div className="flex-1 min-w-0 overflow-hidden">
                                            <h4 className="font-medium text-foreground truncate text-sm sm:text-base">
                                                {post.title}
                                            </h4>
                                            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-1">
                                                {post.content}
                                            </p>
                                            {post.hashtags && post.hashtags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2 overflow-hidden">
                                                    {post.hashtags.slice(0, 2).map((tag, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs truncate">
                                                            #{tag}
                                                        </Badge>
                                                    ))}
                                                    {post.hashtags.length > 2 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            +{post.hashtags.length - 2}
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>

                                <TableCell className="w-1/6 overflow-hidden">
                                    <Badge variant={getStatusVariant(post.status)} className="truncate w-full">
                                        {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                                    </Badge>
                                </TableCell>

                                <TableCell className="w-1/6 overflow-hidden">
                                    <div className="text-sm text-muted-foreground truncate">
                                        {formatDate(post.pub_date)}
                                    </div>
                                </TableCell>

                                <TableCell className="w-1/4 overflow-hidden">
                                    <div className="space-y-2">
                                        {/* Action buttons row */}
                                        <div className="flex items-center gap-1">
                                            <Button
                                                onClick={() => window.open(post.link || '#', '_blank')}
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </Button>

                                            {post.status === 'pending' && (
                                                <Button
                                                    onClick={() => handleWebhookAction(post.id, 'generate_image')}
                                                    disabled={loadingId === post.id}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 flex-1 min-w-0"
                                                >
                                                    {loadingId === post.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                                    ) : (
                                                        <ImageIcon className="w-3.5 h-3.5 mr-1" />
                                                    )}
                                                    <span className="truncate">Generate</span>
                                                </Button>
                                            )}

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                                        <MoreHorizontal className="w-3.5 h-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem>
                                                        <ExternalLink className="w-4 h-4 mr-2" />
                                                        View Details
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        {/* Platform selector (for approved posts) */}
                                        {post.status === 'approved' && (
                                            <div className="space-y-2">
                                                <div className="flex gap-1">
                                                    <Button
                                                        onClick={() => togglePlatform(post.id, 'instagram')}
                                                        variant={selectedPlatforms[post.id]?.includes('instagram') ? "default" : "outline"}
                                                        size="sm"
                                                        className="h-7 flex-1 text-xs"
                                                    >
                                                        <Instagram className="w-3 h-3 mr-1" />
                                                        <span className="truncate">Insta</span>
                                                    </Button>
                                                    <Button
                                                        onClick={() => togglePlatform(post.id, 'facebook')}
                                                        variant={selectedPlatforms[post.id]?.includes('facebook') ? "default" : "outline"}
                                                        size="sm"
                                                        className="h-7 flex-1 text-xs"
                                                    >
                                                        <Facebook className="w-3 h-3 mr-1" />
                                                        <span className="truncate">FB</span>
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
                                                    className="h-7 w-full text-xs"
                                                >
                                                    {loadingId === post.id ? (
                                                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                    ) : (
                                                        <Send className="w-3 h-3 mr-1" />
                                                    )}
                                                    <span className="truncate">Publish</span>
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
    )
}