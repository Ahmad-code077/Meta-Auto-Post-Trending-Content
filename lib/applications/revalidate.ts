// Every mutation that changes a job's status, its draft, or a follow-up touches three places: the
// applications list, this job's own review page, and the command center. revalidatePath only
// invalidates the exact path given -- it does not cascade to a dynamic child route or to an
// unrelated page that also reads the same data. Calling it for one path and not the others is how a
// send or a generation succeeds (confirmed by the server logs) while the dashboard keeps showing the
// state from before it.
import { revalidatePath } from 'next/cache';

export function revalidateApplicationPaths(jobId: string): void {
    revalidatePath('/dashboard/job-posts');
    revalidatePath(`/dashboard/job-posts/${jobId}`);
    revalidatePath('/dashboard/applications');
}
