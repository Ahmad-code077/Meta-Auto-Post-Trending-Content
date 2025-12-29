'use client'
import { ThemeToggler } from '@/components/theme/ThemeToggler'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useState } from 'react'

export default function DashboardHeader() {
    const { user } = useAuth()
    const router = useRouter()
    const supabase = createClient()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <div className="flex h-16 items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="lg:hidden p-2"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-semibold text-foreground">
                        Content Moderation Dashboard
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                                {user?.email?.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">{user?.email}</p>
                            <p className="text-xs text-muted-foreground">Admin</p>
                        </div>
                    </div>

                    <ThemeToggler />

                    <button
                        onClick={handleLogout}
                        className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </header>
    )
}