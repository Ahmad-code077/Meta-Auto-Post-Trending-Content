'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { ThemeToggler } from '@/components/theme/ThemeToggler'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { findNavItem } from '@/lib/nav'
import { useSidebar } from './sidebar-provider'

export default function DashboardHeader() {
    const { user } = useAuth()
    const router = useRouter()
    const pathname = usePathname()
    const { toggleSidebar } = useSidebar()
    const current = findNavItem(pathname)

    const handleLogout = async () => {
        await createClient().auth.signOut()
        router.replace('/login')
        router.refresh()
    }

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="lg:hidden"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0">
                        {current && (
                            <p className="truncate text-xs text-muted-foreground">{current.section.title}</p>
                        )}
                        <h1 className="truncate text-base font-semibold text-foreground">
                            {current?.item.label ?? 'Dashboard'}
                        </h1>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {user?.email && (
                        <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground md:block">
                            {user.email}
                        </span>
                    )}
                    <ThemeToggler />
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        Sign out
                    </Button>
                </div>
            </div>
        </header>
    )
}
