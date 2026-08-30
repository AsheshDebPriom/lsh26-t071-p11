import { checkFeasible } from './feasibility';
import { formatDuration, formatSpan, formatTime } from './time';
import { travelMinutes } from './travel';
import type {
  Area,
  Assignment,
  BlockedJob,
  DayCase,
  FeasibilityResult,
  Job,
  Plan,
  RuleName,
  RuleOptions,
  Technician,
  TravelMatrix,
} from './types';
import { DEFAULT_RULES, skillLabel } from './types';

/** Plan construction, mutation and diagnosis. All rules come from checkFeasible. */

export function indexJobs(jobs: Job[]): Record<string, Job> {
  const out: Record<string, Job> = {};
  for (const j of jobs) out[j.id] = j;
  return out;
}

export function emptyPlan(
  technicians: Technician[],
  jobs: Job[],
  travel: TravelMatrix,
  rules: RuleOptions = DEFAULT_RULES,
): Plan {
  const routes: Record<string, Assignment[]> = {};
  for (const t of technicians) routes[t.id] = [];
  return { routes, jobs: indexJobs(jobs), travel, rules, blocked: [], totalTravelMin: 0 };
}

/** An empty plan for a whole case, using the rule policy the case declares. */
export function emptyPlanForCase(day: DayCase, rules?: RuleOptions): Plan {
  return emptyPlan(day.technicians, day.jobs, day.travel, rules ?? day.defaultRules ?? DEFAULT_RULES);
}

/** Job ids on a technician's day, in route order. */
export function routeJobIds(plan: Plan, techId: string): string[] {
  return (plan.routes[techId] ?? []).map((a) => a.jobId);
}

export function assignedJobIds(plan: Plan): Set<string> {
  const s = new Set<string>();
  for (const route of Object.values(plan.routes)) for (const a of route) s.add(a.jobId);
  return s;
}

export function findTechForJob(plan: Plan, jobId: string): string | null {
  for (const [techId, route] of Object.entries(plan.routes)) {
    if (route.some((a) => a.jobId === jobId)) return techId;
  }
  return null;
}

/**
 * Rebuild a technician's day from an ordered list of job ids, taking the
 * earliest legal start for each. Pure forward pass — it does not validate,
 * because every order handed to it has already been cleared by checkFeasible.
 */
export function recomputeRoute(
  tech: Technician,
  jobIds: string[],
  jobs: Record<string, Job>,
  travel: TravelMatrix,
): Assignment[] {
  const out: Assignment[] = [];
  let area = tech.homeArea;
  let departure = tech.shiftStart;
  for (const jobId of jobIds) {
    const job = jobs[jobId];
    if (!job) continue;
    const travelMin = travelMinutes(travel, area, job.area);
    const arrival = departure + travelMin;
    const start = Math.max(arrival, job.windowStart);
    const finish = start + job.durationMin;
    out.push({ jobId, techId: tech.id, fromArea: area, travelMin, departure, arrival, start, finish });
    area = job.area;
    departure = finish;
  }
  return out;
}

/**
 * Travel minutes for one technician's day. The leg home counts only when the
 * return-home rule is in force, so the objective always measures exactly the
 * driving the rules require.
 */
export function routeTravel(tech: Technician, route: Assignment[], plan: Plan): number {
  if (route.length === 0) return 0;
  let total = 0;
  for (const a of route) total += a.travelMin;
  if (plan.rules.requireReturnHome) {
    const lastJob = plan.jobs[route[route.length - 1].jobId];
    if (lastJob) total += travelMinutes(plan.travel, lastJob.area, tech.homeArea);
  }
  return total;
}

/** The objective: total travel minutes across every technician. Lower is better. */
export function totalTravel(plan: Plan, technicians: Technician[]): number {
  let total = 0;
  for (const t of technicians) total += routeTravel(t, plan.routes[t.id] ?? [], plan);
  return total;
}

