'use client';

import { useMemo } from 'react';

import { bestPlacementOnTech, withoutJob } from '@/lib/plan';
import { formatTime } from '@/lib/time';
import type { Job, Plan, Technician } from '@/lib/types';

/**
 * Requirement 4, the dispatcher's hand on the board.
 *
 * Every technician is listed, and each option is pre-flighted through
 * checkFeasible before it is opened: legal moves show the time the job would
 * start, illegal ones name the rule that stops them. Choosing an illegal one
 * still reports up, so the board can state the rejection in full.
 */

interface Props {
  job: Job;
  plan: Plan;
  technicians: Technician[];
  /** The technician who currently holds the job, or null if it is unassigned. */
  currentTechId: string | null;
  onMove: (jobId: string, techId: string) => void;
  label?: string;
}

export function MoveControl({ job, plan, technicians, currentTechId, onMove, label = 'Move to…' }: Props) {
  // The move is judged against a board with this job lifted off, so a job never
  // blocks itself.
  const options = useMemo(() => {
    const lifted = currentTechId ? withoutJob(plan, job.id, technicians) : plan;
    return technicians.map((tech) => {
      if (tech.id === currentTechId) {
        return { tech, ok: false as const, text: 'current technician', current: true };
      }
      const attempt = bestPlacementOnTech(lifted, job, tech);
      return attempt.ok
        ? { tech, ok: true as const, text: `starts ${formatTime(attempt.placement.result.start)}`, current: false }
        : { tech, ok: false as const, text: attempt.rule, current: false };
    });
  }, [job, plan, technicians, currentTechId]);

  const legal = options.filter((o) => o.ok).length;

  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="sr-only">{label} for {job.code}</span>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onMove(job.id, e.target.value);
          e.target.value = '';
        }}
        className="num min-w-0 flex-1 truncate rounded-[4px] border border-input bg-panel-2 px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-ring"
      >
        <option value="">
          {label} — {legal} of {options.length} legal
        </option>
        {options.map((o) => (
          <option key={o.tech.id} value={o.tech.id} disabled={o.current}>
            {o.ok ? '✓' : '✗'} {o.tech.id} {o.tech.name} — {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}
