import { previewMoves } from './moves';
import { findTechForJob } from './plan';
import { formatDuration, formatSpan, formatTime, parseHM } from './time';
import type { DayCase, Job, Plan, Technician } from './types';
import { RULE_MEANING, skillLabel } from './types';

/**
 * The dispatcher console: type what you want, and the board does it.
 *
 * DELIBERATELY NOT A LANGUAGE MODEL. This app has no server — the stack is a
 * static client bundle — so any model call would mean shipping an API key to
 * every visitor, which the submission rules forbid and which would be a real
 * credential leak besides. What is here instead is a parser over the vocabulary
 * this problem actually has: twelve or so verbs, the technicians on today's
 * roster, the jobs in today's case, the areas and the skills. It is
 * deterministic, it runs offline, it is unit-tested, and it never guesses at an
 * action it is not certain of — it asks.
 *
 * Every command that changes the plan goes through the same handlers the
 * buttons use, so the console can no more break a hard rule than the drag can.
 */

export type Command =
  // Things that change the plan.
  | { kind: 'solve' }
  | { kind: 'clear' }
  | { kind: 'restore' }
  | { kind: 'move'; jobId: string; techId: string }
  | { kind: 'unassign'; jobId: string }
  | { kind: 'sick'; techId: string }
  | { kind: 'emergency'; job: Job; at: number }
  | { kind: 'setRule'; requireReturnHome: boolean }
  | { kind: 'loadCase'; caseId: string }
  | { kind: 'view'; view: 'timeline' | 'map' }
  // Things that only answer.
  | { kind: 'explain'; jobId: string }
  | { kind: 'whoCanTake'; jobId: string }
  | { kind: 'describeJob'; jobId: string }
  | { kind: 'describeTech'; techId: string }
  | { kind: 'summary' }
  | { kind: 'listBlocked' }
  | { kind: 'busiest' }
  | { kind: 'help' }
  // Things it will not guess at.
  | { kind: 'ambiguous'; question: string }
  | { kind: 'unknown'; text: string };

export interface ConsoleContext {
  day: DayCase;
  plan: Plan | null;
  caseIds: string[];
}

// ---- Entity resolution --------------------------------------------------

/** "J-13", "J13", "j 13", "job 13" → the job, if this case has one. */
export function findJob(text: string, day: DayCase): Job[] {
  const matches = new Set<Job>();
  const numbers = [...text.matchAll(/\bj(?:ob)?[\s-]*0*(\d{1,3})\b/gi)].map((m) => m[1]);
  for (const n of numbers) {
    const padded = n.padStart(2, '0');
    for (const job of day.jobs) {
      if (
        job.id.toLowerCase() === `j${padded}`.toLowerCase() ||
        job.code.toLowerCase() === `j-${padded}`.toLowerCase() ||
        job.id.toLowerCase() === `emg${n}`.toLowerCase() ||
        job.code.toLowerCase() === `e-${padded}`.toLowerCase()
      ) {
        matches.add(job);
      }
    }
  }
  // Emergency jobs are written E-01 rather than J-01.
  for (const m of text.matchAll(/\be[\s-]*0*(\d{1,3})\b/gi)) {
    const padded = m[1].padStart(2, '0');
    const job = day.jobs.find((j) => j.code.toLowerCase() === `e-${padded}`);
    if (job) matches.add(job);
  }
  return [...matches];
}

/** A technician by name (whole word, case-insensitive) or by id. */
export function findTechnicians(text: string, day: DayCase): Technician[] {
  const lower = ` ${text.toLowerCase()} `;
  return day.technicians.filter((t) => {
    const name = t.name.toLowerCase();
    const byName = new RegExp(`[^a-z]${escapeRegExp(name)}[^a-z]`).test(lower);
    const byId = new RegExp(`[^a-z0-9]${t.id.toLowerCase()}[^a-z0-9]`).test(lower);
    return byName || byId;
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "14:00", "2pm", "2 pm", "0900" → minutes from midnight. */
export function findTime(text: string): number | null {
  const hhmm = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);

  const meridiem = /\b(1[0-2]|0?\d)\s*(am|pm)\b/i.exec(text);
  if (meridiem) {
    let hour = Number(meridiem[1]) % 12;
    if (meridiem[2].toLowerCase() === 'pm') hour += 12;
    return hour * 60;
  }
  return null;
}

/** "45 min", "1h", "1h 30", "90 minutes" → minutes. */
export function findDuration(text: string): number | null {
  let total = 0;
  let found = false;
  for (const m of text.matchAll(/\b(\d{1,3})\s*(h|hr|hrs|hour|hours)\b/gi)) {
    total += Number(m[1]) * 60;
    found = true;
  }
  for (const m of text.matchAll(/\b(\d{1,3})\s*(m|min|mins|minute|minutes)\b/gi)) {
    total += Number(m[1]);
    found = true;
  }
  return found && total > 0 ? total : null;
}

export function findArea(text: string, day: DayCase): string | null {
  const lower = text.toLowerCase();
  // Longest name first, so "Old Dhaka" beats a bare "Dhaka" fragment.
  const areas = [...day.areas].sort((a, b) => b.length - a.length);
  return areas.find((a) => lower.includes(a.toLowerCase())) ?? null;
}

export function findSkill(text: string, day: DayCase): string | null {
  const lower = text.toLowerCase();
  const skills = [...new Set(day.jobs.map((j) => j.skill))];
  for (const s of skills) {
    if (lower.includes(s.toLowerCase().replace(/_/g, ' ')) || lower.includes(s.toLowerCase())) {
      return s;
    }
    if (lower.includes(skillLabel(s).toLowerCase())) return s;
  }
  // "ac" on its own is a word, not a substring of "black".
  if (/\bac\b/.test(lower) && skills.includes('ac')) return 'ac';
  return null;
}

// ---- Parsing ------------------------------------------------------------

const has = (text: string, ...words: string[]) =>
  words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));

