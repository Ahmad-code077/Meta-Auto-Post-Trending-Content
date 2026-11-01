import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { aggregateGapSkills } from '@/lib/harness/gap-skills'
import { ANALYSIS_VERSION } from '@/lib/harness/analyze-job'
import { requireUser } from '@/lib/supabase/server'
import { loadProfile } from '@/lib/data/profile'
import type { JobAnalysis } from '@/lib/types/jobs'

// Read-only. Recomputed live from the current profile on every load -- adding a skill or an alias
// makes the matching gap disappear immediately, with no snapshot to go stale.
export default async function GapSkillsPage() {
    const { supabase, user } = await requireUser()

    const [profile, jobsResult] = await Promise.all([
        loadProfile(supabase, user.id),
        supabase
            .from('jobs')
            .select('id, title, company, analysis, analysis_version')
            .eq('user_id', user.id)
            .not('analysis', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1000),
    ])

    if (jobsResult.error) {
        throw new Error('Could not load your jobs')
    }

    // Analysis saved under an older schema version is skipped here, the same way ensureJobAnalysis
    // treats it as stale -- its skills/requirements shape may not match what gapSkillsFrom expects.
    const rows = (jobsResult.data ?? []) as { id: string; title: string | null; company: string | null; analysis: JobAnalysis | null; analysis_version: number | null }[]
    const jobs = rows.map((row) => ({
        id: row.id,
        title: row.title,
        company: row.company,
        analysis: row.analysis_version === ANALYSIS_VERSION ? row.analysis : null,
    }))
    const summaries = aggregateGapSkills(jobs, profile.skills)

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Gap skills</h1>
                <p className="text-sm text-muted-foreground">
                    Skills your analyzed job postings ask for that your profile doesn&apos;t show evidence for, across every job
                    you&apos;ve added. Sorted by how often each one comes up. Different wordings for the same real-world skill (for
                    example &quot;Gen AI&quot; vs &quot;Generative AI&quot;) are not merged -- add the skill, or an alias on an
                    existing one, to clear it from this list.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{summaries.length} gap skill{summaries.length === 1 ? '' : 's'}</CardTitle>
                </CardHeader>
                <CardContent>
                    {summaries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No gap skills found across your analyzed jobs.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Skill</TableHead>
                                    <TableHead className="w-24 text-right">Jobs</TableHead>
                                    <TableHead>Requested by</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summaries.map((summary) => (
                                    <TableRow key={summary.skill}>
                                        <TableCell className="font-medium">{summary.skill}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="secondary">{summary.jobCount}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                                {summary.jobs.map((job, index) => (
                                                    <span key={job.id}>
                                                        <Link href={`/dashboard/job-posts/${job.id}`} className="hover:text-foreground hover:underline">
                                                            {job.title ?? 'Untitled role'}{job.company ? ` @ ${job.company}` : ''}
                                                        </Link>
                                                        {index < summary.jobs.length - 1 && ','}
                                                    </span>
                                                ))}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
