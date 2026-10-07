import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CommandCenter } from '@/components/jobs/command-center'
import { Button } from '@/components/ui/button'
import { buildCommandCenter, type DashboardEmail, type DashboardJob } from '@/lib/dashboard/command-center'
import { requireUser } from '@/lib/supabase/server'

// Two queries for the whole dashboard, both scoped to the signed-in user. Everything else is derived in memory,
// so the page does not run one query per application.
export default async function ApplicationsDashboardPage() {
    const { supabase, user } = await requireUser()

    const [jobsResult, emailsResult] = await Promise.all([
        supabase
            .from('jobs')
            .select('id, user_id, title, company, recruiter_name, recruiter_email, status, created_at, sent_at, replied_at')
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

    const data = buildCommandCenter({
        userId: user.id,
        jobs: (jobsResult.data ?? []) as DashboardJob[],
        emails: (emailsResult.data ?? []) as DashboardEmail[],
    })

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    Everything that needs you, in one place. Open an application to review it.
                </p>
                <Button asChild>
                    <Link href="/dashboard/job-posts/new">
                        <Plus />
                        New application
                    </Link>
                </Button>
            </div>

            <CommandCenter data={data} />
        </div>
    )
}
