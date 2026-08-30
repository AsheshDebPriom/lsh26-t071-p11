import { previewMoves } from './moves';
import { formatDuration, formatTime } from './time';
import { travelMinutes } from './travel';
import type { Area, DayCase, Job, Plan, RuleName, Technician } from './types';
import { skillLabel } from './types';

/**
 * The day as it actually unfolds, minute by minute.
 *
 * The timeline says when and the routes say where; neither says where a
 * technician *is* at 14:00. That matters because the problem this tool exists
 * for is described as "technicians crossing the city past each other" — and two
 * routes crossing on a map is not the same thing as two technicians passing
 * each other at the same moment. Only a position in time shows the second.
 *
 * Every position is derived from the plan's own arithmetic. Nothing is
 * estimated from the map's coordinates.
 */

export type Position =
  /** Outside their shift entirely. */
  | { kind: 'off'; label: string }
  /** Standing in one area: working, or waiting for a window to open. */
  | { kind: 'at'; area: Area; doing: 'working' | 'waiting'; jobId?: string; label: string }
  /** Part way along a leg, `t` of the way from `from` to `to`. */
  | { kind: 'between'; from: Area; to: Area; t: number; label: string };

export interface FleetMember {
  tech: Technician;
  position: Position;
}

/** Where one technician is at `minutes`, and what they are doing. */
export function positionAt(tech: Technician, plan: Plan, minutes: number): Position {
  if (minutes < tech.shiftStart) {
    return { kind: 'off', label: `${tech.name} starts at ${formatTime(tech.shiftStart)}` };
  }
  if (minutes > tech.shiftEnd) {
    return { kind: 'off', label: `${tech.name} finished at ${formatTime(tech.shiftEnd)}` };
  }

  const route = plan.routes[tech.id] ?? [];
  let area: Area = tech.homeArea;

  for (const a of route) {
    const job = plan.jobs[a.jobId];
    if (!job) continue;

    // Still where they were, waiting to set off.
    if (minutes < a.departure) {
      return {
        kind: 'at',
        area,
        doing: 'waiting',
        label: `${tech.name} is in ${area}, leaving at ${formatTime(a.departure)}`,
      };
    }
    // On the road.
    if (minutes < a.arrival) {
      const span = a.arrival - a.departure;
      return {
        kind: 'between',
        from: area,
        to: job.area,
        t: span > 0 ? (minutes - a.departure) / span : 1,
        label:
          `${tech.name} is driving ${area} → ${job.area}, ` +
          `arriving ${formatTime(a.arrival)} for ${job.code}`,
      };
    }
    // Arrived, but the customer window has not opened.
    if (minutes < a.start) {
      return {
        kind: 'at',
        area: job.area,
        doing: 'waiting',
        jobId: job.id,
        label:
          `${tech.name} is waiting in ${job.area} — ${job.code} cannot start until ` +
          `${formatTime(a.start)} (${formatDuration(a.start - minutes)} to go)`,
      };
    }
    // On site.
    if (minutes < a.finish) {
      return {
        kind: 'at',
        area: job.area,
        doing: 'working',
        jobId: job.id,
        label:
          `${tech.name} is on ${job.code} in ${job.area}, ` +
          `finishing ${formatTime(a.finish)}`,
      };
    }
    area = job.area;
  }

  // Past the last job. Either driving home, or done and waiting out the shift.
  const last = route[route.length - 1];
  if (last && plan.rules.requireReturnHome) {
    const home = travelMinutes(plan.travel, area, tech.homeArea);
    if (home > 0 && minutes < last.finish + home) {
      return {
        kind: 'between',
        from: area,
        to: tech.homeArea,
        t: (minutes - last.finish) / home,
        label: `${tech.name} is driving home to ${tech.homeArea}`,
      };
    }
  }

  return {
    kind: 'at',
    area,
    doing: 'waiting',
    label: route.length
      ? `${tech.name} finished at ${formatTime(last.finish)} and is free in ${area}`
      : `${tech.name} has nothing scheduled today`,
  };
}

/** Everyone, at one moment. */
export function fleetAt(day: DayCase, plan: Plan, minutes: number): FleetMember[] {
  return day.technicians.map((tech) => ({ tech, position: positionAt(tech, plan, minutes) }));
}

/** How many technicians are working, driving, waiting or off at one moment. */
export function fleetSummary(fleet: FleetMember[]): {
  working: number;
  driving: number;
  waiting: number;
  off: number;
} {
  const out = { working: 0, driving: 0, waiting: 0, off: 0 };
  for (const { position } of fleet) {
    if (position.kind === 'off') out.off++;
    else if (position.kind === 'between') out.driving++;
    else if (position.doing === 'working') out.working++;
    else out.waiting++;
  }
  return out;
}

// ---- Why a job is out of reach -----------------------------------------

export interface Reach {
  tech: Technician;
  /** Where they would be setting out from, at the moment the window opens. */
  fromArea: Area;
  travelMin: number;
  /** Arrival if they left the moment the window opened. Not a promise. */
  earliestArrival: number;
  ok: boolean;
  rule?: RuleName;
  detail?: string;
}

/**
 * For a job nobody could take: which technicians hold the skill, where they
 * would be coming from when the window opens, and how far that is.
 *
 * The blocked panel already names the rule. This is the same answer in
 * geography — the distance that made the rule inevitable, which is the thing a
 * dispatcher can actually plan around tomorrow.
 */
export function reachFor(job: Job, day: DayCase, plan: Plan): Reach[] {
  const previews = previewMoves(plan, job, day.technicians, null);

  return day.technicians
    .filter((tech) => tech.skills.includes(job.skill))
    .map((tech) => {
      const where = positionAt(tech, plan, job.windowStart);
      const fromArea =
        where.kind === 'between' ? where.to : where.kind === 'at' ? where.area : tech.homeArea;
      const travelMin = travelMinutes(plan.travel, fromArea, job.area);
      const preview = previews.find((p) => p.tech.id === tech.id);

      return {
        tech,
        fromArea,
        travelMin,
        earliestArrival: job.windowStart + travelMin,
        ok: Boolean(preview?.ok),
        rule: preview?.rule,
        detail: preview?.detail,
      };
    })
    .sort((a, b) => a.travelMin - b.travelMin);
}

/** A one-line summary of why a job is unreachable, for the map's caption. */
export function describeReach(job: Job, reaches: Reach[]): string {
  if (reaches.length === 0) {
    return `Nobody on today's roster holds ${skillLabel(job.skill)}, so ${job.code} was never reachable.`;
  }
  const nearest = reaches[0];
  return (
    `${reaches.length} technician${reaches.length === 1 ? '' : 's'} hold ${skillLabel(job.skill)}. ` +
    `The nearest is ${nearest.tech.name}, ${formatDuration(nearest.travelMin)} away in ` +
    `${nearest.fromArea} when the window opens at ${formatTime(job.windowStart)}.`
  );
}
