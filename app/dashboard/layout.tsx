import { ReactNode } from 'react'
import DashboardHeader from './components/dashboard-header'
import DashboardSidebar from './components/dashboard-sidebar'
import { SidebarProvider } from './components/sidebar-provider'

export default function DashboardLayout({
    children,
}: {
    children: ReactNode
}) {
    return (
        <SidebarProvider>
            <div className="min-h-screen bg-background">
                <DashboardHeader />

                <div className="flex">
                    <DashboardSidebar />

                    <main className="flex-1 w-full min-w-0 p-4 sm:p-6">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    )
}