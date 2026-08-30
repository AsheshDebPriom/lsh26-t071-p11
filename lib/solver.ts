import {
  applyPlacement,
  assignedJobIds,
  bestPlacement,
  bestPlacementOnTech,
  emptyPlan,
  refreshPlan,
  routeJobIds,
  recomputeRoute,
  routeTravel,
  totalTravel,
  tryPlacement,
  withoutJob,
} from './plan';
import type { DayCase, Job, Plan, RuleOptions, Technician, TravelMatrix } from './types';

/**
 * THE STATED GOAL
 * ---------------
 * Minimise total travel time across all technicians, counting every leg of the
 * day including the drive home, while placing as many jobs as the hard rules
 * allow. Travel is the number the dispatcher is actually losing money on: it is
 * unpaid, it is what makes technicians cross the city past each other, and it
 * is the direct cause of missed windows later in the day.
 *
 * Jobs placed is the primary term and travel is the tie-break: a plan that
 * drops a job to save fifteen minutes of driving is not a better plan.
 */

/** Cap on each half of the improvement pass, so a bad day can never hang the browser. */
export const MAX_SWAP_ITERATIONS = 200;

export interface SolveStats {
  assigned: number;
  blocked: number;
  totalTravelMin: number;
  /** Travel before the improvement pass ran, so its contribution is visible. */
  greedyTravelMin: number;
  swapsApplied: number;
  swapIterations: number;
  relocationsApplied: number;
  relocationIterations: number;
  /** Which job ordering produced this plan. See `orderings`. */
  ordering: string;
}

export interface SolveOutcome {
  plan: Plan;
  stats: SolveStats;
}

/**
 * Greedy insertion, then one improvement pass.
 *
 * Pass 1 — take the jobs in order (tightest deadline first) and give each one to
 * the technician and route position where it adds the least travel. Every
 * candidate is cleared by checkFeasible, so nothing infeasible is ever placed.
 *
 * Pass 2 — the improvement pass, in two halves. First, for each pair of assigned
 * jobs, try exchanging their technicians. Then, for each single job, try
 * relocating it to a different technician. A move is kept only when everything
 * stays feasible and total travel drops. Each half is capped at
 * MAX_SWAP_ITERATIONS so a pathological day can never hang the browser.
 *
 * Pass 3 — a final sweep that retries anything still unplaced against the
 * rearranged board, because moving work about can open a slot that was shut
 * when a job was first considered.
 */
export function solveCase(day: DayCase, rules?: RuleOptions): SolveOutcome {
  return solve(day.technicians, day.jobs, day.travel, rules ?? day.defaultRules);
}

/**
 * The order jobs are offered to the fleet. The first entry is the order the
 * design calls for — tightest deadline first — and it wins on most days. The
 * rest are restarts: greedy insertion commits a technician before it has seen
 * the whole day, so a different order occasionally fits one more job in. The
 * best candidate is kept, and "best" means more jobs placed first, less travel
 * second. A plan that drops a call to save fifteen minutes of driving is not a
 * better plan.
 */
function orderings(technicians: Technician[]): { name: string; sort: (a: Job, b: Job) => number }[] {
  const qualifiedCount = (j: Job) => technicians.filter((t) => t.skills.includes(j.skill)).length;
  return [
    {
      name: 'tightest deadline first',
      sort: (a, b) =>
        a.windowEnd - b.windowEnd ||
        a.windowStart - b.windowStart ||
        a.durationMin - b.durationMin ||
        a.id.localeCompare(b.id),
    },
    {
      name: 'narrowest window first',
      sort: (a, b) =>
        a.windowEnd - a.windowStart - (b.windowEnd - b.windowStart) ||
        a.windowEnd - b.windowEnd ||
        a.id.localeCompare(b.id),
    },
    {
      name: 'longest job first',
      sort: (a, b) => b.durationMin - a.durationMin || a.windowEnd - b.windowEnd || a.id.localeCompare(b.id),
    },
    {
      name: 'scarcest skill first',
      sort: (a, b) =>
        qualifiedCount(a) - qualifiedCount(b) || a.windowEnd - b.windowEnd || a.id.localeCompare(b.id),
    },
  ];
}

