'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../supabase/server';

export async function deleteOldPosts() {
  const supabase = await createClient();

  try {
    // Calculate date 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    console.log('Deleting posts older than:', twentyFourHoursAgo.toISOString());

    // First, get the count of posts to be deleted
    const { count, error: countError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .neq('status', 'published');

    if (countError) throw countError;

    // Then delete the posts
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .neq('status', 'published');

    if (deleteError) throw deleteError;

    console.log(`Deleted ${count} old posts`);

    // Revalidate the dashboard page to show updated counts
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Successfully deleted ${count} old posts`,
      count,
    };
  } catch (error) {
    console.error('Error deleting old posts:', error);
    return {
      success: false,
      message: 'Failed to delete old posts',
      error,
    };
  }
}

export async function getDeletablePostsCount() {
  const supabase = await createClient();

  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .neq('status', 'published');

    if (error) throw error;

    return count || 0;
  } catch (error) {
    console.error('Error counting deletable posts:', error);
    return 0;
  }
}
