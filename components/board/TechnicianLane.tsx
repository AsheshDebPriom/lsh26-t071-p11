'use client';

import { motion } from 'framer-motion';

import { buildTimeline, type Segment } from '@/lib/plan';
import { colourFor, type SkillColours } from '@/lib/palette';
import { formatDuration, formatSpan, formatTime } from '@/lib/time';
import type { Job, Plan, Technician } from '@/lib/types';
import { skillLabel } from '@/lib/types';

/**
 * One technician's day drawn on a percentage-scaled track. No Gantt library:
 * every block is an absolutely positioned div whose left and width are a
 * percentage of the board window.
 *
 * The three block types the requirement names are separated by height as well
 * as by fill, so they stay distinguishable at a glance and in a screenshot:
 * jobs are tall solid chips, travel is a hatched mid-height bar, idle is a thin
 * low-contrast tint. A fourth, quieter treatment marks the hours outside this
 * technician's shift, so an empty lane never looks like a broken one.
 */

interface Props {
  tech: Technician;
  plan: Plan;
  dayStart: number;
  dayEnd: number;
  colours: SkillColours;
  striped: boolean;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  /** Bonus: take this technician off shift and redistribute their day. */
  onCallInSick?: (techId: string) => void;
  offSick?: boolean;
  /** Jobs already under way at this time cannot be replanned. */
  nowMinutes?: number | null;
}

export function TechnicianLane({
  tech, plan, dayStart, dayEnd, colours, striped, selectedJobId, onSelectJob,
  onCallInSick, offSick = false, nowMinutes = null,
}: Props) {
  const span = dayEnd - dayStart;
  const segments = buildTimeline(tech, plan);
  const route = plan.routes[tech.id] ?? [];
  const jobCount = route.length;
  const workMin = route.reduce((n, a) => n + (a.finish - a.start), 0);

  const left = (m: number) => `${((m - dayStart) / span) * 100}%`;
  const width = (from: number, to: number) => `${((to - from) / span) * 100}%`;

  return (
    <div
      className={`flex items-stretch border-b border-hairline ${striped ? 'bg-lane-alt' : 'bg-lane'} ${
        offSick ? 'opacity-45' : ''
      }`}
    >
      {/* Lane header: who this is, and the facts that constrain them. */}
      <div className="w-[16rem] shrink-0 border-r border-hairline px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-foreground">{tech.name}</span>
          <span className="num text-[11px] text-muted-foreground">{tech.id}</span>
          {offSick && (
            <span
              className="num ml-auto rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: 'var(--alarm-dim)', color: 'var(--alarm)' }}
            >
              Off sick
            </span>
          )}
        </div>

        <div className="num mt-1 text-[12px] text-muted-foreground">
          {formatSpan(tech.shiftStart, tech.shiftEnd)} · home {tech.homeArea}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tech.skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-[3px] px-1 py-px text-[10.5px] text-foreground/90"
              style={{ background: 'oklch(1 0 0 / 6%)' }}
            >
              <span
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ background: colourFor(colours, s) }}
              />
              {skillLabel(s)}
            </span>
          ))}
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="num text-[11px] text-muted-foreground">
            {jobCount === 0 ? 'No jobs today' : `${jobCount} job${jobCount === 1 ? '' : 's'} · ${formatDuration(workMin)}`}
          </span>
          {onCallInSick && !offSick && (
            <button
              type="button"
              onClick={() => onCallInSick(tech.id)}
              title={`Take ${tech.name} off shift and redistribute their remaining jobs`}
              className="num ml-auto rounded-[3px] border border-hairline px-1.5 py-px text-[10px] uppercase tracking-wider text-muted-foreground hover:border-[var(--alarm)] hover:text-[var(--alarm)]"
            >
              Sick
            </button>
          )}
        </div>
      </div>

      {/* The track. */}
      <div className="relative h-[4rem] flex-1">
        {/* Hours outside the shift, so an empty lane reads as "not on" rather than "broken". */}
        {tech.shiftStart > dayStart && (
          <div
            className="tint-offshift absolute inset-y-0"
            style={{ left: left(dayStart), width: width(dayStart, tech.shiftStart) }}
            title={`${tech.name} is not on shift before ${formatTime(tech.shiftStart)}`}
          />
        )}
        {tech.shiftEnd < dayEnd && (
          <div
            className="tint-offshift absolute inset-y-0"
            style={{ left: left(tech.shiftEnd), width: width(tech.shiftEnd, dayEnd) }}
            title={`${tech.name} is not on shift after ${formatTime(tech.shiftEnd)}`}
          />
        )}

        {segments.map((seg, i) => (
          <SegmentBlock
            key={`${seg.kind}-${seg.from}-${i}`}
            seg={seg}
            plan={plan}
            tech={tech}
            dayStart={dayStart}
            span={span}
            colours={colours}
            selected={seg.jobId != null && seg.jobId === selectedJobId}
            onSelectJob={onSelectJob}
            nowMinutes={nowMinutes}
          />
        ))}
      </div>
    </div>
  );
}

