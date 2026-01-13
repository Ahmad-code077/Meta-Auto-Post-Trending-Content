import { createClient } from '@/lib/supabase/client';
import type { Job, JobFilters, JobsResponse } from '@/lib/types/jobs';

export async function getJobs(
    filters: JobFilters = {},
    page: number = 1,
    pageSize: number = 10
): Promise<JobsResponse> {
    const supabase = createClient();

    try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error('User not authenticated');
        }

        // Start building the query
        let query = supabase
            .from('jobs')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id);

        // Apply filters
        if (filters.status && filters.status !== 'all') {
            query = query.eq('status', filters.status);
        }

        if (filters.company) {
            query = query.ilike('company', `%${filters.company}%`);
        }

        if (filters.location) {
            query = query.ilike('location', `%${filters.location}%`);
        }

        if (filters.work_type) {
            query = query.eq('work_type', filters.work_type);
        }

        if (filters.search) {
            query = query.or(`title.ilike.%${filters.search}%,company.ilike.%${filters.search}%,location.ilike.%${filters.search}%`);
        }

        // Apply pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        query = query
            .range(from, to)
            .order('created_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) {
            console.error('Error fetching jobs:', error);
            throw error;
        }

        const totalPages = count ? Math.ceil(count / pageSize) : 0;

        return {
            data: (data as Job[]) || [],
            count: count || 0,
            page,
            pageSize,
            totalPages,
        };
    } catch (error) {
        console.error('Error in getJobs:', error);
        return {
            data: [],
            count: 0,
            page,
            pageSize,
            totalPages: 0,
        };
    }
}

export async function getUniqueCompanies(): Promise<string[]> {
    const supabase = createClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return [];
        }

        const { data, error } = await supabase
            .from('jobs')
            .select('company')
            .eq('user_id', user.id)
            .not('company', 'is', null);

        if (error) throw error;

        const companies = [...new Set(data.map(job => job.company).filter(Boolean))];
        return companies as string[];
    } catch (error) {
        console.error('Error fetching unique companies:', error);
        return [];
    }
}

export async function getUniqueLocations(): Promise<string[]> {
    const supabase = createClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return [];
        }

        const { data, error } = await supabase
            .from('jobs')
            .select('location')
            .eq('user_id', user.id)
            .not('location', 'is', null);

        if (error) throw error;

        const locations = [...new Set(data.map(job => job.location).filter(Boolean))];
        return locations as string[];
    } catch (error) {
        console.error('Error fetching unique locations:', error);
        return [];
    }
}

export async function getUniqueWorkTypes(): Promise<string[]> {
    const supabase = createClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return [];
        }

        const { data, error } = await supabase
            .from('jobs')
            .select('work_type')
            .eq('user_id', user.id)
            .not('work_type', 'is', null);

        if (error) throw error;

        const workTypes = [...new Set(data.map(job => job.work_type).filter(Boolean))];
        return workTypes as string[];
    } catch (error) {
        console.error('Error fetching unique work types:', error);
        return [];
    }
}
