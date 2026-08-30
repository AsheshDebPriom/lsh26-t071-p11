import { formatDuration, formatTime } from './time';
import { travelMinutes } from './travel';
import type { FeasibilityResult, Job, Plan, Technician } from './types';
import { SKILL_LABEL } from './types';

/**
 * THE single authority on whether a job may sit on a technician's day.
 *
 * Three of the four scored requirements run through this one function:
 *   - the solver's accept/reject decision (lib/solver.ts),
 *   - the blocked-jobs list and the rule named against each job,
 *   - the dispatcher's manual move validation.
 *
 * Nothing anywhere else re-implements a rule. If a rule is wrong, it is wrong
 * in exactly one place.
 *
 * @param afterJob  the job this one would follow in the technician's route.
 *                  `null` means "first job of the day": the technician leaves
 *                  their home area at shift start.
 */
export function checkFeasible(
  job: Job,
  tech: Technician,
  afterJob: Job | null,
  plan: Plan,
): FeasibilityResult {
  // ---- Rule: the right skill. -------------------------------------------
  if (!tech.skills.includes(job.skill)) {
    const held = tech.skills.map((s) => SKILL_LABEL[s]);
    const heldText =
      held.length === 0
        ? 'holds no skills on today’s roster'
        : `holds ${held.join(' and ')} only`;
    return {
      ok: false,
      rule: 'SKILL_MISMATCH',
      detail: `Needs ${SKILL_LABEL[job.skill]}. ${tech.name} ${heldText}.`,
    };
  }

  const route = plan.routes[tech.id] ?? [];

  // Where the technician is, and when they are free, before this job.
  let fromArea = tech.homeArea;
  let departure = tech.shiftStart;
  let followerIndex = 0; // index in `route` of the job that would come next

  if (afterJob !== null) {
    const i = route.findIndex((a) => a.jobId === afterJob.id);
    if (i === -1) {
      // Defensive: the caller asked to sit after a job this technician is not
      // doing. Unreachable from the UI or the solver, but it must not lie.
      return {
        ok: false,
        rule: 'OVERLAPS_JOB',
        detail: `${afterJob.code} is not on ${tech.name}’s day, so this job cannot follow it.`,
      };
    }
    fromArea = afterJob.area;
    departure = route[i].finish;
    followerIndex = i + 1;
  }

  const travelMin = travelMinutes(fromArea, job.area);
  const arrival = departure + travelMin;
  // Arriving early is allowed; the technician waits, and that wait is drawn as
  // idle time. Work starts at the later of "arrived" and "window opened".
  const start = Math.max(arrival, job.windowStart);
  const finish = start + job.durationMin;

  const origin = afterJob
    ? `${formatDuration(travelMin)} travel from ${afterJob.code} in ${fromArea}`
    : `${formatDuration(travelMin)} travel from home area ${fromArea}`;

  // ---- Rule: inside the customer time window. ---------------------------
  // AMBIGUITY CALL: the job must START inside the window. Overrunning the
  // window end is allowed — the customer is home and the technician is working.
  if (arrival > job.windowEnd) {
    const late = arrival - job.windowEnd;
    return {
      ok: false,
      rule: 'WINDOW_MISSED',
      detail:
        `Arrives ${formatTime(arrival)}, window closes ${formatTime(job.windowEnd)} — ` +
        `${formatDuration(late)} late (${origin}).`,
    };
  }

  // ---- Rule: inside shift hours. ----------------------------------------
  if (start > tech.shiftEnd) {
    return {
      ok: false,
      rule: 'OUTSIDE_SHIFT',
      detail:
        `Work could not start before ${formatTime(start)}; ${tech.name}’s shift ends ` +
        `${formatTime(tech.shiftEnd)}.`,
    };
  }
  if (finish > tech.shiftEnd) {
    const over = finish - tech.shiftEnd;
    return {
      ok: false,
      rule: 'OUTSIDE_SHIFT',
      detail:
        `Starts ${formatTime(start)} and runs ${formatDuration(job.durationMin)}, finishing ` +
        `${formatTime(finish)} — ${formatDuration(over)} past ${tech.name}’s ` +
        `${formatTime(tech.shiftEnd)} shift end.`,
    };
  }

  // ---- Rule: able to reach the home area before shift end. --------------
  // AMBIGUITY CALL: the day is only feasible if the technician can get home
  // inside their shift. This is the NO_RETURN_TIME rule.
  const homeLeg = travelMinutes(job.area, tech.homeArea);
  if (finish + homeLeg > tech.shiftEnd) {
    const over = finish + homeLeg - tech.shiftEnd;
    return {
      ok: false,
      rule: 'NO_RETURN_TIME',
      detail:
        `Finishes ${formatTime(finish)} in ${job.area}; ${formatDuration(homeLeg)} back to ` +
        `home area ${tech.homeArea} lands ${formatTime(finish + homeLeg)} — ` +
        `${formatDuration(over)} past the ${formatTime(tech.shiftEnd)} shift end.`,
    };
  }

  // ---- Rule: does not collide with the job already booked after it. -----
  // Insertion never pushes a committed job later: the dispatcher promised
  // those windows too. The new job must fit inside the existing gap.
  const follower = route[followerIndex];
  if (follower) {
    const followerJob = plan.jobs[follower.jobId];
    const followerArea = followerJob?.area ?? job.area;
    const legToFollower = travelMinutes(job.area, followerArea);
    const arriveAtFollower = finish + legToFollower;
    if (arriveAtFollower > follower.start) {
      const over = arriveAtFollower - follower.start;
      return {
        ok: false,
        rule: 'OVERLAPS_JOB',
        detail:
          `Finishes ${formatTime(finish)}; ${tech.name} is due at ` +
          `${followerJob?.code ?? 'the next job'} in ${followerArea} at ` +
          `${formatTime(follower.start)} and that trip takes ` +
          `${formatDuration(legToFollower)} — ${formatDuration(over)} short.`,
      };
    }
  }

  return { ok: true, arrival, start, finish, travelMin };
}
