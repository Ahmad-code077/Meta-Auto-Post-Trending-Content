'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_SECTIONS } from '@/lib/nav'
import { useSidebar } from './sidebar-provider'

export default function DashboardSidebar() {
    const { isOpen, closeSidebar } = useSidebar()
    const pathname = usePathname()

    // Navigating closes the mobile drawer.
    useEffect(() => {
        closeSidebar()
    }, [pathname, closeSidebar])

    useEffect(() => {
        if (!isOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeSidebar()
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, closeSidebar])

    const nav = (
        <nav className="flex-1 space-y-6 px-3">
            {NAV_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-1">
                    <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {section.title}
                    </p>
                    {section.items.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                            </Link>
                        )
                    })}
                </div>
            ))}
        </nav>
    )

    return (
        <>
            <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:flex">
                <div className="flex w-full flex-col py-6">{nav}</div>
            </aside>

            {isOpen && (
                <div
                    className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-[70] w-72 border-r border-border bg-card transition-transform duration-200 ease-out lg:hidden',
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                )}
                inert={!isOpen}
            >
                <div className="flex h-full flex-col py-6">
                    <div className="mb-4 flex items-center justify-between px-6">
                        <span className="text-base font-semibold text-foreground">Menu</span>
                        <button
                            type="button"
                            onClick={closeSidebar}
                            className="rounded-md p-2 hover:bg-accent"
                            aria-label="Close menu"
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {nav}
                </div>
            </aside>
        </>
    )
}
