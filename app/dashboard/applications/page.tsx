import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CommandCenter } from '@/components/jobs/command-center'
import { DismissedJobsList } from '@/components/jobs/dismissed-jobs-list'
import { DeletedJobsList } from '@/components/jobs/deleted-jobs-list'
import { Button } from '@/components/ui/button'
import { buildCommandCenter, type DashboardEmail, type DashboardJob } from '@/lib/dashboard/command-center'
import { requireUser } from '@/lib/supabase/server'

// Two queries for the whole dashboard, both scoped to the signed-in user. Everything else is derived in memory,
// so the page does not run one query per application.
export default async function ApplicationsDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ dismissed?: string; deleted?: string }>
}) {
    const { dismissed, deleted } = await searchParams
    const showDismissed = dismissed === '1'
    const showDeleted = deleted === '1'
    const { supabase, user } = await requireUser()

    const [jobsResult, emailsResult] = await Promise.all([
        supabase
            .from('jobs')
            .select('id, user_id, title, company, recruiter_name, recruiter_email, status, created_at, sent_at, replied_at, dismissed_at, deleted_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1000),
        supabase
            .from('application_emails')
            .select('id, job_id, user_id, kind, follow_up_number, status, due_at, sent_at, attempts, error_code, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5000),
    ])

    if (jobsResult.error || emailsResult.error) {
        throw new Error('Could not load your applications')
    }

    const jobs = (jobsResult.data ?? []) as DashboardJob[]
    const data = buildCommandCenter({
        userId: user.id,
        jobs,
        emails: (emailsResult.data ?? []) as DashboardEmail[],
    })

    if (showDismissed) {
        const dismissedJobs = jobs.filter((j) => j.user_id === user.id && j.dismissed_at && !j.deleted_at)
        return (
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Dismissed applications. Restore one to bring it back to the Command Center.
                    </p>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/applications">Back to Command Center</Link>
                    </Button>
                </div>
                <DismissedJobsList jobs={dismissedJobs} />
            </div>
        )
    }

    if (showDeleted) {
        const deletedJobs = jobs.filter((j) => j.user_id === user.id && j.deleted_at)
        return (
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Deleted applications. Restore one to bring it back.
                    </p>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/applications">Back to Command Center</Link>
                    </Button>
                </div>
                <DeletedJobsList jobs={deletedJobs} />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    Everything that needs you, in one place. Open an application to review it.
                </p>
                <div className="flex gap-2">
                    {data.dismissedCount > 0 && (
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/applications?dismissed=1">Show dismissed ({data.dismissedCount})</Link>
                        </Button>
                    )}
                    {data.deletedCount > 0 && (
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/applications?deleted=1">Show deleted ({data.deletedCount})</Link>
                        </Button>
                    )}
                    <Button asChild>
                        <Link href="/dashboard/job-posts/new">
                            <Plus />
                            New application
                        </Link>
                    </Button>
                </div>
            </div>

            <CommandCenter data={data} />
        </div>
    )
}