/** Idle minutes: on shift, not travelling, not working. */
export function totalIdle(plan: Plan, technicians: Technician[]): number {
  let idle = 0;
  for (const t of technicians) {
    const route = plan.routes[t.id] ?? [];
    const shift = Math.max(0, t.shiftEnd - t.shiftStart);
    let busy = 0;
    for (const a of route) {
      busy += a.travelMin + (a.finish - a.start);
    }
    if (route.length > 0 && plan.rules.requireReturnHome) {
      const lastJob = plan.jobs[route[route.length - 1].jobId];
      if (lastJob) busy += travelMinutes(plan.travel, lastJob.area, t.homeArea);
    }
    idle += Math.max(0, shift - busy);
  }
  return idle;
}

/** A plan identical to `plan` but with `techId`'s day cleared. Used for what-ifs. */
export function withEmptyRoute(plan: Plan, techId: string): Plan {
  return { ...plan, routes: { ...plan.routes, [techId]: [] } };
}

/** A plan with `jobId` lifted off whichever technician holds it. */
export function withoutJob(plan: Plan, jobId: string, technicians: Technician[]): Plan {
  const techId = findTechForJob(plan, jobId);
  if (!techId) return plan;
  const tech = technicians.find((t) => t.id === techId);
  if (!tech) return plan;
  const remaining = routeJobIds(plan, techId).filter((id) => id !== jobId);
  return {
    ...plan,
    routes: { ...plan.routes, [techId]: recomputeRoute(tech, remaining, plan.jobs, plan.travel) },
  };
}

export interface Placement {
  techId: string;
  /** Index in the technician's route the job would take. */
  position: number;
  result: Extract<FeasibilityResult, { ok: true }>;
  /** Extra travel minutes this placement costs the fleet. The greedy criterion. */
  addedTravel: number;
}

/** The job that would precede `position` in a technician's route, or null. */
function predecessor(plan: Plan, tech: Technician, position: number): Job | null {
  const route = plan.routes[tech.id] ?? [];
  if (position === 0) return null;
  const prev = route[position - 1];
  return prev ? (plan.jobs[prev.jobId] ?? null) : null;
}

/** Cost of dropping `job` into `tech`'s day at `position`, if the rules allow it. */
export function tryPlacement(
  plan: Plan,
  job: Job,
  tech: Technician,
  position: number,
): { ok: true; placement: Placement } | { ok: false; rule: RuleName; detail: string } {
  const res = checkFeasible(job, tech, predecessor(plan, tech, position), plan);
  if (!res.ok) return res;

  const before = routeTravel(tech, plan.routes[tech.id] ?? [], plan);
  const nextIds = [...routeJobIds(plan, tech.id)];
  nextIds.splice(position, 0, job.id);
  const after = routeTravel(tech, recomputeRoute(tech, nextIds, plan.jobs, plan.travel), plan);

  return { ok: true, placement: { techId: tech.id, position, result: res, addedTravel: after - before } };
}

/** Commit a placement. The technician's day is rebuilt so every derived time is fresh. */
export function applyPlacement(plan: Plan, tech: Technician, job: Job, position: number): Plan {
  const ids = [...routeJobIds(plan, tech.id)];
  ids.splice(position, 0, job.id);
  return { ...plan, routes: { ...plan.routes, [tech.id]: recomputeRoute(tech, ids, plan.jobs, plan.travel) } };
}

/** The cheapest legal home for `job` on `tech`'s day, or the reason there is none. */
export function bestPlacementOnTech(
  plan: Plan,
  job: Job,
  tech: Technician,
): { ok: true; placement: Placement } | { ok: false; rule: RuleName; detail: string } {
  const route = plan.routes[tech.id] ?? [];
  let best: Placement | null = null;
  let firstFailure: { rule: RuleName; detail: string } | null = null;
  let closestFailure: { rule: RuleName; detail: string } | null = null;

  for (let position = 0; position <= route.length; position++) {
    const attempt = tryPlacement(plan, job, tech, position);
    if (attempt.ok) {
      if (!best || attempt.placement.addedTravel < best.addedTravel) best = attempt.placement;
    } else {
      if (!firstFailure) firstFailure = attempt;
      if (!closestFailure || RULE_CLOSENESS[attempt.rule] > RULE_CLOSENESS[closestFailure.rule]) {
        closestFailure = attempt;
      }
    }
  }
  if (best) return { ok: true, placement: best };
  return { ok: false, ...(closestFailure ?? firstFailure ?? { rule: 'OVERLAPS_JOB' as RuleName, detail: 'No position available.' }) };
}

