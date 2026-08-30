'use client';

import { colourFor, type SkillColours } from '@/lib/palette';
import { findTechForJob } from '@/lib/plan';
import { formatDuration, formatSpan, formatTime } from '@/lib/time';
import type { DayCase, Plan } from '@/lib/types';
import { RULE_LABEL, RULE_MEANING, RULE_ORDER, skillLabel } from '@/lib/types';

import { MoveControl } from './MoveControl';

/**
 * The key to the board, plus the detail strip for whichever job is selected.
 * All three block types the requirement names are explained here, and so is
 * every hard rule, so nobody has to guess what a stripe means.
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
      {/* Selected job: everything about it, and where else it could go. */}
      {job && (
        <div className="border-b border-hairline bg-panel-2 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3.5 w-3.5 rounded-[3px]"
                style={{ background: colourFor(colours, job.skill) }}
              />
              <span className="num text-[15px] font-bold text-foreground">{job.code}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {skillLabel(job.skill)} in {job.area}, {formatDuration(job.durationMin)}
              </span>
            </div>

            <span className="num text-[12.5px] text-muted-foreground">
              Customer promised {formatSpan(job.windowStart, job.windowEnd)}
            </span>

            {assignment && tech ? (
              <span className="num text-[12.5px] text-foreground">
                {tech.name}: drives {formatDuration(assignment.travelMin)} from {assignment.fromArea},
                arrives {formatTime(assignment.arrival)}
                {assignment.start > assignment.arrival
                  ? `, waits ${formatDuration(assignment.start - assignment.arrival)}`
                  : ''}
                , works {formatSpan(assignment.start, assignment.finish)}
              </span>
            ) : (
              <span className="num text-[12.5px] font-semibold" style={{ color: 'var(--alarm)' }}>
                Not scheduled
              </span>
            )}

            <label className="ml-auto flex items-center gap-2">
              <span className="num text-[11px] uppercase tracking-wider text-muted-foreground">
                Move this job
              </span>
              <span className="w-72">
                <MoveControl
                  job={job}
                  plan={plan}
                  technicians={day.technicians}
                  currentTechId={techId}
                  onMove={onMove}
                />
              </span>
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-5 py-3">
        <div>
          <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
            How to read a lane
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            <LegendItem swatch={<span className="inline-block h-5 w-9 rounded-[4px]" style={{ background: 'var(--skill-1)' }} />}>
              <strong className="font-semibold text-foreground">Job</strong> — working on site
            </LegendItem>
            <LegendItem swatch={<span className="hatch-travel inline-block h-3.5 w-9 rounded-[2px]" />}>
              <strong className="font-semibold text-foreground">Driving</strong> — travelling between areas
            </LegendItem>
            <LegendItem swatch={<span className="tint-idle inline-block h-2 w-9 rounded-sm" />}>
              <strong className="font-semibold text-foreground">Idle</strong> — waiting for a window to open ({formatDuration(idleMin)} today)
            </LegendItem>
            <LegendItem swatch={<span className="tint-offshift inline-block h-5 w-9 rounded-[2px] border border-hairline" />}>
              <strong className="font-semibold text-foreground">Off shift</strong> — not working these hours
            </LegendItem>
          </div>
        </div>

        <div>
          <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Job colours
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            {skills.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[12.5px] text-foreground">
                <span
                  className="inline-block h-3.5 w-3.5 rounded-[3px]"
                  style={{ background: colourFor(colours, s) }}
                />
                {skillLabel(s)}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-[24rem] flex-1">
          <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
            The hard rules — a job is only placed when all of them hold
          </span>
          <ul className="mt-2 grid gap-x-6 gap-y-1 lg:grid-cols-2">
            {RULE_ORDER.map((rule) => {
              const off = rule === 'NO_RETURN_TIME' && !plan.rules.requireReturnHome;
              return (
                <li key={rule} className="text-[11.5px] leading-snug">
                  <span
                    className="font-semibold"
                    style={{ color: off ? 'var(--muted-foreground)' : 'var(--foreground)' }}
                  >
                    {RULE_LABEL[rule]}
                  </span>
                  <span className="text-muted-foreground"> — {RULE_MEANING[rule]}</span>
                  {off && (
                    <span className="text-muted-foreground/70">
                      {' '}(off: the published case format does not require a return home)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="max-w-[17rem]">
          <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Where the data comes from
          </span>
          <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
            {day.source === 'published'
              ? `Published case ${day.id} from the P11 participant pack, ${day.today}. Its area-to-area travel table is taken as authoritative.`
              : `${day.note} Invented Dhaka travel table, ${day.today}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      {swatch}
      <span>{children}</span>
    </span>
  );
}
