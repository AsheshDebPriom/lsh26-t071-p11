'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';

import type { MovePreview } from '@/lib/moves';
import { buildTimeline, type Segment } from '@/lib/plan';
import { colourFor, type SkillColours } from '@/lib/palette';
import { formatDuration, formatSpan, formatTime } from '@/lib/time';
import type { Job, Plan, Technician } from '@/lib/types';
import { skillLabel } from '@/lib/types';

/**
 * One technician's day on a percentage-scaled track. No Gantt library: every
 * block is an absolutely positioned div whose left and width are a percentage
 * of the board window.
 *
 * The shift is drawn as a recessed rail from shift start to shift end, and the
 * day is laid on top of it. That single change is what makes the lane readable:
 * a job is a raised chip, driving is a hatched bar, waiting is a lighter fill on
 * the rail, and anything off the rail is simply not their shift. All four states
 * are distinguishable by shape alone, before colour is considered.
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
  onCallInSick?: (techId: string) => void;
  offSick?: boolean;
  nowMinutes?: number | null;
  highlighted?: boolean;
  onHighlight?: (techId: string | null) => void;
  /** Stagger the entrance so a solved plan arrives lane by lane. */
  index: number;
  /**
   * While a job is being dragged, what the rules say about dropping it here.
   * Undefined when nothing is being dragged.
   */
  dropVerdict?: MovePreview;
  draggingJobId?: string | null;
}

export function TechnicianLane({
  tech, plan, dayStart, dayEnd, colours, striped, selectedJobId, onSelectJob,
  onCallInSick, offSick = false, nowMinutes = null, highlighted = false, onHighlight, index,
  dropVerdict, draggingJobId = null,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `tech:${tech.id}`, disabled: offSick });
  const span = dayEnd - dayStart;
  const segments = buildTimeline(tech, plan);
  const route = plan.routes[tech.id] ?? [];
  const workMin = route.reduce((n, a) => n + (a.finish - a.start), 0);
  const travelMin = route.reduce((n, a) => n + a.travelMin, 0);

  const pct = (m: number) => ((m - dayStart) / span) * 100;

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: offSick ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(0.3, index * 0.022) }}
      onMouseEnter={() => onHighlight?.(tech.id)}
      onMouseLeave={() => onHighlight?.(null)}
      className={`relative flex items-stretch border-b border-hairline transition-colors ${
        highlighted ? 'bg-panel-2' : striped ? 'bg-lane-alt' : 'bg-lane'
      }`}
      style={
        dropVerdict && !dropVerdict.current
          ? {
              // While a job is in the air, every lane says whether it may land.
              boxShadow: isOver
                ? `inset 0 0 0 2px ${dropVerdict.ok ? 'var(--skill-2)' : 'var(--alarm)'}`
                : `inset 2px 0 0 ${dropVerdict.ok ? 'var(--skill-2)' : 'var(--alarm)'}`,
              background: isOver
                ? dropVerdict.ok
                  ? 'oklch(0.655 0.088 158 / 12%)'
                  : 'var(--alarm-dim)'
                : undefined,
              opacity: offSick ? 0.5 : dropVerdict.ok ? 1 : 0.62,
            }
          : undefined
      }
    >
      {/* Who this is, and the facts that constrain them. */}
      <div className="w-[15rem] shrink-0 border-r border-hairline px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-foreground">{tech.name}</span>
          <span className="num text-[11px] text-muted-foreground">{tech.id}</span>
          {offSick && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: 'var(--alarm-dim)', color: 'var(--alarm)' }}
            >
              Off sick
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-baseline gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="num">{formatSpan(tech.shiftStart, tech.shiftEnd)}</span>
          <span className="opacity-60">·</span>
          <span className="truncate">{tech.homeArea}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tech.skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] text-foreground/90"
              style={{ background: 'oklch(1 0 0 / 7%)' }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: colourFor(colours, s) }}
              />
              {skillLabel(s)}
            </span>
          ))}
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {route.length === 0 ? (
              'No jobs'
            ) : (
              <>
                <span className="num text-foreground">{route.length}</span> jobs ·{' '}
                <span className="num">{formatDuration(workMin)}</span> work ·{' '}
                <span className="num">{formatDuration(travelMin)}</span> driving
              </>
            )}
          </span>
          {dropVerdict ? (
            <span
              className="num ml-auto shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={
                dropVerdict.current
                  ? { background: 'oklch(1 0 0 / 8%)', color: 'var(--muted-foreground)' }
                  : dropVerdict.ok
                    ? { background: 'oklch(0.655 0.088 158 / 20%)', color: 'var(--skill-2)' }
                    : { background: 'var(--alarm-dim)', color: 'var(--alarm)' }
              }
              title={dropVerdict.detail}
            >
              {dropVerdict.current
                ? 'has it'
                : dropVerdict.ok
                  ? `drop → ${formatTime(dropVerdict.start ?? 0)}`
                  : dropVerdict.rule}
            </span>
          ) : (
            onCallInSick &&
            !offSick && (
              <button
                type="button"
                onClick={() => onCallInSick(tech.id)}
                title={`${tech.name} calls in sick — redistribute their remaining jobs`}
                className="ml-auto shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:border-[var(--alarm)] hover:text-[var(--alarm)]"
              >
                Sick
              </button>
            )
          )}
        </div>
      </div>

      {/* The track. */}
      <div className="relative h-[3.5rem] flex-1">
        {/* The shift rail. Everything the technician can do happens on this. */}
        <div
          className="absolute top-1/2 h-6 -translate-y-1/2 rounded-full"
          style={{
            left: `${pct(tech.shiftStart)}%`,
            width: `${((tech.shiftEnd - tech.shiftStart) / span) * 100}%`,
            background: 'oklch(1 0 0 / 4%)',
            boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 6%)',
          }}
          title={`${tech.name} is on shift ${formatSpan(tech.shiftStart, tech.shiftEnd)}`}
        />

        {segments.map((seg, i) => (
          <SegmentBlock
            key={`${seg.kind}-${seg.from}-${i}`}
            seg={seg}
            plan={plan}
            tech={tech}
            pct={pct}
            span={span}
            colours={colours}
            selected={seg.jobId != null && seg.jobId === selectedJobId}
            onSelectJob={onSelectJob}
            nowMinutes={nowMinutes}
            dragging={seg.jobId != null && seg.jobId === draggingJobId}
          />
        ))}
      </div>
    </motion.div>
  );
}