export function solve(
  technicians: Technician[],
  jobs: Job[],
  travel: TravelMatrix,
  rules?: RuleOptions,
): SolveOutcome {
  let best: SolveOutcome | null = null;

  for (const ordering of orderings(technicians)) {
    const candidate = solveWithOrder(technicians, jobs, travel, ordering, rules);
    if (
      !best ||
      candidate.stats.assigned > best.stats.assigned ||
      (candidate.stats.assigned === best.stats.assigned &&
        candidate.stats.totalTravelMin < best.stats.totalTravelMin)
    ) {
      best = candidate;
    }
  }

  return best!;
}

function solveWithOrder(
  technicians: Technician[],
  jobs: Job[],
  travel: TravelMatrix,
  ordering: { name: string; sort: (a: Job, b: Job) => number },
  rules?: RuleOptions,
): SolveOutcome {
  let plan = emptyPlan(technicians, jobs, travel, rules);

  const queue = [...jobs].sort(ordering.sort);

  // Pass 1 — greedy insertion. Each job goes to the technician and route
  // position where it adds the least travel, and only where the rules allow.
  for (const job of queue) {
    const best = bestPlacement(plan, job, technicians);
    if (!best) continue; // no legal home anywhere; the blocked list will say why
    const tech = technicians.find((t) => t.id === best.techId)!;
    plan = applyPlacement(plan, tech, job, best.position);
  }

  const greedyTravelMin = totalTravel(plan, technicians);

  // Pass 2 — the improvement pass, in two halves.
  const swap = improveBySwapping(plan, technicians);
  const reloc = improveByRelocating(swap.plan, technicians);
  plan = reloc.plan;

  // Final sweep. Moving work around can open a slot that was closed when a job
  // was first considered, and nothing should sit in the blocked list while the
  // rules would allow it somewhere.
  const onBoard = assignedJobIds(plan);
  for (const job of queue) {
    if (onBoard.has(job.id)) continue;
    const landing = bestPlacement(plan, job, technicians);
    if (!landing) continue;
    plan = applyPlacement(plan, technicians.find((t) => t.id === landing.techId)!, job, landing.position);
  }

  plan = refreshPlan(plan, technicians, jobs);

  const assigned = Object.values(plan.routes).reduce((n, r) => n + r.length, 0);
  return {
    plan,
    stats: {
      assigned,
      blocked: plan.blocked.length,
      totalTravelMin: plan.totalTravelMin,
      greedyTravelMin,
      swapsApplied: swap.swapsApplied,
      swapIterations: swap.iterations,
      relocationsApplied: reloc.applied,
      relocationIterations: reloc.iterations,
      ordering: ordering.name,
    },
  };
}

/**
 * Second half of the improvement pass: lift one job and try it on every other
 * technician, keeping the first move that lowers total travel. Greedy insertion
 * commits to a technician before it has seen the rest of the day's jobs, so
 * this is where those early commitments get revisited.
 */
function improveByRelocating(
  start: Plan,
  technicians: Technician[],
): { plan: Plan; applied: number; iterations: number } {
  let plan = start;
  let applied = 0;
  let iterations = 0;

  const jobsOnBoard = Object.entries(plan.routes).flatMap(([techId, route]) =>
    route.map((a) => ({ jobId: a.jobId, techId })),
  );

  for (const { jobId, techId } of jobsOnBoard) {
    if (iterations >= MAX_SWAP_ITERATIONS) break;
    // An earlier relocation in this pass may already have moved it.
    if (!routeJobIds(plan, techId).includes(jobId)) continue;

    const job = plan.jobs[jobId];
    if (!job) continue;
    const before = totalTravel(plan, technicians);
    const lifted = withoutJob(plan, jobId, technicians);

    for (const tech of technicians) {
      if (tech.id === techId) continue;
      if (iterations >= MAX_SWAP_ITERATIONS) break;
      iterations++;

      const land = bestPlacementOnTech(lifted, job, tech);
      if (!land.ok) continue;
      const candidate = applyPlacement(lifted, tech, job, land.placement.position);
      if (totalTravel(candidate, technicians) < before) {
        plan = candidate;
        applied++;
        break;
      }
    }
  }

  return { plan, applied, iterations };
}

/**
 * One swap pass over every pair of assigned jobs. First-improvement: an
 * exchange is committed as soon as it is found to be legal and cheaper.
 */
