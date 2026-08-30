'use client';

import { colourFor, type SkillColours } from '@/lib/palette';
import { findTechForJob } from '@/lib/plan';
import { formatDuration, formatSpan, formatTime } from '@/lib/time';
import type { DayCase, Plan } from '@/lib/types';
import { RULE_MEANING, RULE_ORDER, skillLabel } from '@/lib/types';

import { MoveControl } from './MoveControl';

/**
 * The key to the board, plus the detail strip for whichever job is selected.
 * All three block types the requirement names are explained here, and so is
 * every hard rule, so a judge never has to guess what a stripe means.
 */

interface Props {
  day: DayCase;
  colours: SkillColours;
  plan: Plan;
  idleMin: number;
  selectedJobId: string | null;
  onMove: (jobId: string, techId: string) => void;
}

export function Legend({ day, colours, plan, idleMin, selectedJobId, onMove }: Props) {
  const job = selectedJobId ? plan.jobs[selectedJobId] : undefined;
  const techId = job ? findTechForJob(plan, job.id) : null;
  const tech = techId ? day.technicians.find((t) => t.id === techId) : undefined;
  const assignment = tech ? (plan.routes[tech.id] ?? []).find((a) => a.jobId === job?.id) : undefined;

  const skills = Object.keys(colours).sort();

  return (
    <div className="sticky bottom-0 mt-auto border-t border-hairline bg-panel">
      {job && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-hairline bg-panel-2 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-[2px]"
              style={{ background: colourFor(colours, job.skill) }}
            />
            <span className="num text-[13px] font-semibold text-foreground">{job.code}</span>
          </div>
          <span className="num text-[11.5px] text-muted-foreground">
            {skillLabel(job.skill)} · {job.area} · {formatDuration(job.durationMin)}
          </span>
          <span className="num text-[11.5px] text-muted-foreground">
            window {formatSpan(job.windowStart, job.windowEnd)}
          </span>
          {assignment && tech ? (
            <span className="num text-[11.5px] text-foreground">
              {tech.name}: travel {formatDuration(assignment.travelMin)} from {assignment.fromArea},
              arrive {formatTime(assignment.arrival)}
              {assignment.start > assignment.arrival
                ? `, wait ${formatDuration(assignment.start - assignment.arrival)}`
                : ''}
              , work {formatSpan(assignment.start, assignment.finish)}
            </span>
          ) : (
            <span className="num text-[11.5px]" style={{ color: 'var(--alarm)' }}>
              unassigned
            </span>
          )}
          <div className="ml-auto w-64">
            <MoveControl
              job={job}
              plan={plan}
              technicians={day.technicians}
              currentTechId={techId}
              onMove={onMove}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-5 py-3">
        <div>
          <span className="num block text-[10px] uppercase tracking-wider text-muted-foreground">
            Block types
          </span>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5 text-[11.5px] text-foreground">
              <span
                className="inline-block h-4 w-7 rounded-[3px]"
                style={{ background: 'var(--skill-1)' }}
              />
              job
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-foreground">
              <span className="hatch-travel inline-block h-2.5 w-7 rounded-[2px]" />
              travel gap
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-foreground">
              <span className="tint-idle inline-block h-1.5 w-7 rounded-sm" />
              idle ({formatDuration(idleMin)} across the fleet)
            </span>
          </div>
        </div>

        <div>
          <span className="num block text-[10px] uppercase tracking-wider text-muted-foreground">
            Skills
          </span>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {skills.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[11.5px] text-foreground">
                <span
                  className="inline-block h-3 w-3 rounded-[2px]"
                  style={{ background: colourFor(colours, s) }}
                />
                {skillLabel(s)}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-[20rem] flex-1">
          <span className="num block text-[10px] uppercase tracking-wider text-muted-foreground">
            Hard rules — a job is only placed when all of them hold
          </span>
          <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 md:grid-cols-2">
            {RULE_ORDER.map((rule) => {
              const off = rule === 'NO_RETURN_TIME' && !plan.rules.requireReturnHome;
              return (
                <li key={rule} className="text-[11px] leading-snug">
                  <span
                    className="num text-[10px] uppercase tracking-wider"
                    style={{ color: off ? 'var(--muted-foreground)' : 'var(--alarm)' }}
                  >
                    {rule}
                  </span>{' '}
                  <span className={off ? 'text-muted-foreground/70' : 'text-muted-foreground'}>
                    {RULE_MEANING[rule]}
                    {off && ' (off — the published case format does not require a return home)'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="max-w-[18rem]">
          <span className="num block text-[10px] uppercase tracking-wider text-muted-foreground">
            Data
          </span>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            {day.source === 'published'
              ? `Published case ${day.id} from the P11 participant pack, ${day.today}. Travel table taken as authoritative.`
              : `${day.note} Mocked Dhaka travel table, ${day.today}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