/** The cheapest legal home for `job` anywhere in the fleet. */
export function bestPlacement(plan: Plan, job: Job, technicians: Technician[]): Placement | null {
  let best: Placement | null = null;
  for (const tech of technicians) {
    const attempt = bestPlacementOnTech(plan, job, tech);
    if (attempt.ok && (!best || attempt.placement.addedTravel < best.addedTravel)) {
      best = attempt.placement;
    }
  }
  return best;
}

/**
 * How close a rule is to "it would have worked".
 *
 * SKILL_MISMATCH is a fact about the technician; OVERLAPS_JOB means everything
 * about the job was fine and only today's other commitments got in the way.
 * When several technicians reject a job for different reasons, the dispatcher
 * wants to hear from the one who came closest — so the highest score wins.
 */
const RULE_CLOSENESS: Record<RuleName, number> = {
  SKILL_MISMATCH: 0,
  OUTSIDE_SHIFT: 1,
  WINDOW_MISSED: 2,
  NO_RETURN_TIME: 3,
  OVERLAPS_JOB: 4,
};

/**
 * Why a job is not on the board, and the exact rule that blocked it.
 *
 * Each technician gets one verdict:
 *   - if the job fails even against an EMPTY day for them, that failure is the
 *     verdict — it is structural and no amount of reshuffling would fix it;
 *   - otherwise they could have done it alone, so the verdict is what today's
 *     actual plan does to them, which is a capacity problem.
 *
 * The headline rule is the verdict from the technician who came closest.
 */
export function diagnose(job: Job, technicians: Technician[], plan: Plan): BlockedJob {
  const perTech: BlockedJob['perTech'] = [];
  let nowPlaceable: BlockedJob['nowPlaceable'];

  for (const tech of technicians) {
    const onEmptyDay = checkFeasible(job, tech, null, withEmptyRoute(plan, tech.id));

    // Structural: this technician could not take the job even with a clear day.
    if (!onEmptyDay.ok) {
      perTech.push({ techId: tech.id, rule: onEmptyDay.rule, detail: onEmptyDay.detail });
      continue;
    }

    // Capacity: the job suits them, so whatever blocks it is today's other work.
    const real = bestPlacementOnTech(plan, job, tech);
    if (real.ok) {
      if (!nowPlaceable || real.placement.result.start < nowPlaceable.start) {
        nowPlaceable = {
          techId: tech.id,
          position: real.placement.position,
          start: real.placement.result.start,
        };
      }
      perTech.push({
        techId: tech.id,
        rule: 'OVERLAPS_JOB',
        detail: `Has room — could start ${formatTime(real.placement.result.start)}.`,
      });
    } else {
      perTech.push({
        techId: tech.id,
        rule: 'OVERLAPS_JOB',
        detail: describeClash(job, tech, plan, onEmptyDay.start),
      });
    }
  }

  const qualified = technicians.filter((t) => t.skills.includes(job.skill));
  if (qualified.length === 0) {
    return {
      jobId: job.id,
      rule: 'SKILL_MISMATCH',
      detail:
        `No technician on today’s roster holds ${skillLabel(job.skill)}. ` +
        `All ${technicians.length} were checked.`,
      perTech,
    };
  }

  const considered = perTech.filter((v) => qualified.some((t) => t.id === v.techId));
  let headline = considered[0];
  for (const v of considered) {
    if (RULE_CLOSENESS[v.rule] > RULE_CLOSENESS[headline.rule]) headline = v;
  }
  const closestTech = technicians.find((t) => t.id === headline.techId);
  const tail =
    headline.rule === 'OVERLAPS_JOB'
      ? ` All ${qualified.length} qualified technicians are committed or off shift.`
      : '';

  return {
    jobId: job.id,
    rule: headline.rule,
    detail: `${closestTech?.name ?? headline.techId} came closest — ${headline.detail}${tail}`,
    perTech,
    nowPlaceable,
  };
}

