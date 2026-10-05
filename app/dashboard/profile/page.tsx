import { requireUser } from '@/lib/supabase/server'
import { loadProfile } from '@/lib/data/profile'
import { toResumeSummary } from '@/lib/types/profile'
import { ProfileEditor } from '@/components/profile/profile-editor'

export default async function ProfilePage() {
    const { supabase, user } = await requireUser()
    const profile = await loadProfile(supabase, user.id)

    // Counts every resume version, including replaced ones. Only the current row's details reach the browser.
    const { count } = await supabase
        .from('resumes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)

    return (
        <ProfileEditor
            details={profile.details}
            signInEmail={user.email ?? null}
            skills={profile.skills}
            experiences={profile.experiences}
            projects={profile.projects}
            resume={profile.resume ? toResumeSummary(profile.resume) : null}
            resumeVersions={count ?? 0}
        />
    )
}
