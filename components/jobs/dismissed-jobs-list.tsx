import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { RestoreJobButton } from './job-dismiss'

interface DismissedJob {
    id: string
    title: string | null
    company: string | null
}

// Flat list for the "Show dismissed" view. No next-action logic -- a dismissed job only needs
// a way back into the Command Center.
export function DismissedJobsList({ jobs }: { jobs: DismissedJob[] }) {
    if (jobs.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    No dismissed applications.
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-3">
            {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-3 rounded-md border p-4">
                    <Link href={`/dashboard/job-posts/${job.id}`} className="min-w-0 flex-1 hover:underline">
                        <p className="truncate font-medium text-foreground">
                            {job.company || 'Company not set'}
                            <span className="font-normal text-muted-foreground"> · {job.title || 'Untitled role'}</span>
                        </p>
                    </Link>
                    <RestoreJobButton jobId={job.id} />
                </div>
            ))}
        </div>
    )
}
