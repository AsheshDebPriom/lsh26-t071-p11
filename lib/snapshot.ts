import { formatDuration, formatSpan, formatTime } from './time';
import type { DayCase, Plan } from './types';
import { skillLabel } from './types';

/**
 * The day, written out for a language model to read.
 *
 * Compact on purpose: a full case is 40 jobs and 16 technicians, and sending
 * raw JSON wastes the context on punctuation the model has to parse back into
 * meaning. This is the same information in the words the board already uses, so
 * an answer quoting it lines up with what is on screen.
 *
 * Nothing here is personal data — technicians are first names from a fictional
 * roster, and jobs are areas and skills. There is nothing in a snapshot that is
 * not already visible to anyone who opens the page.
 */
export function describeDay(day: DayCase, plan: Plan | null): string {
  const lines: string[] = [];

  lines.push(`DAY: ${day.id} (${day.today || 'no date'}), areas: ${day.areas.join(', ')}.`);
  lines.push(
    plan
      ? `A plan exists. Total driving ${formatDuration(plan.totalTravelMin)}. ` +
          `Return-to-home rule is ${plan.rules.requireReturnHome ? 'ON' : 'OFF'}.`
      : 'No plan has been built yet.',
  );

  lines.push('', 'TECHNICIANS:');
  for (const t of day.technicians) {
    const route = plan?.routes[t.id] ?? [];
    const work = route.reduce((n, a) => n + (a.finish - a.start), 0);
    const travel = route.reduce((n, a) => n + a.travelMin, 0);
    const stops = route
      .map((a) => {
        const job = plan!.jobs[a.jobId];
        return `${job.code}@${job.area} ${formatSpan(a.start, a.finish)}`;
      })
      .join('; ');
    lines.push(
      `- ${t.id} ${t.name}: skills ${t.skills.map(skillLabel).join('/')}, ` +
        `shift ${formatSpan(t.shiftStart, t.shiftEnd)}, home ${t.homeArea}. ` +
        (plan
          ? route.length
            ? `${route.length} jobs, ${formatDuration(work)} work, ${formatDuration(travel)} driving: ${stops}`
            : 'nothing scheduled'
          : ''),
    );
  }

  if (plan) {
    const placed = new Set(Object.values(plan.routes).flatMap((r) => r.map((a) => a.jobId)));
    const unplaced = day.jobs.filter((j) => !placed.has(j.id));
    if (unplaced.length) {
      lines.push('', 'JOBS THAT COULD NOT BE SCHEDULED (with the rule that blocked each):');
      for (const j of unplaced) {
        const b = plan.blocked.find((x) => x.jobId === j.id);
        lines.push(
          `- ${j.code} ${skillLabel(j.skill)} in ${j.area}, ` +
            `${formatDuration(j.durationMin)}, window ${formatSpan(j.windowStart, j.windowEnd)} — ` +
            (b ? `${b.rule}: ${b.detail}` : 'unassigned'),
        );
      }
    } else {
      lines.push('', 'Every job is scheduled; nothing is blocked.');
    }
  } else {
    lines.push('', `JOBS (${day.jobs.length}), none assigned yet:`);
    for (const j of day.jobs.slice(0, 40)) {
      lines.push(
        `- ${j.code} ${skillLabel(j.skill)} in ${j.area}, ${formatDuration(j.durationMin)}, ` +
          `window ${formatSpan(j.windowStart, j.windowEnd)}`,
      );
    }
  }

  lines.push(
    '',
    'TRAVEL TABLE (minutes, symmetric):',
    ...day.areas.map(
      (a) => `- ${a}: ${day.areas.filter((b) => b !== a).map((b) => `${b} ${day.travel[a]?.[b]}`).join(', ')}`,
    ),
  );

  return lines.join('\n');
}

/** The rules, stated for the model so it never invents one. */
export const RULES_BRIEF = `THE FIVE HARD RULES (a job is only placed when all hold):
- SKILL_MISMATCH: the technician must hold the skill the job requires.
- WINDOW_MISSED: the technician must ARRIVE no later than the customer window closes. A job must START inside its window; overrunning the end is allowed. Arriving early is allowed and shows as waiting.
- OUTSIDE_SHIFT: work must not start before, or finish after, the technician's shift.
- OVERLAPS_JOB: the job must clear its area in time to reach the next job already booked. Inserting a job never pushes a committed job later.
- NO_RETURN_TIME: the technician must reach their home area before shift end. OFF by default, because the published P11 format says no return home is required.
Travel between areas comes only from the travel table. The first trip of the day starts at the technician's home area at shift start.`;

export { formatTime };
