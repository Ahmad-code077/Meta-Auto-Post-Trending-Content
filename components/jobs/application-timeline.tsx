import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TimelineEvent, TimelineTone } from '@/lib/timeline/build'
import { cn } from '@/lib/utils'

const DOT: Record<TimelineTone, string> = {
    neutral: 'bg-muted-foreground/50',
    success: 'bg-primary',
    warning: 'bg-amber-500',
    danger: 'bg-destructive',
}

// Renders events in the order given. The events come from buildApplicationTimeline, which sorts them.
export function ApplicationTimeline({ events }: { events: TimelineEvent[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Everything that has happened to this application, oldest first.</CardDescription>
            </CardHeader>
            <CardContent>
                <ol className="relative space-y-6 border-l pl-6">
                    {events.map((event) => (
                        <li key={event.key} className="relative">
                            <span
                                aria-hidden="true"
                                className={cn('absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card', DOT[event.tone])}
                            />
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-foreground">{event.title}</p>
                                <p className="text-xs text-muted-foreground">{format(new Date(event.at), 'PPP p')}</p>
                                {event.dueAt && (
                                    <p className="text-sm text-muted-foreground">Due {format(new Date(event.dueAt), 'PPP p')}</p>
                                )}
                                {event.detail && <p className="text-sm text-muted-foreground">{event.detail}</p>}
                            </div>
                        </li>
                    ))}
                </ol>
            </CardContent>
        </Card>
    )
}
