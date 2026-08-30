import {
  applyPlacement,
  bestPlacement,
  emptyPlan,
  recomputeRoute,
  refreshPlan,
  routeJobIds,
} from './plan';
import type { Job, Plan, Technician } from './types';

/**
 * The two disruptions a dispatcher actually gets before nine in the morning,
 * and one they get at lunchtime. Both are pure functions over a Plan: nothing
 * here mutates, and every replacement placement still goes through
 * checkFeasible by way of bestPlacement.
 */

export interface ReplanOutcome {
  plan: Plan;
  /** Jobs that were lifted and found a new home. */
  rehomed: { jobId: string; techId: string }[];
  /** Jobs that were lifted and could not be placed again. The blocked list says why. */
  stranded: string[];
}

/** Deadline order, the same order the solver offers jobs to the fleet in. */
function byDeadline(jobs: Job[]): Job[] {
  return [...jobs].sort(
    (a, b) =>
      a.windowEnd - b.windowEnd ||
      a.windowStart - b.windowStart ||
      a.durationMin - b.durationMin ||
      a.id.localeCompare(b.id),
  );
}

/**
 * A technician calls in sick. Their day is cleared and every job on it is
 * offered to the technicians still on shift, tightest deadline first, each
 * landing wherever it adds the least travel. Anything that will not fit lands
 * in the blocked list with the rule that stopped it.
 *
 * @param nowMinutes when set, work already under way stays put — you cannot
 *                   unsend a technician who is already inside the building.
 */
export function callInSick(
  plan: Plan,
  allTechnicians: Technician[],
  jobs: Job[],
  sickTechId: string,
  alreadySick: ReadonlySet<string>,
  nowMinutes: number | null = null,
): ReplanOutcome {
  const sick = new Set([...alreadySick, sickTechId]);
  const remaining = allTechnicians.filter((t) => !sick.has(t.id));

  const route = plan.routes[sickTechId] ?? [];
  const lifted = route
    .filter((a) => nowMinutes === null || a.start > nowMinutes)
    .map((a) => plan.jobs[a.jobId])
    .filter((j): j is Job => Boolean(j));
  const stays = route.filter((a) => nowMinutes !== null && a.start <= nowMinutes);

  const sickTech = allTechnicians.find((t) => t.id === sickTechId);
  let next: Plan = {
    ...plan,
    routes: {
      ...plan.routes,
      [sickTechId]: sickTech ? recomputeRoute(sickTech, stays.map((a) => a.jobId), plan.jobs, plan.travel) : [],
    },
  };

  const rehomed: ReplanOutcome['rehomed'] = [];
  const stranded: string[] = [];

  for (const job of byDeadline(lifted)) {
    const landing = bestPlacement(next, job, remaining);
    if (!landing) {
      stranded.push(job.id);
      continue;
    }
    const tech = remaining.find((t) => t.id === landing.techId)!;
    next = applyPlacement(next, tech, job, landing.position);
    rehomed.push({ jobId: job.id, techId: tech.id });
  }

  return { plan: refreshPlan(next, remaining, jobs), rehomed, stranded };
}

export interface EmergencyOutcome extends ReplanOutcome {
  /** Whether the emergency job itself found a technician. */
  placed: boolean;
  /** How many already-started jobs were left exactly where they were. */
  untouched: number;
}

/**
 * An emergency call arrives mid-day. Everything already under way at
 * `nowMinutes` stays exactly where it is — those technicians are on site and
 * the customer has the door open. Everything not yet started is lifted and
 * replanned together with the emergency, which is offered first because it is
 * the reason for the replan.
 */
export function insertEmergency(
  plan: Plan,
  technicians: Technician[],
  jobs: Job[],
  emergency: Job,
  nowMinutes: number,
): EmergencyOutcome {
  const allJobs = [...jobs, emergency];

  // Split the board at `now`.
  const keptByTech: Record<string, string[]> = {};
  const lifted: Job[] = [];
  let untouched = 0;

  for (const tech of technicians) {
    keptByTech[tech.id] = [];
    for (const a of plan.routes[tech.id] ?? []) {
      const job = plan.jobs[a.jobId];
      if (!job) continue;
      if (a.start <= nowMinutes) {
        keptByTech[tech.id].push(a.jobId);
        untouched++;
      } else {
        lifted.push(job);
      }
    }
  }

  // Rebuild with only the work that is already under way, then replan the rest.
  let next = emptyPlan(technicians, allJobs, plan.travel, plan.rules);
  for (const tech of technicians) {
    next = {
      ...next,
      routes: {
        ...next.routes,
        [tech.id]: recomputeRoute(tech, keptByTech[tech.id] ?? [], next.jobs, next.travel),
      },
    };
  }

  const rehomed: ReplanOutcome['rehomed'] = [];
  const stranded: string[] = [];
  let placed = false;

  // The emergency goes first — it is why we are replanning.
  const queue = [emergency, ...byDeadline(lifted)];
  for (const job of queue) {
    const landing = bestPlacement(next, job, technicians);
    if (!landing) {
      stranded.push(job.id);
      continue;
    }
    const tech = technicians.find((t) => t.id === landing.techId)!;
    next = applyPlacement(next, tech, job, landing.position);
    if (job.id === emergency.id) placed = true;
    else rehomed.push({ jobId: job.id, techId: tech.id });
  }

  return { plan: refreshPlan(next, technicians, allJobs), rehomed, stranded, placed, untouched };
}

/** Job ids on the board that have already started at `nowMinutes`. */
export function startedJobIds(plan: Plan, technicians: Technician[], nowMinutes: number): Set<string> {
  const out = new Set<string>();
  for (const tech of technicians) {
    for (const a of plan.routes[tech.id] ?? []) {
      if (a.start <= nowMinutes) out.add(a.jobId);
    }
  }
  return out;
}

export { routeJobIds };
