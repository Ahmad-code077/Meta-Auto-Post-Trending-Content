'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import { updateJobDetails } from '@/app/actions/applications'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { canEditRecruiterEmail } from '@/lib/jobs/editable'
import type { JobStatus } from '@/lib/types/jobs'

export interface EditableJobDetails {
    title: string | null
    company: string | null
    recruiterName: string | null
    recruiterEmail: string | null
    location: string | null
    workType: string | null
    timings: string | null
}

const FIELDS: { name: string; label: string; type?: string }[] = [
    { name: 'title', label: 'Role' },
    { name: 'company', label: 'Company' },
    { name: 'recruiter_name', label: 'Recruiter name' },
    { name: 'recruiter_email', label: 'Recruiter email', type: 'email' },
    { name: 'location', label: 'Location' },
    { name: 'work_type', label: 'Work type' },
    { name: 'timings', label: 'Timings' },
]

// Manual correction for whatever analysis missed or got wrong. The recruiter email becomes
// read-only once the job has been sent -- the address actually used is kept on the sent email
// itself, so this stops being the live send-to field and turns into a historical record instead.
export function EditJobDetails({ jobId, status, details }: { jobId: string; status: JobStatus; details: EditableJobDetails }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [isSaving, startSaving] = useTransition()

    const emailLocked = !canEditRecruiterEmail(status)

    const defaults: Record<string, string> = {
        title: details.title ?? '',
        company: details.company ?? '',
        recruiter_name: details.recruiterName ?? '',
        recruiter_email: details.recruiterEmail ?? '',
        location: details.location ?? '',
        work_type: details.workType ?? '',
        timings: details.timings ?? '',
    }

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const input = Object.fromEntries(FIELDS.map((f) => [f.name, String(form.get(f.name) ?? '')]))

        startSaving(async () => {
            const result = await updateJobDetails(jobId, input)
            if (result.success) {
                setOpen(false)
                toast({ title: 'Details saved' })
                router.refresh()
            } else {
                toast({ title: 'Could not save details', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <>
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Edit job details" title="Edit">
                <Pencil />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit job details</DialogTitle>
                        <DialogDescription>
                            Correct anything analysis missed or got wrong. This updates the job directly -- the dashboard, the list and the timeline all pick it up.
                        </DialogDescription>
                    </DialogHeader>
                    <form id="edit-job-details" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
                        {FIELDS.map((field) => {
                            const locked = field.name === 'recruiter_email' && emailLocked
                            return (
                                <div key={field.name} className="space-y-1.5">
                                    <Label htmlFor={field.name}>{field.label}</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        type={field.type ?? 'text'}
                                        defaultValue={defaults[field.name]}
                                        disabled={locked || isSaving}
                                        maxLength={254}
                                    />
                                    {locked && (
                                        <p className="text-xs text-muted-foreground">
                                            Locked once sent -- the sent email keeps its own record of the address used.
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </form>
                    <DialogFooter className="gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="submit" form="edit-job-details" disabled={isSaving}>
                            {isSaving && <Loader2 className="animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
