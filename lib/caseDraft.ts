import type { RawCase, RawJob, RawTechnician } from './caseFile';
import { formatTime } from './time';

/**
 * Editing a day as a form rather than as JSON.
 *
 * Every operation here keeps the case internally consistent, which is the whole
 * point of not making someone hand-edit the file: renaming an area updates the
 * travel table and everyone who lives or works there, adding an area fills in
 * its travel row and column, and the table stays symmetric with a zero diagonal
 * whichever cell you type in. The validator in caseFile.ts still has the final
 * say — but it should have nothing left to complain about.
 *
 * All of it is pure, so the awkward cases (rename an area that two technicians
 * live in; delete an area that jobs are still in) are tested rather than
 * discovered.
 */

const DEFAULT_TRAVEL = 30;

export function emptyDraft(today = new Date().toISOString().slice(0, 10)): RawCase {
  return {
    case_id: 'MY-DAY-01',
    today,
    areas: [],
    travel_minutes: {},
    technicians: [],
    jobs: [],
  };
}

/** T01, T02, … skipping anything already taken. */
export function nextTechnicianId(draft: RawCase): string {
  const taken = new Set(draft.technicians.map((t) => t.id));
  for (let i = 1; i < 1000; i++) {
    const id = `T${String(i).padStart(2, '0')}`;
    if (!taken.has(id)) return id;
  }
  return `T${Date.now() % 10000}`;
}

export function nextJobId(draft: RawCase): string {
  const taken = new Set(draft.jobs.map((j) => j.id));
  for (let i = 1; i < 1000; i++) {
    const id = `J${String(i).padStart(2, '0')}`;
    if (!taken.has(id)) return id;
  }
  return `J${Date.now() % 10000}`;
}

// ---- Areas and the travel table ----------------------------------------

export function addArea(draft: RawCase, name: string): RawCase {
  const area = name.trim();
  if (!area || draft.areas.includes(area)) return draft;

  const travel: RawCase['travel_minutes'] = {};
  for (const a of [...draft.areas, area]) {
    travel[a] = {};
    for (const b of [...draft.areas, area]) {
      travel[a][b] = a === b ? 0 : (draft.travel_minutes[a]?.[b] ?? DEFAULT_TRAVEL);
    }
  }
  return { ...draft, areas: [...draft.areas, area], travel_minutes: travel };
}

export function removeArea(draft: RawCase, name: string): RawCase {
  const areas = draft.areas.filter((a) => a !== name);
  const travel: RawCase['travel_minutes'] = {};
  for (const a of areas) {
    travel[a] = {};
    for (const b of areas) travel[a][b] = draft.travel_minutes[a]?.[b] ?? DEFAULT_TRAVEL;
  }

  // A technician cannot live nowhere, and a job cannot happen nowhere. Both
  // move to whatever area is left; if none is, the case is empty anyway.
  const fallback = areas[0];
  return {
    ...draft,
    areas,
    travel_minutes: travel,
    technicians: draft.technicians.map((t) =>
      t.home_area === name ? { ...t, home_area: fallback ?? '' } : t,
    ),
    jobs: draft.jobs.map((j) => (j.area === name ? { ...j, area: fallback ?? '' } : j)),
  };
}

/** Rename an area everywhere it appears, in one move. */
export function renameArea(draft: RawCase, from: string, to: string): RawCase {
  const name = to.trim();
  if (!name || from === name || draft.areas.includes(name)) return draft;

  const areas = draft.areas.map((a) => (a === from ? name : a));
  const swap = (a: string) => (a === from ? name : a);

  const travel: RawCase['travel_minutes'] = {};
  for (const a of draft.areas) {
    travel[swap(a)] = {};
    for (const b of draft.areas) travel[swap(a)][swap(b)] = draft.travel_minutes[a]?.[b] ?? 0;
  }

  return {
    ...draft,
    areas,
    travel_minutes: travel,
    technicians: draft.technicians.map((t) => ({ ...t, home_area: swap(t.home_area) })),
    jobs: draft.jobs.map((j) => ({ ...j, area: swap(j.area) })),
  };
}

/** Set one leg. The table is symmetric, so the reverse is set with it. */
export function setTravel(draft: RawCase, from: string, to: string, minutes: number): RawCase {
  if (from === to) return draft;
  const value = Math.max(0, Math.round(minutes || 0));
  const travel: RawCase['travel_minutes'] = {};
  for (const a of draft.areas) {
    travel[a] = { ...(draft.travel_minutes[a] ?? {}) };
  }
  travel[from] = { ...travel[from], [to]: value };
  travel[to] = { ...travel[to], [from]: value };
  return { ...draft, travel_minutes: travel };
}

