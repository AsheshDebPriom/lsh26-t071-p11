import { createClient, isSupabaseConfigured } from '@/utils/supabase/client';

import { parseCaseFile, type RawCase } from './caseFile';

/**
 * Days published to Supabase, so a case written in one browser can be opened by
 * anyone with the live URL.
 *
 * Entirely optional. With no Supabase configured the board keeps your days in
 * localStorage and everything else behaves the same, which is why every call
 * here reports a reason rather than throwing — a database that is absent, slow
 * or refusing writes must never stop a dispatcher planning a day.
 *
 * Anything read back is put through the same validator as a pasted file. A row
 * in a table is not more trustworthy than a text box.
 */

export interface SharedDay {
  id: string;
  title: string;
  createdAt: string;
}

export type ShareResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const TABLE = 'shared_days';
const UNCONFIGURED = 'Publishing is switched off — no Supabase project is configured.';

export { isSupabaseConfigured };

export async function listSharedDays(): Promise<ShareResult<SharedDay[]>> {
  const supabase = createClient();
  if (!supabase) return { ok: false, reason: UNCONFIGURED };

  const { data, error } = await supabase
    .from(TABLE)
    .select('id,title,created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { ok: false, reason: error.message };
  return {
    ok: true,
    value: (data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      createdAt: String(r.created_at),
    })),
  };
}

export async function fetchSharedDay(id: string): Promise<ShareResult<RawCase>> {
  const supabase = createClient();
  if (!supabase) return { ok: false, reason: UNCONFIGURED };

  const { data, error } = await supabase.from(TABLE).select('payload').eq('id', id).maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: `No published day called "${id}".` };

  // Validated on the way in, exactly like a pasted file.
  const parsed = parseCaseFile(JSON.stringify(data.payload));
  if (!parsed.ok) {
    return { ok: false, reason: `That published day is not valid: ${parsed.errors[0]}` };
  }
  return { ok: true, value: parsed.cases[0] };
}

export async function publishDay(day: RawCase, title: string): Promise<ShareResult<string>> {
  const supabase = createClient();
  if (!supabase) return { ok: false, reason: UNCONFIGURED };

  // Check before sending: a malformed day should fail here, with a useful
  // message, rather than as a constraint violation from Postgres.
  const parsed = parseCaseFile(JSON.stringify(day));
  if (!parsed.ok) return { ok: false, reason: parsed.errors[0] };

  const { error } = await supabase
    .from(TABLE)
    .insert({ id: day.case_id, title: title.slice(0, 120) || day.case_id, payload: day });

  if (error) {
    // The table grants insert but not update, so a repeat id is a real answer,
    // not a failure to explain away.
    if (error.code === '23505') {
      return {
        ok: false,
        reason: `A day called "${day.case_id}" is already published. Change case_id and publish again — published days cannot be overwritten.`,
      };
    }
    return { ok: false, reason: error.message };
  }
  return { ok: true, value: day.case_id };
}
