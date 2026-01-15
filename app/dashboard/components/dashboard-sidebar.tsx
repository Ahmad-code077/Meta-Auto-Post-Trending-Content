'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    Home,
    FileText,
    Briefcase,
} from 'lucide-react'
import { useSidebar } from './sidebar-provider'

export default function DashboardSidebar() {
    const { isOpen, closeSidebar } = useSidebar()
    const pathname = usePathname()


    // Close sidebar on route change (mobile) - but not on initial mount
    useEffect(() => {
        // Only close if sidebar is open when route changes
        if (isOpen) {
            closeSidebar()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname])

    // Close sidebar on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                closeSidebar()
            }
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, closeSidebar])

    const navigation = [
        { name: 'Dashboard', href: '/dashboard', icon: Home },
        { name: 'Posts', href: '/dashboard/posts', icon: FileText },
        { name: 'Job Posts', href: '/dashboard/job-posts', icon: Briefcase },
    ]

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex lg:shrink-0 lg:w-64 border-r border-border bg-card">
                <div className="flex flex-col w-full py-6">
                    <nav className="flex-1 px-3 space-y-1">
                        {navigation.map((item) => {
                            const Icon = item.icon
                            const isActive = pathname === item.href

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${isActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                        }`}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                    <span>{item.name}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </aside>

            {/* Mobile Sidebar Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-[60] lg:hidden transition-opacity"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-[70] w-72 bg-card border-r border-border lg:hidden transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Mobile Sidebar Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                        <h2 className="text-lg font-semibold">Menu</h2>
                        <button
                            onClick={closeSidebar}
                            className="p-2 rounded-lg hover:bg-accent transition-colors touch-manipulation"
                            aria-label="Close menu"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Mobile Navigation */}
                    <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                        {navigation.map((item) => {
                            const Icon = item.icon
                            const isActive = pathname === item.href

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={closeSidebar}
                                    className={`flex items-center gap-3 px-4 py-3.5 text-base font-medium rounded-lg transition-all duration-200 touch-manipulation ${isActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-foreground hover:bg-accent hover:text-accent-foreground active:scale-95'
                                        }`}
                                >
                                    <Icon className="w-6 h-6 shrink-0" />
                                    <span>{item.name}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </aside>
        </>
    )
}