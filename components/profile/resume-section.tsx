'use client'

import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, FileText, Loader2, Upload } from 'lucide-react'
import { getCurrentResumeUrl, uploadResume } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import type { ResumeSummary } from '@/lib/types/profile'

const MAX_BYTES = 5 * 1024 * 1024

export function ResumeSection({ resume, versions }: { resume: ResumeSummary | null; versions: number }) {
    const { toast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)
    const [pendingName, setPendingName] = useState<string | null>(null)
    const [isOpening, setIsOpening] = useState(false)

    const upload = async (file: File) => {
        if (file.type !== 'application/pdf') {
            toast({ title: 'Use a PDF', description: 'Upload your resume as a PDF file.', variant: 'destructive' })
            return
        }
        if (file.size > MAX_BYTES) {
            toast({ title: 'File too large', description: 'The resume must be 5 MB or smaller.', variant: 'destructive' })
            return
        }

        // Show the new file straight away. The server copy replaces this once the upload is saved.
        setPendingName(file.name)
        const form = new FormData()
        form.append('resume', file)
        const result = await uploadResume(form)
        setPendingName(null)

        if (result.success) {
            toast({ title: resume ? 'Resume replaced' : 'Resume uploaded', description: 'Future applications will use this version. Earlier versions are kept.' })
        } else {
            toast({ title: 'Upload failed', description: result.message, variant: 'destructive' })
        }
        if (inputRef.current) inputRef.current.value = ''
    }

    const view = async () => {
        setIsOpening(true)
        const result = await getCurrentResumeUrl()
        setIsOpening(false)
        if (result.success) {
            window.open(result.data!.url, '_blank', 'noopener,noreferrer')
        } else {
            toast({ title: 'Could not open resume', description: result.message, variant: 'destructive' })
        }
    }

    return (
        <div className="space-y-4">
            {pendingName ? (
                <div className="flex items-center gap-3 rounded-md border border-dashed p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-sm">Uploading {pendingName}</p>
                </div>
            ) : resume ? (
                <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{resume.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                                Uploaded {format(new Date(resume.created_at), 'MMM d, yyyy')} · {(resume.size_bytes / 1024).toFixed(0)} KB
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={view} disabled={isOpening}>
                        {isOpening ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                        View
                    </Button>
                </div>
            ) : (
                <div className="rounded-md border border-dashed p-6 text-center">
                    <p className="text-sm font-medium text-foreground">No resume yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Applications attach your current resume. Upload one before you send anything.</p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    id="resume-file"
                    onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void upload(file)
                    }}
                />
                <Button asChild variant={resume ? 'outline' : 'default'} size="sm">
                    <label htmlFor="resume-file" className="cursor-pointer">
                        <Upload />
                        {resume ? 'Replace resume' : 'Upload resume'}
                    </label>
                </Button>
                <p className="text-xs text-muted-foreground">
                    PDF, up to 5 MB.{versions > 1 ? ` ${versions - 1} earlier ${versions - 1 === 1 ? 'version is' : 'versions are'} kept for applications already sent.` : ''}
                </p>
            </div>
        </div>
    )
}
