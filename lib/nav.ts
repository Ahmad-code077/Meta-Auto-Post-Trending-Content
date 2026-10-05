import { Briefcase, FileText, Plus, type LucideIcon } from 'lucide-react'

// Single source of truth for the dashboard navigation.
// The sidebar and the header title both read from here.
// Meta and email products live in separate sections and never share a page.

export interface NavItem {
    label: string
    href: string
    icon: LucideIcon
}

export interface NavSection {
    title: string
    items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
    {
        title: 'Meta Automation',
        items: [
            { label: 'Posts', href: '/dashboard', icon: FileText },
        ],
    },
    {
        title: 'Job Applications',
        items: [
            { label: 'Applications', href: '/dashboard/job-posts', icon: Briefcase },
            { label: 'New application', href: '/dashboard/job-posts/new', icon: Plus },
        ],
    },
]

export function findNavItem(pathname: string): { section: NavSection; item: NavItem } | undefined {
    for (const section of NAV_SECTIONS) {
        const item = section.items.find((candidate) => candidate.href === pathname)
        if (item) return { section, item }
    }
    return undefined
}
