import Link from 'next/link'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { nextActionLabel, type ApplicationCard, type CommandCenter as CommandCenterData, type UpcomingFollowUp } from '@/lib/dashboard/command-center'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from './job-meta'

// Presentational only. The data is derived by buildCommandCenter on the server.
export function CommandCenter({ data }: { data: CommandCenterData }) {
    if (data.total === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No applications yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                        Paste a job posting and a draft is written from your profile. Nothing is sent until you review it.
                    </p>
                    <Button asChild className="mt-6">
                        <Link href="/dashboard/job-posts/new">New application</Link>
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile href="#attention" label="Needs attention" value={data.counts.needsAttention} emphasis={data.counts.needsAttention > 0} />
                <Tile href="#upcoming" label="Upcoming follow-ups" value={data.counts.upcoming} />
                <Tile href="#waiting" label="Waiting for reply" value={data.counts.waiting} />
                <Tile href="#replied" label="Replied" value={data.counts.replied} />
            </div>

            <Section id="attention" title="Needs attention" description="Work that is blocked until you act.">
                {data.needsAttention.length === 0 ? (
                    <Empty>Nothing needs you right now.</Empty>
                ) : (
                    <CardList>
                        {data.needsAttention.map((card) => (
                            <ApplicationRow key={card.jobId} card={card} emphasis />
                        ))}
                    </CardList>
                )}
            </Section>

            <Section id="upcoming" title="Upcoming follow-ups" description="Sent automatically when due, unless you cancel them.">
                {data.upcomingFollowUps.length === 0 ? (
                    <Empty>No follow-ups are scheduled.</Empty>
                ) : (
                    <CardList>
                        {data.upcomingFollowUps.map((item) => (
                            <UpcomingRow key={`${item.jobId}-${item.number}`} item={item} />
                        ))}
                    </CardList>
                )}
            </Section>

            <Section id="waiting" title="Waiting for reply" description="Sent and not answered yet.">
                {data.waiting.length === 0 ? (
                    <Empty>No applications are waiting.</Empty>
                ) : (
                    <CardList>
                        {data.waiting.map((card) => (
                            <ApplicationRow key={card.jobId} card={card} />
                        ))}
                    </CardList>
                )}
            </Section>

            <Section id="replied" title="Replied" description="The recruiter answered. Follow-ups have stopped.">
                {data.replied.length === 0 ? (
                    <Empty>No replies yet.</Empty>
                ) : (
                    <CardList>
                        {data.replied.map((card) => (
                            <ApplicationRow key={card.jobId} card={card} />
                        ))}
                    </CardList>
                )}
            </Section>

            <Section id="recent" title="Recent applications" description="The latest applications you created.">
                <CardList>
                    {data.recent.map((card) => (
                        <ApplicationRow key={card.jobId} card={card} />
                    ))}
                </CardList>
            </Section>

            <Section id="all" title="All applications" description="The most recent applications in one table. Filter the full list on the applications page." action={{ href: '/dashboard/job-posts', label: 'Open full list' }}>
                <div className="hidden overflow-hidden rounded-md border lg:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[180px]">Company</TableHead>
                                <TableHead className="min-w-[180px]">Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="min-w-[180px]">Recruiter</TableHead>
                                <TableHead>Sent</TableHead>
                                <TableHead>Next follow-up</TableHead>
                                <TableHead className="min-w-[180px]">Next action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.table.map((card) => (
                                <TableRow key={card.jobId}>
                                    <TableCell className="font-medium">
                                        <Link href={reviewHref(card)} className="hover:underline">{card.company || 'Company not set'}</Link>
                                    </TableCell>
                                    <TableCell>{card.title || 'Untitled role'}</TableCell>
                                    <TableCell><StatusBadge status={card.status} /></TableCell>
                                    <TableCell className="text-sm">{recruiterText(card)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{card.sentAt ? format(new Date(card.sentAt), 'PPP p') : 'Not sent'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{card.nextFollowUp ? format(new Date(card.nextFollowUp.dueAt), 'PPP p') : 'None'}</TableCell>
                                    <TableCell className="text-sm">{nextActionLabel(card.nextAction)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <div className="lg:hidden">
                    <CardList>
                        {data.table.map((card) => (
                            <ApplicationRow key={card.jobId} card={card} />
                        ))}
                    </CardList>
                </div>
            </Section>
        </div>
    )
}

function reviewHref(card: { jobId: string }) {
    return `/dashboard/job-posts/${card.jobId}`
}

function recruiterText(card: { recruiterName: string | null; recruiterEmail: string | null }) {
    if (!card.recruiterName && !card.recruiterEmail) return <span className="text-muted-foreground">Not set</span>
    return (
        <>
            {card.recruiterName && <div>{card.recruiterName}</div>}
            {card.recruiterEmail && <div className="break-all text-xs text-muted-foreground">{card.recruiterEmail}</div>}
        </>
    )
}

function StatusBadge({ status }: { status: string }) {
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
    return <Badge variant={config?.variant ?? 'outline'}>{config?.label ?? status}</Badge>
}

function ApplicationRow({ card, emphasis = false }: { card: ApplicationCard; emphasis?: boolean }) {
    return (
        <Link
            href={reviewHref(card)}
            className={cn(
                'flex flex-col gap-3 rounded-md border p-4 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between',
                emphasis && 'border-primary/40'
            )}
        >
            <div className="min-w-0 space-y-1">
                <p className="truncate font-medium text-foreground">
                    {card.company || 'Company not set'}
                    <span className="font-normal text-muted-foreground"> · {card.title || 'Untitled role'}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={card.status} />
                    {card.sentAt && <span>Sent {format(new Date(card.sentAt), 'PPP p')}</span>}
                    {card.repliedAt && <span>Replied {format(new Date(card.repliedAt), 'PPP p')}</span>}
                    {card.recruiterName && <span>{card.recruiterName}</span>}
                </div>
            </div>
            <div className="shrink-0 text-sm">
                <span className={cn('font-medium', emphasis ? 'text-primary' : 'text-muted-foreground')}>
                    {nextActionLabel(card.nextAction)}
                </span>
                {card.nextFollowUp && (
                    <div className="text-xs text-muted-foreground">Due {format(new Date(card.nextFollowUp.dueAt), 'PPP p')}</div>
                )}
            </div>
        </Link>
    )
}

function UpcomingRow({ item }: { item: UpcomingFollowUp }) {
    return (
        <Link
            href={`/dashboard/job-posts/${item.jobId}`}
            className="flex flex-col gap-2 rounded-md border p-4 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
        >
            <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                    {item.company || 'Company not set'}
                    <span className="font-normal text-muted-foreground"> · {item.title || 'Untitled role'}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                    {item.recruiterName || item.recruiterEmail || 'No recruiter contact'}
                </p>
            </div>
            <div className="shrink-0 text-sm">
                <span className="font-medium text-foreground">Follow-up {item.number}</span>
                <div className="text-xs text-muted-foreground">{format(new Date(item.dueAt), 'PPP p')}</div>
            </div>
        </Link>
    )
}

function Tile({ href, label, value, emphasis = false }: { href: string; label: string; value: number; emphasis?: boolean }) {
    return (
        <a href={href} className="rounded-xl border bg-card p-4 transition-colors hover:bg-accent">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn('mt-2 text-2xl font-semibold tabular-nums', emphasis ? 'text-primary' : 'text-foreground')}>{value}</p>
        </a>
    )
}

function Section({
    id,
    title,
    description,
    action,
    children,
}: {
    id: string
    title: string
    description: string
    action?: { href: string; label: string }
    children: React.ReactNode
}) {
    return (
        <section id={id} className="scroll-mt-20 space-y-3">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1.5">
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    {action && (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={action.href}>{action.label}</Link>
                        </Button>
                    )}
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
        </section>
    )
}

function CardList({ children }: { children: React.ReactNode }) {
    return <div className="space-y-3">{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
