'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    Home,
    FileText,
    BarChart3,
    Settings,
    Users,
    X
} from 'lucide-react'

export default function DashboardSidebar() {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const pathname = usePathname()

    const navigation = [
        { name: 'Dashboard', href: '/dashboard', icon: Home },
        { name: 'Posts', href: '/dashboard/posts', icon: FileText },
        { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
        { name: 'Users', href: '/dashboard/users', icon: Users },
        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ]

    return (
        <>
            {/* Sidebar for desktop */}
            <aside className="hidden lg:block w-64 border-r border-border bg-card">
                <div className="flex flex-col h-full py-6">
                    <nav className="flex-1 px-4 space-y-1">
                        {navigation.map((item) => {
                            const Icon = item.icon
                            const isActive = pathname === item.href

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center px-4 py-2.5 text-sm rounded-lg transition-colors ${isActive
                                            ? 'bg-primary text-primary-foreground'
                                            : 'hover:bg-accent hover:text-accent-foreground'
                                        }`}
                                >
                                    <Icon className="w-5 h-5 mr-3" />
                                    {item.name}
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </aside>

            {/* Mobile sidebar */}
            {sidebarOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border lg:hidden">
                        <div className="flex flex-col h-full py-6">
                            <div className="px-6 pb-4 border-b border-border">
                                <button
                                    onClick={() => setSidebarOpen(false)}
                                    className="p-2 rounded-md hover:bg-accent"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <nav className="flex-1 px-4 py-6 space-y-1">
                                {navigation.map((item) => {
                                    const Icon = item.icon
                                    const isActive = pathname === item.href

                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={`flex items-center px-4 py-2.5 text-sm rounded-lg transition-colors ${isActive
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'hover:bg-accent hover:text-accent-foreground'
                                                }`}
                                            onClick={() => setSidebarOpen(false)}
                                        >
                                            <Icon className="w-5 h-5 mr-3" />
                                            {item.name}
                                        </Link>
                                    )
                                })}
                            </nav>
                        </div>
                    </aside>
                </>
            )}
        </>
    )
}