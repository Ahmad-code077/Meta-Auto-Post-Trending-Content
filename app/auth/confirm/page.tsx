'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ConfirmPage() {
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
    }, [])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-8 bg-white rounded-lg shadow text-center">
                {status === 'verifying' && (
                    <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <h2 className="text-xl font-bold mt-4">Verifying your email...</h2>
                        <p className="text-gray-600 mt-2">Please wait a moment</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="text-green-500 text-5xl mb-4">✓</div>
                        <h2 className="text-2xl font-bold">Email Confirmed!</h2>
                        <p className="text-gray-600 mt-2">
                            Your email has been verified successfully.
                        </p>
                        <p className="text-gray-500 text-sm mt-4">
                            Redirecting to dashboard...
                        </p>
                        <Link
                            href="/dashboard"
                            className="inline-block mt-4 text-blue-600 hover:underline"
                        >
                            Go to Dashboard now
                        </Link>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="text-red-500 text-5xl mb-4">✗</div>
                        <h2 className="text-2xl font-bold">Verification Failed</h2>
                        <p className="text-gray-600 mt-2">
                            The verification link is invalid or has expired.
                        </p>
                        <Link
                            href="/login"
                            className="inline-block mt-4 text-blue-600 hover:underline"
                        >
                            Return to Login
                        </Link>
                    </>
                )}

                {status === 'invalid' && (
                    <>
                        <div className="text-yellow-500 text-5xl mb-4">!</div>
                        <h2 className="text-2xl font-bold">Invalid Link</h2>
                        <p className="text-gray-600 mt-2">
                            This confirmation link appears to be malformed.
                        </p>
                        <Link
                            href="/login"
                            className="inline-block mt-4 text-blue-600 hover:underline"
                        >
                            Return to Login
                        </Link>
                    </>
                )}
            </div>
        </div>
    )
}