function SegmentBlock({
  seg, plan, tech, pct, span, colours, selected, onSelectJob, nowMinutes, dragging,
}: {
  seg: Segment;
  plan: Plan;
  tech: Technician;
  pct: (m: number) => number;
  span: number;
  colours: SkillColours;
  selected: boolean;
  onSelectJob: (jobId: string | null) => void;
  nowMinutes: number | null;
  dragging: boolean;
}) {
  const left = `${pct(seg.from)}%`;
  const widthPct = ((seg.to - seg.from) / span) * 100;
  const width = `${widthPct}%`;

  if (seg.kind === 'idle') {
    return (
      <div
        className="tint-idle absolute top-1/2 h-6 -translate-y-1/2 rounded-full"
        style={{ left, width }}
        title={`Waiting ${formatDuration(seg.to - seg.from)} (${formatSpan(seg.from, seg.to)}) — the customer window is not open yet`}
      />
    );
  }

  if (seg.kind === 'travel') {
    return (
      <div
        className="hatch-travel absolute top-1/2 h-[1.15rem] -translate-y-1/2 rounded-[3px]"
        style={{ left, width }}
        title={`Driving ${seg.fromArea} → ${seg.toArea} · ${formatDuration(seg.to - seg.from)} (${formatSpan(seg.from, seg.to)})`}
      />
    );
  }

  const job: Job | undefined = seg.jobId ? plan.jobs[seg.jobId] : undefined;
  if (!job) return null;

  return (
    <JobBlock
      job={job}
      tech={tech}
      colour={colourFor(colours, job.skill)}
      left={left}
      width={width}
      widthPct={widthPct}
      from={seg.from}
      to={seg.to}
      selected={selected}
      onSelectJob={onSelectJob}
      started={nowMinutes !== null && seg.from <= nowMinutes}
      dragging={dragging}
    />
  );
}

/**
 * A scheduled job. Draggable to another lane, and clickable to inspect —
 * dnd-kit only starts a drag after a few pixels of movement, so a click still
 * selects. The dropdown in the strip below stays as the keyboard route.
 */
function JobBlock({
  job, tech, colour, left, width, widthPct, from, to, selected, onSelectJob, started, dragging,
}: {
  job: Job;
  tech: Technician;
  colour: string;
  left: string;
  width: string;
  widthPct: number;
  from: number;
  to: number;
  selected: boolean;
  onSelectJob: (jobId: string | null) => void;
  started: boolean;
  dragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `job:${job.id}`,
    data: { jobId: job.id, from: tech.id },
  });

  return (
    <motion.div
      layout
      layoutId={`job-${job.id}`}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      whileHover={{ scale: 1.04, zIndex: 5 }}
      className="absolute top-1/2 h-[2.1rem] -translate-y-1/2 overflow-hidden rounded-[5px]"
      style={{
        left,
        width,
        background: colour,
        boxShadow: selected
          ? '0 0 0 2px var(--foreground), 0 4px 14px oklch(0 0 0 / 45%)'
          : '0 1px 0 oklch(1 0 0 / 22%) inset, 0 2px 6px oklch(0 0 0 / 35%)',
        zIndex: selected ? 4 : 2,
        opacity: dragging ? 0.32 : 1,
      }}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        onClick={() => onSelectJob(selected ? null : job.id)}
        title={
          `${job.code} — ${job.customer}\n` +
          `${skillLabel(job.skill)} in ${job.area}, ${formatDuration(job.durationMin)} of work\n` +
          `Scheduled ${formatSpan(from, to)} with ${tech.name}\n` +
          `Customer promised ${formatSpan(job.windowStart, job.windowEnd)}\n` +
          `Drag to another technician, or click to inspect`
        }
        className="flex h-full w-full cursor-grab flex-col justify-center px-2 text-left leading-none outline-none active:cursor-grabbing"
        style={{ color: 'oklch(0.19 0.02 250)', touchAction: 'none' }}
      >
        <span className="num flex items-center gap-1 text-[11.5px] font-bold">
          {job.code}
          {started && <span title="Already under way">▶</span>}
        </span>
        {widthPct > 6 && (
          <span className="mt-0.5 truncate text-[10px] font-medium opacity-80">{job.area}</span>
        )}
      </button>
    </motion.div>
  );
}
