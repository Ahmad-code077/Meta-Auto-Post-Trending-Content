'use client'
import { useEffect } from 'react' // ← ADD THIS!
import { useAuth } from '@/components/auth-provider'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DashboardPage() {
    const { user, loading } = useAuth()
    const router = useRouter()
    const supabase = createClient()

    // Redirect if not logged in
    useEffect(() => {
        if (!loading && !user) {
            router.push('/login')
        }
    }, [user, loading, router]) // ← Added router to dependencies

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (!user) {
        return null // Will redirect in useEffect
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold">Welcome {user.email}</h1>
            <button
                onClick={handleLogout}
                className="mt-4 px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
            >
                Logout
            </button>
        </div>
    )
}