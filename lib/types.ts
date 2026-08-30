/**
 * P11 — Route and Shift Assignment Optimiser.
 *
 * TIME MODEL: every time in this codebase is an integer number of minutes from
 * midnight. 540 is 09:00. There is no `Date` object anywhere in scheduling,
 * feasibility or rendering maths — window checks, travel addition and shift
 * bounds are plain integer comparisons. Minutes become a string only inside
 * `formatTime()` in lib/time.ts, at the last possible moment.
 */

export const AREAS = [
  'Mirpur',
  'Uttara',
  'Gulshan',
  'Banani',
  'Dhanmondi',
  'Mohammadpur',
  'Bashundhara',
  'Motijheel',
] as const;

export type Area = (typeof AREAS)[number];

export const SKILLS = ['AC_SERVICE', 'AC_INSTALL', 'PLUMBING', 'ELECTRICAL'] as const;

export type Skill = (typeof SKILLS)[number];

export const SKILL_LABEL: Record<Skill, string> = {
  AC_SERVICE: 'AC service',
  AC_INSTALL: 'AC install',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
};

export interface Technician {
  id: string;
  /** Short display name used in rule messages: "Rafiq cannot reach..." */
  name: string;
  skills: Skill[];
  /** Minutes from midnight. Shift clock starts here, at the home area. */
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
  blocked: BlockedJob[];
  /**
   * The objective. Sum of every travel leg, including the final leg home,
   * across all technicians. Lower is better.
   */
  totalTravelMin: number;
}