function SegmentBlock({
  seg, plan, tech, dayStart, span, colours, selected, onSelectJob, nowMinutes,
}: {
  seg: Segment;
  plan: Plan;
  tech: Technician;
  dayStart: number;
  span: number;
  colours: SkillColours;
  selected: boolean;
  onSelectJob: (jobId: string | null) => void;
  nowMinutes: number | null;
}) {
  const left = `${((seg.from - dayStart) / span) * 100}%`;
  const widthPct = ((seg.to - seg.from) / span) * 100;
  const width = `${widthPct}%`;

  if (seg.kind === 'idle') {
    return (
      <div
        className="tint-idle absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
        style={{ left, width }}
        title={`Idle — waiting ${formatDuration(seg.to - seg.from)} (${formatSpan(seg.from, seg.to)})`}
      />
    );
  }

  if (seg.kind === 'travel') {
    return (
      <div
        className="hatch-travel absolute top-1/2 h-5 -translate-y-1/2 rounded-[2px]"
        style={{ left, width }}
        title={`Driving ${seg.fromArea} → ${seg.toArea} · ${formatDuration(seg.to - seg.from)} (${formatSpan(seg.from, seg.to)})`}
      />
    );
  }

  const job: Job | undefined = seg.jobId ? plan.jobs[seg.jobId] : undefined;
  if (!job) return null;
  const colour = colourFor(colours, job.skill);
  const started = nowMinutes !== null && seg.from <= nowMinutes;

  return (
    <motion.div
      layout
      layoutId={`job-${job.id}`}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="absolute top-1/2 h-9 -translate-y-1/2 overflow-hidden rounded-[4px]"
      style={{
        left,
        width,
        background: colour,
        boxShadow: selected ? '0 0 0 2px var(--foreground)' : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => onSelectJob(selected ? null : job.id)}
        title={
          `${job.code} — ${job.customer}\n` +
          `${skillLabel(job.skill)} in ${job.area}, ${formatDuration(job.durationMin)} of work\n` +
          `Scheduled ${formatSpan(seg.from, seg.to)} with ${tech.name}\n` +
          `Customer promised ${formatSpan(job.windowStart, job.windowEnd)}\n` +
          `Click to inspect or move this job`
        }
        className="flex h-full w-full flex-col justify-center gap-px px-1.5 text-left outline-none hover:brightness-110"
        style={{ color: 'oklch(0.17 0.02 250)' }}
      >
        <span className="num flex items-center gap-1 text-[12px] font-bold leading-none">
          {job.code}
          {started && <span title="Already under way">▶</span>}
        </span>
        {widthPct > 7 && (
          <span className="num truncate text-[10.5px] leading-none opacity-85">
            {formatTime(seg.from)} {job.area}
          </span>
        )}
      </button>
    </motion.div>
  );
}
