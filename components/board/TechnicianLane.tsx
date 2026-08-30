'use client';

import { motion } from 'framer-motion';

import { buildTimeline, type Segment } from '@/lib/plan';
import { colourFor, type SkillColours } from '@/lib/palette';
import { formatDuration, formatSpan } from '@/lib/time';
import type { Job, Plan, Technician } from '@/lib/types';
import { skillLabel } from '@/lib/types';

/**
 * One technician's day drawn on a percentage-scaled track. No Gantt library:
 * every block is an absolutely positioned div whose left and width are a
 * percentage of the board window.
 *
 * The three block types the requirement names are separated by height as well
 * as by fill, so they stay distinguishable at a glance and in a screenshot:
 * jobs are full-height solid chips, travel is a hatched half-height bar, idle
 * is a thin low-contrast tint.
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
}

function pct(value: number, dayStart: number, span: number): string {
  return `${((value - dayStart) / span) * 100}%`;
}

export function TechnicianLane({
  tech, plan, dayStart, dayEnd, colours, striped, selectedJobId, onSelectJob,
}: Props) {
  const span = dayEnd - dayStart;
  const segments = buildTimeline(tech, plan);
  const route = plan.routes[tech.id] ?? [];
  const jobCount = route.length;

  return (
    <div
      className={`flex items-stretch border-b border-hairline ${striped ? 'bg-lane-alt' : 'bg-lane'}`}
    >
      {/* Lane header: who this is, and the two facts that constrain them. */}
      <div className="w-[13.5rem] shrink-0 border-r border-hairline px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">{tech.name}</span>
          <span className="num text-[10px] text-muted-foreground">{tech.id}</span>
        </div>
        <div className="num mt-0.5 text-[11px] text-muted-foreground">
          {formatSpan(tech.shiftStart, tech.shiftEnd)} · {tech.homeArea}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {tech.skills.map((s) => (
            <span
              key={s}
              title={skillLabel(s)}
              className="inline-block h-1.5 w-4 rounded-full"
              style={{ background: colourFor(colours, s) }}
            />
          ))}
          <span className="num ml-auto text-[10px] text-muted-foreground">
            {jobCount === 0 ? 'no jobs' : `${jobCount} job${jobCount === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* The track. */}
      <div className="relative h-[3.25rem] flex-1">
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
          />
        ))}
      </div>
    </div>
  );
}

function SegmentBlock({
  seg, plan, tech, dayStart, span, colours, selected, onSelectJob,
}: {
  seg: Segment;
  plan: Plan;
  tech: Technician;
  dayStart: number;
  span: number;
  colours: SkillColours;
  selected: boolean;
  onSelectJob: (jobId: string | null) => void;
}) {
  const left = pct(seg.from, dayStart, span);
  const width = `${((seg.to - seg.from) / span) * 100}%`;

  if (seg.kind === 'idle') {
    return (
      <div
        className="tint-idle absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm"
        style={{ left, width }}
        title={`Idle ${formatSpan(seg.from, seg.to)} · ${formatDuration(seg.to - seg.from)}`}
      />
    );
  }

  if (seg.kind === 'travel') {
    return (
      <div
        className="hatch-travel absolute top-1/2 h-4 -translate-y-1/2 rounded-[2px]"
        style={{ left, width }}
        title={`Travel ${seg.fromArea} → ${seg.toArea} · ${formatDuration(seg.to - seg.from)} (${formatSpan(seg.from, seg.to)})`}
      />
    );
  }

  const job: Job | undefined = seg.jobId ? plan.jobs[seg.jobId] : undefined;
  if (!job) return null;
  const colour = colourFor(colours, job.skill);

  return (
    <motion.div
      layout
      layoutId={`job-${job.id}`}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="absolute top-1/2 h-8 -translate-y-1/2 overflow-hidden rounded-[3px]"
      style={{ left, width, background: colour }}
    >
      <button
        type="button"
        onClick={() => onSelectJob(selected ? null : job.id)}
        title={
          `${job.code} · ${job.customer}\n` +
          `${skillLabel(job.skill)} in ${job.area} · ${formatDuration(job.durationMin)}\n` +
          `Booked ${formatSpan(seg.from, seg.to)}\n` +
          `Customer window ${formatSpan(job.windowStart, job.windowEnd)}\n` +
          `${tech.name}`
        }
        className={`flex h-full w-full items-center gap-1 px-1.5 text-left outline-none ${
          selected ? 'ring-2 ring-inset ring-foreground/70' : 'hover:ring-1 hover:ring-inset hover:ring-foreground/40'
        }`}
      >
        <span
          className="num shrink-0 text-[11px] font-semibold leading-none"
          style={{ color: 'oklch(0.16 0.02 250)' }}
        >
          {job.code}
        </span>
        <span
          className="truncate text-[10.5px] leading-none"
          style={{ color: 'oklch(0.22 0.02 250)' }}
        >
          {job.area}
        </span>
      </button>
    </motion.div>
  );
}