export function parseCommand(input: string, ctx: ConsoleContext): Command {
  const text = input.trim();
  if (!text) return { kind: 'unknown', text };
  const { day } = ctx;

  if (has(text, 'help', 'commands') || /what can (you|i) do/i.test(text)) {
    return { kind: 'help' };
  }

  // Load another day.
  const caseMatch = /\b(pub-?\s?\d{1,2}|crafted)\b/i.exec(text);
  if (caseMatch && has(text, 'load', 'open', 'switch', 'case', 'day', 'show')) {
    const wanted = caseMatch[1].toUpperCase().replace(/\s/g, '').replace(/^PUB(\d)/, 'PUB-0$1').replace(/^PUB(\d\d)/, 'PUB-$1');
    const id =
      ctx.caseIds.find((c) => c.toUpperCase() === wanted) ??
      ctx.caseIds.find((c) => c.toUpperCase().startsWith(wanted)) ??
      ctx.caseIds.find((c) => c.toUpperCase().includes('CRAFTED') && /crafted/i.test(text));
    if (id) return { kind: 'loadCase', caseId: id };
  }

  if (has(text, 'map')) return { kind: 'view', view: 'map' };
  if (has(text, 'timeline', 'board', 'gantt') && has(text, 'show', 'view', 'switch', 'go')) {
    return { kind: 'view', view: 'timeline' };
  }

  if (has(text, 'solve', 'replan', 'optimise', 'optimize', 'plan') && !has(text, 'restore')) {
    if (has(text, 'build', 'solve', 'replan', 'optimise', 'optimize', 'again', 'redo')) {
      return { kind: 'solve' };
    }
  }
  if (has(text, 'clear', 'reset', 'start over')) return { kind: 'clear' };
  if (has(text, 'restore', 'undo', 'revert')) return { kind: 'restore' };

  if (/return\s*home|go\s*home|home\s*rule/i.test(text)) {
    const off = has(text, 'off', 'disable', 'without', 'no', 'stop');
    return { kind: 'setRule', requireReturnHome: !off };
  }

  const jobs = findJob(text, day);
  const techs = findTechnicians(text, day);

  // Someone is off sick.
  if (has(text, 'sick', 'ill', 'unwell', 'off')) {
    if (techs.length === 1) return { kind: 'sick', techId: techs[0].id };
    if (techs.length > 1) {
      return { kind: 'ambiguous', question: `Which one — ${techs.map((t) => t.name).join(', ')}?` };
    }
    if (has(text, 'sick', 'ill')) {
      return { kind: 'ambiguous', question: 'Which technician is off sick?' };
    }
  }

  // A new emergency.
  if (has(text, 'emergency', 'urgent', 'callout', 'call-out')) {
    const area = findArea(text, day);
    const skill = findSkill(text, day);
    const at = findTime(text);
    const duration = findDuration(text) ?? 60;
    if (!area) return { kind: 'ambiguous', question: 'Which area is the emergency in?' };
    if (!skill) return { kind: 'ambiguous', question: 'What skill does the emergency need?' };
    const now = at ?? 13 * 60;
    return {
      kind: 'emergency',
      at: now,
      job: {
        id: `EMG${Date.now() % 100000}`,
        code: 'E-01',
        customer: `Emergency call, ${area}`,
        area,
        skill,
        durationMin: duration,
        windowStart: now + 30,
        windowEnd: now + 180,
      },
    };
  }

  // Questions about one job.
  if (jobs.length === 1) {
    const job = jobs[0];
    if (has(text, 'why', 'reason', 'blocked', 'explain') || /can'?t|cannot/i.test(text)) {
      return { kind: 'explain', jobId: job.id };
    }
    if (/who\b/i.test(text) || has(text, 'options', 'available', 'could', 'candidates')) {
      return { kind: 'whoCanTake', jobId: job.id };
    }
    if (has(text, 'unassign', 'remove', 'drop', 'off the board', 'cancel')) {
      return { kind: 'unassign', jobId: job.id };
    }
    if (techs.length === 1) return { kind: 'move', jobId: job.id, techId: techs[0].id };
    if (techs.length > 1) {
      return {
        kind: 'ambiguous',
        question: `Move ${job.code} to which of ${techs.map((t) => t.name).join(', ')}?`,
      };
    }
    if (has(text, 'move', 'give', 'assign', 'send', 'reassign', 'put')) {
      return { kind: 'ambiguous', question: `Move ${job.code} to which technician?` };
    }
    return { kind: 'describeJob', jobId: job.id };
  }

  if (jobs.length > 1) {
    return {
      kind: 'ambiguous',
      question: `Which job — ${jobs.map((j) => j.code).join(', ')}?`,
    };
  }

  if (has(text, 'blocked', 'unassigned', 'impossible') || /what can'?t/i.test(text)) {
    return { kind: 'listBlocked' };
  }
  if (has(text, 'busiest', 'most', 'idle', 'least')) return { kind: 'busiest' };
  if (has(text, 'summary', 'score', 'stats', 'travel', 'how', 'total')) return { kind: 'summary' };

  if (techs.length === 1) return { kind: 'describeTech', techId: techs[0].id };
  if (techs.length > 1) {
    return { kind: 'ambiguous', question: `Which one — ${techs.map((t) => t.name).join(', ')}?` };
  }

  return { kind: 'unknown', text };
}

