'use client'

import { useTransition, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { saveProfileDetails, type ProfileDetailsInput } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { ProfileDetails } from '@/lib/types/profile'

const FIELDS = [
    'full_name', 'contact_email', 'phone', 'location', 'headline', 'summary',
    'linkedin_url', 'github_url', 'portfolio_url',
] as const

export function DetailsForm({ details, signInEmail }: { details: ProfileDetails; signInEmail: string | null }) {
    const { toast } = useToast()
    const [isSaving, startSaving] = useTransition()

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const input = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? '')])) as ProfileDetailsInput

        startSaving(async () => {
            const result = await saveProfileDetails(input)
            if (result.success) {
                toast({ title: 'Profile saved' })
            } else {
                toast({ title: 'Could not save profile', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="full_name" label="Full name" defaultValue={details.full_name} autoComplete="name" required />
                <Field
                    id="contact_email"
                    label="Contact email"
                    type="email"
                    defaultValue={details.contact_email}
                    autoComplete="email"
                    hint={signInEmail ? `Used on your applications. Your sign-in email is ${signInEmail}.` : 'Used on your applications.'}
                />
                <Field id="phone" label="Phone" type="tel" defaultValue={details.phone} autoComplete="tel" />
                <Field id="location" label="Location" defaultValue={details.location} placeholder="City, Country" autoComplete="address-level2" />
                <Field id="headline" label="Headline" defaultValue={details.headline} placeholder="Backend engineer, data platforms" className="sm:col-span-2" />
                <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="summary">Summary</Label>
                    <Textarea id="summary" name="summary" rows={4} maxLength={1200} defaultValue={details.summary ?? ''} placeholder="Two or three sentences about what you do and what you want next." />
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Links</p>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field id="linkedin_url" label="LinkedIn" type="url" defaultValue={details.linkedin_url} placeholder="https://linkedin.com/in/you" />
                    <Field id="github_url" label="GitHub" type="url" defaultValue={details.github_url} placeholder="https://github.com/you" />
                    <Field id="portfolio_url" label="Portfolio" type="url" defaultValue={details.portfolio_url} placeholder="https://you.dev" />
                </div>
                <p className="text-xs text-muted-foreground">Links are included in the signature of first applications only.</p>
            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="animate-spin" />}
                    {isSaving ? 'Saving' : 'Save details'}
                </Button>
            </div>
        </form>
    )
}

interface FieldProps {
    id: string
    label: string
    defaultValue: string | null
    hint?: string
    className?: string
    type?: string
    placeholder?: string
    autoComplete?: string
    required?: boolean
}

function Field({ id, label, defaultValue, hint, className, ...input }: FieldProps) {
    return (
        <div className={`space-y-2 ${className ?? ''}`}>
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} name={id} defaultValue={defaultValue ?? ''} {...input} />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}
