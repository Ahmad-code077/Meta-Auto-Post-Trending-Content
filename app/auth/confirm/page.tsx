'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// Separate component that uses useSearchParams
function ConfirmContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState('verifying')

    useEffect(() => {
        const confirmEmail = async () => {
            const token_hash = searchParams.get('token_hash')
            const type = searchParams.get('type')

            if (!token_hash || type !== 'email') {
                setStatus('invalid')
                return
            }

            const supabase = createClient()
            const { error } = await supabase.auth.verifyOtp({
                token_hash,
                type: 'email'
            })

            if (error) {
                setStatus('error')
            } else {
                setStatus('success')
                // Redirect to dashboard after 3 seconds
                setTimeout(() => router.push('/dashboard'), 3000)
            }
        }

        confirmEmail()
    }, [searchParams, router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="max-w-md w-full p-8 bg-card rounded-lg shadow-lg border border-border text-center">
                {status === 'verifying' && (
                    <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                        <h2 className="text-xl font-bold mt-4 text-foreground">Verifying your email...</h2>
                        <p className="text-muted-foreground mt-2">Please wait a moment</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Email Confirmed!</h2>
                        <p className="text-muted-foreground mt-2">
                            Your email has been verified successfully.
                        </p>
                        <div className="mt-6 p-3 bg-primary/5 rounded-md">
                            <div className="animate-pulse flex items-center justify-center space-x-2">
                                <div className="h-2 w-2 bg-primary rounded-full"></div>
                                <div className="h-2 w-2 bg-primary rounded-full"></div>
                                <div className="h-2 w-2 bg-primary rounded-full"></div>
                                <span className="text-sm text-muted-foreground ml-2">Redirecting to dashboard...</span>
                            </div>
                        </div>
                        <Link
                            href="/dashboard"
                            className="inline-block mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium transition-colors"
                        >
                            Go to Dashboard now
                        </Link>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Verification Failed</h2>
                        <p className="text-muted-foreground mt-2">
                            The verification link is invalid or has expired.
                        </p>
                        <Link
                            href="/login"
                            className="inline-block mt-6 px-6 py-2.5 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 font-medium transition-colors"
                        >
                            Return to Login
                        </Link>
                    </>
                )}

                {status === 'invalid' && (
                    <>
                        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Invalid Link</h2>
                        <p className="text-muted-foreground mt-2">
                            This confirmation link appears to be malformed.
                        </p>
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <p className="text-sm text-yellow-800">
                                Make sure you clicked the exact link from the email.
                            </p>
                        </div>
                        <Link
                            href="/login"
                            className="inline-block mt-6 px-6 py-2.5 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 font-medium transition-colors"
                        >
                            Return to Login
                        </Link>
                    </>
                )}
            </div>
        </div>
    )
}

// Main component with Suspense
export default function ConfirmPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="max-w-md w-full p-8 bg-card rounded-lg shadow-lg border border-border text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <h2 className="text-xl font-bold mt-4 text-foreground">Loading confirmation...</h2>
                    <p className="text-muted-foreground mt-2">Preparing your email verification</p>
                </div>
            </div>
        }>
            <ConfirmContent />
        </Suspense>
    )
}