/** Fill in anything missing and force the diagonal to zero. */
export function normaliseTravel(draft: RawCase): RawCase {
  const travel: RawCase['travel_minutes'] = {};
  for (const a of draft.areas) {
    travel[a] = {};
    for (const b of draft.areas) {
      if (a === b) travel[a][b] = 0;
      else {
        const existing = draft.travel_minutes[a]?.[b] ?? draft.travel_minutes[b]?.[a];
        travel[a][b] = typeof existing === 'number' ? existing : DEFAULT_TRAVEL;
      }
    }
  }
  return { ...draft, travel_minutes: travel };
}

// ---- Technicians and jobs ----------------------------------------------

export function addTechnician(draft: RawCase, skills: string[]): RawCase {
  const tech: RawTechnician = {
    id: nextTechnicianId(draft),
    name: `Technician ${draft.technicians.length + 1}`,
    skills: skills.slice(0, 1),
    shift_start: '09:00',
    shift_end: '18:00',
    home_area: draft.areas[0] ?? '',
  };
  return { ...draft, technicians: [...draft.technicians, tech] };
}

export function updateTechnician(draft: RawCase, id: string, patch: Partial<RawTechnician>): RawCase {
  return {
    ...draft,
    technicians: draft.technicians.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function removeTechnician(draft: RawCase, id: string): RawCase {
  return {
    ...draft,
    technicians: draft.technicians.filter((t) => t.id !== id),
    // A scripted move pointing at a technician who is gone is not a move.
    manual_move: draft.manual_move?.to_technician === id ? undefined : draft.manual_move,
  };
}

export function addJob(draft: RawCase, skills: string[]): RawCase {
  const job: RawJob = {
    id: nextJobId(draft),
    area: draft.areas[0] ?? '',
    skill: skills[0] ?? 'ac',
    duration_minutes: 60,
    window_start: '10:00',
    window_end: '14:00',
  };
  return { ...draft, jobs: [...draft.jobs, job] };
}

export function updateJob(draft: RawCase, id: string, patch: Partial<RawJob>): RawCase {
  return { ...draft, jobs: draft.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) };
}

export function removeJob(draft: RawCase, id: string): RawCase {
  return {
    ...draft,
    jobs: draft.jobs.filter((j) => j.id !== id),
    manual_move: draft.manual_move?.job_id === id ? undefined : draft.manual_move,
  };
}

/** Every skill named anywhere in the draft, plus the ones the format expects. */
export function skillsInDraft(draft: RawCase): string[] {
  const seen = new Set<string>(['ac', 'plumbing', 'electrical', 'gas_line']);
  for (const t of draft.technicians) for (const s of t.skills) seen.add(s);
  for (const j of draft.jobs) seen.add(j.skill);
  return [...seen].sort();
}

/**
 * What is obviously missing, in the order a person would fix it. Not a
 * replacement for the validator — a nudge while the form is still half-filled,
 * when the validator would only produce noise.
 */
export function draftGaps(draft: RawCase): string[] {
  const gaps: string[] = [];
  if (draft.areas.length < 2) gaps.push('Add at least two areas.');
  if (draft.technicians.length === 0) gaps.push('Add at least one technician.');
  if (draft.jobs.length === 0) gaps.push('Add at least one job.');

  const held = new Set(draft.technicians.flatMap((t) => t.skills));
  const unservable = [...new Set(draft.jobs.map((j) => j.skill))].filter((s) => !held.has(s));
  if (unservable.length && draft.technicians.length > 0) {
    gaps.push(
      `Nobody holds ${unservable.join(', ')} — those jobs will show in the blocked list, which may be what you want.`,
    );
  }
  return gaps;
}

/** A readable summary for the panel header. */
export function draftSummary(draft: RawCase): string {
  const work = draft.jobs.reduce((n, j) => n + (j.duration_minutes || 0), 0);
  return (
    `${draft.technicians.length} technician${draft.technicians.length === 1 ? '' : 's'}, ` +
    `${draft.jobs.length} job${draft.jobs.length === 1 ? '' : 's'}, ` +
    `${draft.areas.length} area${draft.areas.length === 1 ? '' : 's'}, ` +
    `${formatTime(work)} of work`
  );
}
