'use client'

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react'

interface SidebarContextType {
    isOpen: boolean
    openSidebar: () => void
    closeSidebar: () => void
    toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

// Controls the mobile navigation drawer only. The desktop sidebar is always visible.
export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)

    const openSidebar = useCallback(() => setIsOpen(true), [])
    const closeSidebar = useCallback(() => setIsOpen(false), [])
    const toggleSidebar = useCallback(() => setIsOpen((open) => !open), [])

    const value = useMemo(
        () => ({ isOpen, openSidebar, closeSidebar, toggleSidebar }),
        [isOpen, openSidebar, closeSidebar, toggleSidebar]
    )

    return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
    const context = useContext(SidebarContext)
    if (context === undefined) {
        throw new Error('useSidebar must be used within a SidebarProvider')
    }
    return context
}
