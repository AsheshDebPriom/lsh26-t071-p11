/**
 * P11 — Route and Shift Assignment Optimiser.
 *
 * TIME MODEL: every time in this codebase is an integer number of minutes from
 * midnight. 540 is 09:00. There is no `Date` object anywhere in scheduling,
 * feasibility or rendering maths — window checks, travel addition and shift
 * bounds are plain integer comparisons. Minutes become a string only inside
 * `formatTime()` in lib/time.ts, at the last possible moment.
 *
 * Areas and skills are plain strings, not unions: the published case file
 * supplies its own vocabulary per case (twelve areas across the set, and the
 * skills ac / plumbing / electrical / gas_line) and the app has to take the
 * data as it is given.
 */

export type Area = string;
export type Skill = string;

/** Symmetric area-to-area travel time in minutes, keyed by area name. */
export type TravelMatrix = Record<Area, Record<Area, number>>;

/** Skills the seeded demo day uses. Case files may name others. */
export const KNOWN_SKILLS = ['ac', 'plumbing', 'electrical', 'gas_line'] as const;

const SKILL_LABELS: Record<string, string> = {
  ac: 'AC service',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  gas_line: 'Gas line',
  // The crafted demo day splits AC work the way the trade actually does.
  AC_SERVICE: 'AC service',
  AC_INSTALL: 'AC install',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
};

/** Human label for a skill code, falling back to a tidied version of the code. */
export function skillLabel(skill: Skill): string {
  return SKILL_LABELS[skill] ?? skill.replace(/_/g, ' ');
}

export interface Technician {
  id: string;
  /** Short display name, used in rule messages: "Rafiq cannot reach..." */
  name: string;
  skills: Skill[];
  /** Minutes from midnight. The shift clock starts here, at the home area. */
  shiftStart: number;
  shiftEnd: number;
  homeArea: Area;
}

export interface Job {
  id: string;
  /** Board label, e.g. "J-07". */
  code: string;
  customer: string;
  area: Area;
  skill: Skill;
  durationMin: number;
  /** Customer time window, minutes from midnight. The job must START inside it. */
  windowStart: number;
  windowEnd: number;
}

/** A job placed on a technician's day, with every derived time resolved. */
export interface Assignment {
  jobId: string;
  techId: string;
  /** Where the technician travelled from to reach this job. */
  fromArea: Area;
  travelMin: number;
  /** Departure from `fromArea`. */
  departure: number;
  /** Arrival at the job's area. */
  arrival: number;
  /** Work start = max(arrival, windowStart). Idle time is start - arrival. */
  start: number;
  finish: number;
}

export type RuleName =
  | 'SKILL_MISMATCH'
  | 'OUTSIDE_SHIFT'
  | 'WINDOW_MISSED'
  | 'OVERLAPS_JOB'
  | 'NO_RETURN_TIME';

export const RULE_ORDER: RuleName[] = [
  'SKILL_MISMATCH',
  'WINDOW_MISSED',
  'OUTSIDE_SHIFT',
  'OVERLAPS_JOB',
  'NO_RETURN_TIME',
];

export const RULE_LABEL: Record<RuleName, string> = {
  SKILL_MISMATCH: 'Skill mismatch',
  OUTSIDE_SHIFT: 'Outside shift hours',
  WINDOW_MISSED: 'Customer window missed',
  OVERLAPS_JOB: 'Overlaps another job',
  NO_RETURN_TIME: 'No time to return home',
};

/** One line of plain English per rule, shown in the board legend. */
export const RULE_MEANING: Record<RuleName, string> = {
  SKILL_MISMATCH: 'The technician does not hold the skill the job requires.',
  OUTSIDE_SHIFT: 'Work would start before, or finish after, the technician’s shift.',
  WINDOW_MISSED: 'The technician cannot arrive before the customer window closes.',
  OVERLAPS_JOB: 'The technician is already committed to another job at that time.',
  NO_RETURN_TIME: 'The technician could not reach their home area before shift end.',
};

/**
 * Rules that the published case format leaves to the implementer.
 *
 * `requireReturnHome` is OFF by default. The published format note for P11 says
 * "the travel table is authoritative and symmetric; no return home is required",
 * and a published clarification is part of the specification. The rule is still
 * implemented and still tested, and the dispatcher can switch it on to see what
 * an end-of-shift return policy would cost.
 */
export interface RuleOptions {
  requireReturnHome: boolean;
}

export const DEFAULT_RULES: RuleOptions = { requireReturnHome: false };

export type FeasibilityResult =
  | { ok: true; arrival: number; start: number; finish: number; travelMin: number }
  | { ok: false; rule: RuleName; detail: string };

/** Why one job could not be placed anywhere, and the closest near-miss. */
export interface BlockedJob {
  jobId: string;
  rule: RuleName;
  detail: string;
  /** Per-technician verdicts, so a dispatcher can audit the decision. */
  perTech: { techId: string; rule: RuleName; detail: string }[];
  /**
   * Set when the rules would allow this job right now — normally after the
   * dispatcher has moved something by hand and freed a slot. The job is
   * unassigned, but not blocked.
   */
  nowPlaceable?: { techId: string; position: number; start: number };
}

export interface Plan {
  /** techId -> assignments in route order. Invariant: sorted by `start`. */
  routes: Record<string, Assignment[]>;
  /** Every job in the day, by id. Lets a Plan answer questions on its own. */
  jobs: Record<string, Job>;
  /** The authoritative travel table for this case. */
  travel: TravelMatrix;
  /** Which optional rules are in force. */
  rules: RuleOptions;
  blocked: BlockedJob[];
  /**
   * The objective. Sum of every travel leg between jobs across all technicians,
   * plus the leg home when the return-home rule is in force. Lower is better.
   */
  totalTravelMin: number;
}

/** One day's worth of dispatch: the roster, the jobs and the travel table. */
export interface DayCase {
  id: string;
  label: string;
  /** ISO date the case is set on. Display only — all maths is minutes. */
  today: string;
  areas: Area[];
  travel: TravelMatrix;
  technicians: Technician[];
  jobs: Job[];
  /** The scripted manual move published with the case, for requirement 4. */
  manualMove?: { jobId: string; toTechnicianId: string };
  /** Where this case came from, shown on screen so nothing is passed off as ours. */
  source: 'published' | 'crafted';
  /** Rule policy this case is authored against. See RuleOptions. */
  defaultRules?: RuleOptions;
  note?: string;
}