// ---- Answering the read-only commands ----------------------------------

export interface Answer {
  text: string;
  tone: 'ok' | 'warn' | 'info';
}

export function answer(command: Command, ctx: ConsoleContext): Answer | null {
  const { day, plan } = ctx;

  switch (command.kind) {
    case 'help':
      return {
        tone: 'info',
        text:
          'Try: "move J-13 to Kamal" · "why is J-21 blocked?" · "who can take J-05?" · ' +
          '"Rafiq is sick" · "emergency plumbing in Uttara at 2pm for 45 min" · ' +
          '"take J-09 off the board" · "what can\'t be done?" · "who is busiest?" · ' +
          '"summary" · "show the map" · "re-solve" · "restore" · "load PUB-07".',
      };

    case 'ambiguous':
      return { tone: 'warn', text: command.question };

    case 'unknown':
      return {
        tone: 'warn',
        text: `I did not understand "${command.text}". Type help to see what I can do.`,
      };

    case 'listBlocked': {
      if (!plan) return { tone: 'warn', text: 'There is no plan yet. Say "solve" first.' };
      if (plan.blocked.length === 0) {
        return { tone: 'ok', text: 'Nothing is blocked — every job on this day is on the board.' };
      }
      const lines = plan.blocked.map((b) => {
        const job = plan.jobs[b.jobId];
        return `${job.code} (${skillLabel(job.skill)} in ${job.area}) — ${b.rule}: ${b.detail}`;
      });
      return {
        tone: 'warn',
        text: `${plan.blocked.length} job${plan.blocked.length === 1 ? '' : 's'} cannot be done:\n${lines.join('\n')}`,
      };
    }

    case 'explain': {
      if (!plan) return { tone: 'warn', text: 'There is no plan yet. Say "solve" first.' };
      const job = plan.jobs[command.jobId];
      const blocked = plan.blocked.find((b) => b.jobId === command.jobId);
      if (!blocked) {
        const techId = findTechForJob(plan, command.jobId);
        const tech = day.technicians.find((t) => t.id === techId);
        const a = techId ? (plan.routes[techId] ?? []).find((x) => x.jobId === command.jobId) : undefined;
        return {
          tone: 'ok',
          text: a && tech
            ? `${job.code} is not blocked — ${tech.name} has it, ${formatSpan(a.start, a.finish)}.`
            : `${job.code} is not on the board and not blocked; it can be placed.`,
        };
      }
      return {
        tone: 'warn',
        text:
          `${job.code} — ${blocked.rule}. ${blocked.detail}\n` +
          `${RULE_MEANING[blocked.rule]}`,
      };
    }

    case 'whoCanTake': {
      if (!plan) return { tone: 'warn', text: 'There is no plan yet. Say "solve" first.' };
      const job = plan.jobs[command.jobId];
      const current = findTechForJob(plan, command.jobId);
      const previews = previewMoves(plan, job, day.technicians, current);
      const legal = previews.filter((p) => p.ok);
      if (legal.length === 0) {
        const reasons = new Map<string, number>();
        for (const p of previews) {
          if (p.current || !p.rule) continue;
          reasons.set(p.rule, (reasons.get(p.rule) ?? 0) + 1);
        }
        const summary = [...reasons.entries()].map(([r, n]) => `${n} × ${r}`).join(', ');
        return {
          tone: 'warn',
          text: `Nobody can take ${job.code} right now. Across the roster: ${summary}.`,
        };
      }
      const list = legal
        .map((p) => `${p.tech.name} (would start ${formatTime(p.start ?? 0)})`)
        .join(', ');
      return {
        tone: 'ok',
        text: `${legal.length} of ${previews.length} could take ${job.code}: ${list}.`,
      };
    }

    case 'describeJob': {
      const job = day.jobs.find((j) => j.id === command.jobId)!;
      const base =
        `${job.code} — ${skillLabel(job.skill)} in ${job.area}, ` +
        `${formatDuration(job.durationMin)} of work, promised ${formatSpan(job.windowStart, job.windowEnd)}.`;
      if (!plan) return { tone: 'info', text: `${base} No plan yet.` };
      const techId = findTechForJob(plan, job.id);
      if (!techId) {
        const blocked = plan.blocked.find((b) => b.jobId === job.id);
        return {
          tone: 'warn',
          text: blocked ? `${base}\nNot scheduled — ${blocked.rule}: ${blocked.detail}` : `${base}\nNot scheduled.`,
        };
      }
      const tech = day.technicians.find((t) => t.id === techId)!;
      const a = (plan.routes[techId] ?? []).find((x) => x.jobId === job.id)!;
      return {
        tone: 'ok',
        text:
          `${base}\n${tech.name} has it: drives ${formatDuration(a.travelMin)} from ${a.fromArea}, ` +
          `arrives ${formatTime(a.arrival)}` +
          (a.start > a.arrival ? `, waits ${formatDuration(a.start - a.arrival)}` : '') +
          `, works ${formatSpan(a.start, a.finish)}.`,
      };
    }

    case 'describeTech': {
      const tech = day.technicians.find((t) => t.id === command.techId)!;
      const head =
        `${tech.name} (${tech.id}) — ${skillLabel(tech.skills[0])}` +
        (tech.skills.length > 1 ? ` and ${tech.skills.slice(1).map(skillLabel).join(', ')}` : '') +
        `, ${formatSpan(tech.shiftStart, tech.shiftEnd)}, home area ${tech.homeArea}.`;
      if (!plan) return { tone: 'info', text: `${head} No plan yet.` };
      const route = plan.routes[tech.id] ?? [];
      if (route.length === 0) return { tone: 'info', text: `${head}\nNothing scheduled today.` };
      const stops = route
        .map((a) => `${plan.jobs[a.jobId].code} ${plan.jobs[a.jobId].area} ${formatTime(a.start)}`)
        .join(' → ');
      const travel = route.reduce((n, a) => n + a.travelMin, 0);
      return {
        tone: 'ok',
        text: `${head}\n${route.length} jobs, ${formatDuration(travel)} driving: ${stops}.`,
      };
    }

    case 'busiest': {
      if (!plan) return { tone: 'warn', text: 'There is no plan yet. Say "solve" first.' };
      const ranked = day.technicians
        .map((t) => ({
          t,
          jobs: (plan.routes[t.id] ?? []).length,
          work: (plan.routes[t.id] ?? []).reduce((n, a) => n + (a.finish - a.start), 0),
        }))
        .sort((a, b) => b.work - a.work);
      const top = ranked[0];
      const idle = ranked.filter((r) => r.jobs === 0).map((r) => r.t.name);
      return {
        tone: 'info',
        text:
          `Busiest is ${top.t.name} with ${top.jobs} jobs and ${formatDuration(top.work)} of work.` +
          (idle.length
            ? `\nNothing at all for: ${idle.join(', ')}.`
            : '\nEveryone has at least one job.'),
      };
    }

    case 'summary': {
      if (!plan) {
        return {
          tone: 'info',
          text: `${day.id}: ${day.technicians.length} technicians, ${day.jobs.length} jobs, ${day.areas.length} areas. No plan yet — say "solve".`,
        };
      }
      const assigned = day.technicians.reduce((n, t) => n + (plan.routes[t.id] ?? []).length, 0);
      return {
        tone: 'ok',
        text:
          `${day.id}: ${assigned} of ${day.jobs.length} jobs scheduled, ` +
          `${plan.blocked.length} blocked, ${formatDuration(plan.totalTravelMin)} of driving in total.`,
      };
    }

    default:
      return null; // the command changes the plan; the board answers for it
  }
}

/** Convenience for tests and for the "try this" chips in the console. */
export const EXAMPLE_COMMANDS = [
  'summary',
  "what can't be done?",
  'who is busiest?',
  'show the map',
];

export { parseHM };
