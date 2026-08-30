import { formatTime, parseHM } from './time';
import type { DayCase } from './types';

/**
 * Loading and saving days in the published P11 format.
 *
 * Writing your own day means writing the same JSON the participant pack ships,
 * so anything authored here would also load into anyone else's implementation
 * and vice versa. Export gives you a correct file to start from; import checks
 * it properly and tells you every single thing that is wrong with it, with the
 * field path, rather than failing on the first mistake or — worse — loading
 * something half-valid and producing a nonsense plan.
 */

export interface RawTechnician {
  id: string;
  name: string;
  skills: string[];
  shift_start: string;
  shift_end: string;
  home_area: string;
}

export interface RawJob {
  id: string;
  area: string;
  skill: string;
  duration_minutes: number;
  window_start: string;
  window_end: string;
  customer?: string;
}

export interface RawCase {
  case_id: string;
  today: string;
  areas: string[];
  travel_minutes: Record<string, Record<string, number>>;
  technicians: RawTechnician[];
  jobs: RawJob[];
  manual_move?: { job_id: string; to_technician: string };
}

export interface RawFile {
  schema_version: string;
  problem_id: string;
  format_note?: string;
  cases: RawCase[];
}

export type ParseResult =
  | { ok: true; cases: RawCase[]; warnings: string[] }
  | { ok: false; errors: string[] };

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Read one or many cases out of pasted text.
 *
 * Accepts a whole file (`{ schema_version, cases: [...] }`), a bare array of
 * cases, or a single case object — because all three are things a person
 * reasonably ends up with when editing JSON by hand.
 */
