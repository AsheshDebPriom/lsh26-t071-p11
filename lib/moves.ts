import { bestPlacementOnTech, withoutJob } from './plan';
import type { Job, Plan, RuleName, Technician } from './types';

/**
 * What would happen if this job went to each technician.
 *
 * One shared answer for both ways a dispatcher can move a job — the dropdown
 * and the drag — so the two can never disagree about what is legal. The job is
 * always judged against a board with itself lifted off, otherwise a job blocks
 * its own move.
 *
 * Every verdict comes from checkFeasible by way of bestPlacementOnTech; nothing
 * here decides anything about the rules.
 */
export interface MovePreview {
  tech: Technician;
  /** True for the technician who already holds the job. */
  current: boolean;
  ok: boolean;
  /** When the job would start, if this move is legal. */
  start?: number;
  position?: number;
  /** The rule that stops it, if it is not. */
  rule?: RuleName;
  detail?: string;
}

export function previewMoves(
  plan: Plan,
  job: Job,
  technicians: Technician[],
  currentTechId: string | null,
): MovePreview[] {
  const lifted = currentTechId ? withoutJob(plan, job.id, technicians) : plan;

  return technicians.map((tech) => {
    if (tech.id === currentTechId) {
      return { tech, current: true, ok: false };
    }
    const attempt = bestPlacementOnTech(lifted, job, tech);
    return attempt.ok
      ? {
          tech,
          current: false,
          ok: true,
          start: attempt.placement.result.start,
          position: attempt.placement.position,
        }
      : { tech, current: false, ok: false, rule: attempt.rule, detail: attempt.detail };
  });
}

export function legalCount(previews: MovePreview[]): number {
  return previews.filter((p) => p.ok).length;
}

export function previewFor(previews: MovePreview[], techId: string): MovePreview | undefined {
  return previews.find((p) => p.tech.id === techId);
}
