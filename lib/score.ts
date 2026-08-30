import type { Plan, Technician } from './types';

/**
 * A single number for a plan, so a dispatcher can tell whether the day they
 * edited by hand is better or worse than the one the solver built.
 *
 * Ten points for every job placed, minus one point for every ten minutes of
 * driving. The weighting says what the objective says: placing a call matters
 * far more than shaving a corner off a route, and no amount of saved driving
 * pays for a customer left unserved.
 */
export const SCORE_RULE = '10 points per job placed, −1 point per 10 minutes of driving';

export interface PlanScore {
  score: number;
  assigned: number;
  blocked: number;
  travelMin: number;
}

export function scorePlan(plan: Plan, technicians: Technician[], totalJobs: number): PlanScore {
  const assigned = technicians.reduce((n, t) => n + (plan.routes[t.id] ?? []).length, 0);
  return {
    score: Math.round(assigned * 10 - plan.totalTravelMin / 10),
    assigned,
    blocked: Math.max(0, totalJobs - assigned),
    travelMin: plan.totalTravelMin,
  };
}