export function parseCaseFile(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`That is not valid JSON — ${(e as Error).message}`] };
  }

  let rawCases: unknown[];
  if (isObject(data) && Array.isArray(data.cases)) rawCases = data.cases;
  else if (Array.isArray(data)) rawCases = data;
  else if (isObject(data) && 'case_id' in data) rawCases = [data];
  else {
    return {
      ok: false,
      errors: [
        'Could not find a case. Expected an object with a "cases" array, an array of cases, or a single case object with a "case_id".',
      ],
    };
  }

  if (rawCases.length === 0) return { ok: false, errors: ['The file contains no cases.'] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const good: RawCase[] = [];

  rawCases.forEach((raw, i) => {
    const label = isObject(raw) && typeof raw.case_id === 'string' ? raw.case_id : `cases[${i}]`;
    const found = validateCase(raw, label, warnings);
    if (found.length) errors.push(...found);
    else good.push(raw as RawCase);
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, cases: good, warnings };
}

function validateCase(raw: unknown, label: string, warnings: string[]): string[] {
  const e: string[] = [];
  const at = (path: string, msg: string) => e.push(`${label} → ${path}: ${msg}`);

  if (!isObject(raw)) return [`${label}: a case must be an object.`];

  if (typeof raw.case_id !== 'string' || !raw.case_id.trim()) {
    at('case_id', 'required, and must be a non-empty name for the day.');
  }
  if (typeof raw.today !== 'string' || !raw.today.trim()) {
    warnings.push(`${label}: no "today" date — the board will show it as unknown.`);
  }

  // ---- Areas ----------------------------------------------------------
  const areas = Array.isArray(raw.areas) ? raw.areas.filter((a) => typeof a === 'string') : [];
  if (!Array.isArray(raw.areas) || areas.length < 2) {
    at('areas', 'required — a list of at least two area names.');
  }
  if (areas.length !== new Set(areas).size) at('areas', 'contains a duplicate area name.');
  const areaSet = new Set(areas);

  // ---- Travel table ---------------------------------------------------
  const travel = raw.travel_minutes;
  if (!isObject(travel)) {
    at('travel_minutes', 'required — the area-to-area travel table.');
  } else if (areas.length >= 2) {
    for (const a of areas) {
      const row = travel[a];
      if (!isObject(row)) {
        at(`travel_minutes.${a}`, 'missing a row for this area.');
        continue;
      }
      for (const b of areas) {
        const v = row[b];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          at(`travel_minutes.${a}.${b}`, 'missing, or not a number.');
          continue;
        }
        if (v < 0) at(`travel_minutes.${a}.${b}`, `is negative (${v}).`);
        if (a === b && v !== 0) {
          at(`travel_minutes.${a}.${a}`, `must be 0 — travel within one area is free, got ${v}.`);
        }
        const back = isObject(travel[b]) ? (travel[b] as Record<string, unknown>)[a] : undefined;
        if (a !== b && typeof back === 'number' && back !== v) {
          at(
            `travel_minutes.${a}.${b}`,
            `is ${v} but ${b}→${a} is ${back}. The table must be symmetric.`,
          );
        }
      }
    }
  }

  // ---- Technicians ----------------------------------------------------
  const techs = Array.isArray(raw.technicians) ? raw.technicians : [];
  if (techs.length === 0) at('technicians', 'required — at least one technician.');
  const techIds = new Set<string>();
  techs.forEach((t, i) => {
    const p = `technicians[${i}]`;
    if (!isObject(t)) return at(p, 'must be an object.');
    if (typeof t.id !== 'string' || !t.id.trim()) at(`${p}.id`, 'required.');
    else if (techIds.has(t.id)) at(`${p}.id`, `duplicate id "${t.id}".`);
    else techIds.add(t.id);

    if (typeof t.name !== 'string' || !t.name.trim()) at(`${p}.name`, 'required.');
    if (!Array.isArray(t.skills) || t.skills.length === 0) {
      at(`${p}.skills`, 'required — a list of at least one skill.');
    }
    const start = checkTime(t.shift_start, `${p}.shift_start`, at);
    const end = checkTime(t.shift_end, `${p}.shift_end`, at);
    if (start !== null && end !== null && end <= start) {
      at(`${p}.shift_end`, `must be after shift_start (${t.shift_start} → ${t.shift_end}).`);
    }
    if (typeof t.home_area !== 'string' || !areaSet.has(t.home_area)) {
      at(`${p}.home_area`, `"${String(t.home_area)}" is not one of the areas listed above.`);
    }
  });

  // ---- Jobs -----------------------------------------------------------
  const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  if (jobs.length === 0) at('jobs', 'required — at least one job.');
  const jobIds = new Set<string>();
  const skillsHeld = new Set(
    techs.flatMap((t) => (isObject(t) && Array.isArray(t.skills) ? (t.skills as string[]) : [])),
  );
  jobs.forEach((j, i) => {
    const p = `jobs[${i}]`;
    if (!isObject(j)) return at(p, 'must be an object.');
    if (typeof j.id !== 'string' || !j.id.trim()) at(`${p}.id`, 'required.');
    else if (jobIds.has(j.id)) at(`${p}.id`, `duplicate id "${j.id}".`);
    else jobIds.add(j.id);

    if (typeof j.area !== 'string' || !areaSet.has(j.area)) {
      at(`${p}.area`, `"${String(j.area)}" is not one of the areas listed above.`);
    }
    if (typeof j.skill !== 'string' || !j.skill.trim()) at(`${p}.skill`, 'required.');
    else if (!skillsHeld.has(j.skill)) {
      // Legal, and often deliberate — it is how a case demonstrates
      // SKILL_MISMATCH — so it is a warning, not an error.
      warnings.push(
        `${label} → ${p}.skill: no technician holds "${j.skill}", so this job can never be scheduled.`,
      );
    }
    if (typeof j.duration_minutes !== 'number' || !(j.duration_minutes > 0)) {
      at(`${p}.duration_minutes`, 'required — a positive number of minutes.');
    }
    const ws = checkTime(j.window_start, `${p}.window_start`, at);
    const we = checkTime(j.window_end, `${p}.window_end`, at);
    if (ws !== null && we !== null && we < ws) {
      at(`${p}.window_end`, `closes before it opens (${j.window_start} → ${j.window_end}).`);
    }
  });

  // ---- The scripted move ----------------------------------------------
  if (raw.manual_move !== undefined) {
    const mv = raw.manual_move;
    if (!isObject(mv)) at('manual_move', 'must be an object, or left out entirely.');
    else {
      if (typeof mv.job_id !== 'string' || !jobIds.has(mv.job_id)) {
        at('manual_move.job_id', `"${String(mv.job_id)}" is not a job in this case.`);
      }
      if (typeof mv.to_technician !== 'string' || !techIds.has(mv.to_technician)) {
        at('manual_move.to_technician', `"${String(mv.to_technician)}" is not a technician in this case.`);
      }
    }
  }

  return e;
}

