import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase on the server, for the one API route this app has.
 *
 * There is no authentication in this project, so nothing here refreshes a
 * session and there is deliberately no middleware: adding a session-refreshing
 * middleware that has no session to refresh would be noise. The cookie plumbing
 * is kept because it is what the Supabase SSR client expects, and because it is
 * what any later auth work would build on.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export async function createClient() {
  if (!url || !key) return null;
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe
          // to ignore: nothing in this app writes a session.
        }
      },
    },
  });
}
