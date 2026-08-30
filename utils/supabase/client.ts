import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase in the browser, used for days the team publishes so that anyone
 * opening the live URL sees them — not just the person who wrote them.
 *
 * Optional by design. The board is a client-side solver and works with no
 * database at all; if these variables are absent the app falls back to keeping
 * your own days in localStorage and nothing else changes. A judge opening the
 * live URL never needs an account.
 *
 * The publishable key is meant to be public — it identifies the project, it
 * does not authorise anything on its own — but it is still kept out of the
 * repository, because the submission rules allow no key in the repo at all.
 * What actually protects the data is row-level security; see
 * supabase/migrations/0001_shared_days.sql.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export function createClient() {
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