function improveBySwapping(
  start: Plan,
  technicians: Technician[],
): { plan: Plan; swapsApplied: number; iterations: number } {
  let plan = start;
  let swapsApplied = 0;
  let iterations = 0;

  const byId = new Map(technicians.map((t) => [t.id, t]));
  const placed = () =>
    Object.entries(plan.routes).flatMap(([techId, route]) =>
      route.map((a, position) => ({ jobId: a.jobId, techId, position })),
    );

  const pairs = placed();
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (iterations >= MAX_SWAP_ITERATIONS) {
        return { plan, swapsApplied, iterations };
      }

      const a = pairs[i];
      const b = pairs[j];
      // Exchanging two jobs on the same technician changes no travel.
      if (a.techId === b.techId) continue;

      const techA = byId.get(a.techId);
      const techB = byId.get(b.techId);
      const jobA = plan.jobs[a.jobId];
      const jobB = plan.jobs[b.jobId];
      if (!techA || !techB || !jobA || !jobB) continue;

      // An earlier swap in this pass may already have moved one of them.
      if (!routeJobIds(plan, a.techId).includes(a.jobId)) continue;
      if (!routeJobIds(plan, b.techId).includes(b.jobId)) continue;

      // Only a genuine exchange counts against the cap.
      iterations++;
      const before = totalTravel(plan, technicians);

      // Lift both, then try to land each on the other's day.
      let candidate = withoutJob(plan, jobA.id, technicians);
      candidate = withoutJob(candidate, jobB.id, technicians);

      const landA = bestPlacementOnTech(candidate, jobA, techB);
      if (!landA.ok) continue;
      candidate = applyPlacement(candidate, techB, jobA, landA.placement.position);

      const landB = bestPlacementOnTech(candidate, jobB, techA);
      if (!landB.ok) continue;
      candidate = applyPlacement(candidate, techA, jobB, landB.placement.position);

      if (totalTravel(candidate, technicians) < before) {
        plan = candidate;
        swapsApplied++;
      }
    }
  }

  return { plan, swapsApplied, iterations };
}

// ---- Random baseline ----------------------------------------------------

/** Deterministic PRNG so the baseline number is stable between page loads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface BaselineStats {
  /** Mean total travel over `runs` random feasible assignments. */
  meanTravelMin: number;
  /** Mean number of jobs a random assignment managed to place. */
  meanAssigned: number;
  bestTravelMin: number;
  worstTravelMin: number;
  runs: number;
}

/**
 * What "no thinking at all" costs: jobs taken in random order, offered to
 * technicians in random order, dropped into the FIRST position the rules allow
 * rather than the cheapest one. Still a legal plan — every placement clears
 * checkFeasible — just an unconsidered one. This is the number the optimised
 * plan is measured against on screen.
 */
export function randomBaselineForCase(day: DayCase, rules?: RuleOptions, runs = 25): BaselineStats {
  return randomBaseline(day.technicians, day.jobs, day.travel, rules ?? day.defaultRules, runs);
}

export function randomBaseline(
  technicians: Technician[],
  jobs: Job[],
  travel: TravelMatrix,
  rules?: RuleOptions,
  runs = 25,
  seed = 20260830,
): BaselineStats {
  let sum = 0;
  let assignedSum = 0;
  let best = Infinity;
  let worst = 0;

  for (let r = 0; r < runs; r++) {
    const rand = mulberry32(seed + r * 7919);
    let plan = emptyPlan(technicians, jobs, travel, rules);

    for (const job of shuffled(jobs, rand)) {
      let landed = false;
      for (const tech of shuffled(technicians, rand)) {
        const route = plan.routes[tech.id] ?? [];
        for (let position = 0; position <= route.length && !landed; position++) {
          const attempt = tryPlacement(plan, job, tech, position);
          if (attempt.ok) {
            plan = applyPlacement(plan, tech, job, position);
            landed = true;
          }
        }
        if (landed) break;
      }
    }

    const runTravel = totalTravel(plan, technicians);
    sum += runTravel;
    assignedSum += Object.values(plan.routes).reduce((n, route) => n + route.length, 0);
    best = Math.min(best, runTravel);
    worst = Math.max(worst, runTravel);
  }

  return {
    meanTravelMin: Math.round(sum / runs),
    meanAssigned: Math.round((assignedSum / runs) * 10) / 10,
    bestTravelMin: best,
    worstTravelMin: worst,
    runs,
  };
}

/** Re-derive a plan's route objects, e.g. after a technician is taken off shift. */
export function rebuildRoutes(plan: Plan, technicians: Technician[]): Plan {
  const routes = { ...plan.routes };
  for (const tech of technicians) {
    routes[tech.id] = recomputeRoute(tech, routeJobIds(plan, tech.id), plan.jobs, plan.travel);
  }
  return { ...plan, routes };
}

export { routeTravel };