/**
 * What a technician is actually doing when a job they are qualified for cannot
 * fit. A dispatcher wants the clash named, not an insertion-position autopsy.
 */
function describeClash(job: Job, tech: Technician, plan: Plan, couldStartAt: number): string {
  const route = plan.routes[tech.id] ?? [];
  // The stretch of the day this job would have to occupy, at the earliest and
  // at the latest the customer window allows.
  const from = job.windowStart;
  const to = job.windowEnd + job.durationMin;
  const clashes = route
    .filter((a) => a.departure < to && a.finish > from)
    .slice(0, 2)
    .map((a) => {
      const other = plan.jobs[a.jobId];
      return `${other?.code ?? a.jobId} in ${other?.area ?? 'the field'} ${formatSpan(a.start, a.finish)}`;
    });

  const opening = `free at ${formatTime(couldStartAt)} with a clear day, but`;
  if (clashes.length === 0) {
    const last = route[route.length - 1];
    const lastJob = last ? plan.jobs[last.jobId] : undefined;
    return last && lastJob
      ? `${opening} today’s route ends on ${lastJob.code} in ${lastJob.area} at ` +
          `${formatTime(last.finish)}, ${formatDuration(travelMinutes(plan.travel, lastJob.area, job.area))} from ${job.area}.`
      : `${opening} no legal position exists in today’s route.`;
  }
  return `${opening} today is already on ${clashes.join(' and ')}.`;
}

/** Recompute travel and the blocked list for whatever is currently on the board. */
export function refreshPlan(plan: Plan, technicians: Technician[], jobs: Job[]): Plan {
  const placed = assignedJobIds(plan);
  const blocked = jobs.filter((j) => !placed.has(j.id)).map((j) => diagnose(j, technicians, plan));
  return { ...plan, blocked, totalTravelMin: totalTravel(plan, technicians) };
}

// ---- Timeline rendering model ------------------------------------------

export type SegmentKind = 'travel' | 'idle' | 'job';

export interface Segment {
  kind: SegmentKind;
  from: number;
  to: number;
  jobId?: string;
  /** For travel legs: where the technician is coming from and going to. */
  fromArea?: Area;
  toArea?: Area;
}

/**
 * One technician's shift as an unbroken sequence of travel, idle and job
 * blocks. Every minute of the shift is accounted for, so the board can never
 * show a gap it has not named.
 */
export function buildTimeline(tech: Technician, plan: Plan): Segment[] {
  const route = plan.routes[tech.id] ?? [];
  const segments: Segment[] = [];
  let cursor = tech.shiftStart;
  let area: Area = tech.homeArea;

  for (const a of route) {
    const job = plan.jobs[a.jobId];
    if (!job) continue;
    if (a.departure > cursor) segments.push({ kind: 'idle', from: cursor, to: a.departure });
    if (a.travelMin > 0) {
      segments.push({ kind: 'travel', from: a.departure, to: a.arrival, fromArea: area, toArea: job.area });
    }
    if (a.start > a.arrival) segments.push({ kind: 'idle', from: a.arrival, to: a.start });
    segments.push({ kind: 'job', from: a.start, to: a.finish, jobId: a.jobId });
    cursor = a.finish;
    area = job.area;
  }

  // The leg home, then whatever is left of the shift.
  if (route.length > 0 && plan.rules.requireReturnHome) {
    const home = travelMinutes(plan.travel, area, tech.homeArea);
    if (home > 0) {
      segments.push({ kind: 'travel', from: cursor, to: cursor + home, fromArea: area, toArea: tech.homeArea });
      cursor += home;
    }
  }
  if (cursor < tech.shiftEnd) segments.push({ kind: 'idle', from: cursor, to: tech.shiftEnd });

  return segments;
}