function checkTime(
  value: unknown,
  path: string,
  at: (path: string, msg: string) => void,
): number | null {
  if (typeof value !== 'string' || !HHMM.test(value.trim())) {
    at(path, `must be a time written as HH:MM, got ${JSON.stringify(value)}.`);
    return null;
  }
  return parseHM(value);
}

// ---- Writing one back out ----------------------------------------------

/** A case as the published format writes it, ready to save and edit. */
export function toRawCase(day: DayCase): RawCase {
  return {
    case_id: day.id,
    today: day.today,
    areas: [...day.areas],
    travel_minutes: day.travel,
    technicians: day.technicians.map((t) => ({
      id: t.id,
      name: t.name,
      skills: [...t.skills],
      shift_start: formatTime(t.shiftStart),
      shift_end: formatTime(t.shiftEnd),
      home_area: t.homeArea,
    })),
    jobs: day.jobs.map((j) => ({
      id: j.id,
      area: j.area,
      skill: j.skill,
      duration_minutes: j.durationMin,
      window_start: formatTime(j.windowStart),
      window_end: formatTime(j.windowEnd),
    })),
    ...(day.manualMove
      ? { manual_move: { job_id: day.manualMove.jobId, to_technician: day.manualMove.toTechnicianId } }
      : {}),
  };
}

/** The whole file, in the shape the participant pack ships. */
export function serialiseCases(days: DayCase[]): string {
  const file: RawFile = {
    schema_version: '2.1',
    problem_id: 'P11',
    cases: days.map(toRawCase),
  };
  return JSON.stringify(file, null, 2);
}

/** A tiny, valid starting point for someone writing a day from scratch. */
export function blankCaseTemplate(): string {
  const areas = ['Gulshan', 'Motijheel', 'Mirpur'];
  const template: RawFile = {
    schema_version: '2.1',
    problem_id: 'P11',
    cases: [
      {
        case_id: 'MY-DAY-01',
        today: new Date().toISOString().slice(0, 10),
        areas,
        travel_minutes: {
          Gulshan: { Gulshan: 0, Motijheel: 45, Mirpur: 35 },
          Motijheel: { Gulshan: 45, Motijheel: 0, Mirpur: 60 },
          Mirpur: { Gulshan: 35, Motijheel: 60, Mirpur: 0 },
        },
        technicians: [
          { id: 'T01', name: 'Rafiq', skills: ['ac', 'plumbing'], shift_start: '09:00', shift_end: '18:00', home_area: 'Gulshan' },
          { id: 'T02', name: 'Sumon', skills: ['plumbing'], shift_start: '08:00', shift_end: '17:00', home_area: 'Motijheel' },
        ],
        jobs: [
          { id: 'J01', area: 'Mirpur', skill: 'ac', duration_minutes: 60, window_start: '10:00', window_end: '13:00' },
          { id: 'J02', area: 'Motijheel', skill: 'plumbing', duration_minutes: 90, window_start: '09:30', window_end: '12:00' },
          { id: 'J03', area: 'Gulshan', skill: 'electrical', duration_minutes: 45, window_start: '11:00', window_end: '15:00' },
        ],
        manual_move: { job_id: 'J01', to_technician: 'T02' },
      },
    ],
  };
  return JSON.stringify(template, null, 2);
}
