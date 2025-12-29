'use client'
import { Post, PostStatus, Platform } from '@/lib/types/posts'
import { JSX, useState } from 'react'
import { sendToWebhook } from '@/app/actions/webhooks'
import {
    Loader2,
    Check,
    X,
    Eye,
    Image as ImageIcon,
    Send,
    Instagram,
    Facebook,
    Twitter,
    Linkedin
} from 'lucide-react'

interface PostsTableProps {
    initialPosts: Post[]
}

const platformIcons: Record<Platform, JSX.Element> = {
    instagram: <Instagram className="w-4 h-4" />,
    facebook: <Facebook className="w-4 h-4" />,

}

const platformColors: Record<Platform, string> = {
    instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
    facebook: 'bg-blue-600',
}

export default function PostsTable({ initialPosts }: PostsTableProps) {
    const [posts, setPosts] = useState<Post[]>(initialPosts)
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, Platform[]>>({})

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

            // Only remove from UI if it's generate_image (pending → approved will be updated by n8n)
            if (action === 'generate_image') {
                setPosts(posts.filter(post => post.id !== postId))
            }
        } catch (error) {
            console.error(`Error sending ${action} webhook:`, error)
        } finally {
            setLoadingId(null)
        }
    }

    const getStatusColor = (status: PostStatus) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800'
            case 'approved': return 'bg-blue-100 text-blue-800'
            case 'rejected': return 'bg-red-100 text-red-800'
            case 'published': return 'bg-green-100 text-green-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'N/A'
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
                <p className="text-sm font-medium text-foreground mb-1">Select Platforms:</p>
                <div className="flex flex-wrap gap-2">
                    {platforms.map(platform => (
                        <button
                            key={platform}
                            onClick={() => togglePlatform(postId, platform)}
                            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${currentPlatforms.includes(platform)
                                ? `${platformColors[platform]} text-white`
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            {platformIcons[platform]}
                            {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Post
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                    {posts.map((post) => (
                        <tr key={post.id} className="hover:bg-accent/50 transition-colors">
                            <td className="px-6 py-4">
                                <div className="flex items-start gap-3">
                                    {post.image_url && (
                                        <div className="relative">
                                            <img
                                                src={post.image_url}
                                                alt={post.title}
                                                className="w-12 h-12 rounded object-cover"
                                            />
                                            {post.status === 'approved' && (
                                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card"></div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <h4 className="font-medium text-foreground line-clamp-1">
                                            {post.title}
                                        </h4>
                                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                            {post.content}
                                        </p>
                                        {post.hashtags && post.hashtags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {post.hashtags.slice(0, 3).map((tag, index) => (
                                                    <span
                                                        key={index}
                                                        className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-full"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {post.hashtags.length > 3 && (
                                                    <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">
                                                        +{post.hashtags.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(post.status)}`}>
                                    {post.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">
                                {formatDate(post.pub_date)}
                            </td>
                            <td className="px-6 py-4">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => window.open(post.link || '#', '_blank')}
                                            disabled={!post.link}
                                            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                                            title="View original"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>

                                        {post.status === 'pending' && (
                                            <button
                                                onClick={() => handleWebhookAction(post.id, 'generate_image')}
                                                disabled={loadingId === post.id}
                                                className="p-2 text-blue-600 hover:text-blue-700 disabled:opacity-50"
                                                title="Generate Image"
                                            >
                                                {loadingId === post.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <ImageIcon className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}

                                        {post.status === 'approved' && (
                                            <>
                                                {renderPlatformSelector(post.id)}
                                                <button
                                                    onClick={() => handleWebhookAction(
                                                        post.id,
                                                        'publish',
                                                        selectedPlatforms[post.id] || []
                                                    )}
                                                    disabled={loadingId === post.id || !selectedPlatforms[post.id]?.length}
                                                    className="p-2 text-green-600 hover:text-green-700 disabled:opacity-50"
                                                    title="Publish to selected platforms"
                                                >
                                                    {loadingId === post.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Send className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {post.status === 'approved' && post.image_url && (
                                        <div className="text-xs text-green-600 flex items-center gap-1">
                                            <Check className="w-3 h-3" />
                                            Image generated ✓
                                        </div>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {posts.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">No posts found</p>
                </div>
            )}
        </div>
    )
}