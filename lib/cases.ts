import published from '../data/P11_route_shift_public.json';
import { CRAFTED_DAY } from './seed';
import { parseHM } from './time';
import type { DayCase, Job, Technician, TravelMatrix } from './types';

/**
 * The published P11 case file, converted into the app's model.
 *
 * The file is the source of truth for structure: 25 cases, each with its own
 * area list, authoritative symmetric travel table, 12–16 technicians and 30–40
 * jobs, plus the scripted `manual_move` used to demonstrate requirement 4.
 * Times arrive as "HH:MM" strings and are parsed once, here, into the integer
 * minutes the rest of the codebase works in.
 */

interface RawTechnician {
  id: string;
  name: string;
  skills: string[];
  shift_start: string;
  shift_end: string;
  home_area: string;
}

interface RawJob {
  id: string;
  area: string;
  skill: string;
  duration_minutes: number;
  window_start: string;
  window_end: string;
}

interface RawCase {
  case_id: string;
  today: string;
  areas: string[];
  travel_minutes: Record<string, Record<string, number>>;
  technicians: RawTechnician[];
  jobs: RawJob[];
  manual_move?: { job_id: string; to_technician: string };
}

interface RawFile {
  schema_version: string;
  problem_id: string;
  format_note: string;
  cases: RawCase[];
}

const file = published as unknown as RawFile;

/** "J13" -> "J-13", so codes read the way a dispatcher writes them. */
function jobCode(id: string): string {
  const m = /^([A-Za-z]+)0*(\d+)$/.exec(id);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : id;
}

function toTechnician(raw: RawTechnician): Technician {
  return {
    id: raw.id,
    name: raw.name,
    skills: [...raw.skills],
    shiftStart: parseHM(raw.shift_start),
    shiftEnd: parseHM(raw.shift_end),
    homeArea: raw.home_area,
  };
}

function toJob(raw: RawJob): Job {
  return {
    id: raw.id,
    code: jobCode(raw.id),
    // The published cases carry no customer names; the area and code are the
    // dispatcher's handle on the job, so the board shows those.
    customer: `${raw.area} call`,
    area: raw.area,
    skill: raw.skill,
    durationMin: raw.duration_minutes,
    windowStart: parseHM(raw.window_start),
    windowEnd: parseHM(raw.window_end),
  };
}

function toCase(raw: RawCase): DayCase {
  return {
    id: raw.case_id,
    label: raw.case_id,
    today: raw.today,
    areas: [...raw.areas],
    travel: raw.travel_minutes as TravelMatrix,
    technicians: raw.technicians.map(toTechnician),
    jobs: raw.jobs.map(toJob),
    manualMove: raw.manual_move
      ? { jobId: raw.manual_move.job_id, toTechnicianId: raw.manual_move.to_technician }
      : undefined,
    source: 'published',
  };
}

export const PUBLISHED_CASES: DayCase[] = file.cases.map(toCase);

export const PUBLISHED_SCHEMA_VERSION = file.schema_version;

/**
 * Every day the dispatcher can load. The published cases come first because
 * they are the ones judges hold; the crafted day is kept because it walks
 * through all five rules on purpose, one blocked job each.
 */
export const CASES: DayCase[] = [...PUBLISHED_CASES, CRAFTED_DAY];

export const DEFAULT_CASE_ID = PUBLISHED_CASES[0]?.id ?? CRAFTED_DAY.id;

export function findCase(id: string): DayCase {
  return CASES.find((c) => c.id === id) ?? CASES[0];
}

/**
 * The board window for a case: the earliest shift start to the latest shift end.
 *
 * Deliberately NOT stretched to cover every customer window. A case can carry a
 * job promised for 23:00 when nobody works past 19:00, and widening the board to
 * fit it turns a third of the timeline into dead space that no technician could
 * ever occupy. Such a job cannot be scheduled by definition, so it belongs in
 * the blocked list — which names the rule — not on the ruler.
 */
export function caseWindow(day: DayCase): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const t of day.technicians) {
    start = Math.min(start, t.shiftStart);
    end = Math.max(end, t.shiftEnd);
  }
  if (!Number.isFinite(start)) return { start: 8 * 60, end: 19 * 60 };
  // Round out to whole hours so the gridlines land on the hour.
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}
