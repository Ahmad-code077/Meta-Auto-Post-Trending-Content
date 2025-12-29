import { ReactNode } from 'react'
import DashboardHeader from './components/dashboard-header'
import DashboardSidebar from './components/dashboard-sidebar'

export default function DashboardLayout({
    children,
}: {
    children: ReactNode
}) {
    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader />

            <div className="flex">
                <DashboardSidebar />

                <main className="flex-1 p-6">
                    {children}
                </main>
            </div>
        </div>
    )
}