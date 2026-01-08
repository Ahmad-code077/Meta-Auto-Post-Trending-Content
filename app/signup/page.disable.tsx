'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    console.log('hellow owlwrd')

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        setMessage('')

        // Validate passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match')
            setLoading(false)
            return
        }

        // Validate password strength
        if (password.length < 6) {
            setError('Password must be at least 6 characters')
            setLoading(false)
            return
        }

        const supabase = createClient()

        const { error, data } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/confirm`
            }
        })

        if (error) {
            setError(error.message)
        } else if (data.user) {
            setMessage('Check your email for confirmation link!')
            // Clear form
            setEmail('')
            setPassword('')
            setConfirmPassword('')
        }
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="max-w-md w-full space-y-8 p-8 bg-card rounded-lg shadow-lg border border-border">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-foreground">Create Account</h2>
                    <p className="mt-2 text-muted-foreground">
                        Already have an account?{' '}
                        <Link
                            href="/login"
                            className="text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                            Login
                        </Link>
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSignup}>
                    {error && (
                        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm border border-destructive/20">
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="bg-primary/10 text-primary-foreground p-3 rounded-md text-sm border border-primary/20">
                            {message}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Email
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Password
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                placeholder="At least 6 characters"
                            />
                            <p className="text-xs text-muted-foreground">
                                Must be at least 6 characters long
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-primary-foreground py-2.5 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent"></div>
                                Creating account...
                            </span>
                        ) : (
                            'Sign Up'
                        )}
                    </button>



                    <p className="text-xs text-muted-foreground text-center mt-4">
                        By signing up, you agree to our{' '}
                        <Link href="/terms" className="text-primary hover:underline">Terms</Link>{' '}
                        and{' '}
                        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                    </p>
                </form>
            </div>
        </div>
    )
}