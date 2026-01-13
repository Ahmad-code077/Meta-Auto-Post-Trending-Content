'use client'
import { ThemeToggler } from '@/components/theme/ThemeToggler'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useSidebar } from './sidebar-provider'

export default function DashboardHeader() {
    const { user } = useAuth()
    const router = useRouter()
    const supabase = createClient()
    const { toggleSidebar } = useSidebar()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    const handleMenuClick = () => {
        console.log('🍔 Hamburger menu clicked!')
        toggleSidebar()
    }

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/60">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <button
                        onClick={handleMenuClick}
                        className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors touch-manipulation"
                        aria-label="Toggle menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
                        Content Moderation Dashboard
                    </h1>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-sm font-medium text-primary">
                                {user?.email?.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="hidden md:block min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[150px]">{user?.email}</p>
                            <p className="text-xs text-muted-foreground">Admin</p>
                        </div>
                    </div>

                    <ThemeToggler />

                    <button
                        onClick={handleLogout}
                        className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors touch-manipulation whitespace-nowrap"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </header>
    )
}