'use client';

import { useMemo } from 'react';

import { legalCount, previewMoves } from '@/lib/moves';
import { formatTime } from '@/lib/time';
import type { Job, Plan, Technician } from '@/lib/types';

/**
 * Requirement 4, the dispatcher's hand — and the keyboard route to it.
 *
 * Every technician is listed, and each option is pre-flighted through
 * checkFeasible before the list is opened: legal moves show the time the job
 * would start, illegal ones name the rule. Choosing an illegal one still
 * reports up, so the board can state the rejection in full.
 *
 * The verdicts come from the same previewMoves() the drag layer uses, so the
 * dropdown and the drag can never disagree about what is legal.
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
  const options = useMemo(
    () => previewMoves(plan, job, technicians, currentTechId),
    [plan, job, technicians, currentTechId],
  );
  const legal = legalCount(options);

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
            {o.current ? '•' : o.ok ? '✓' : '✗'} {o.tech.id} {o.tech.name} —{' '}
            {o.current
              ? 'current technician'
              : o.ok
                ? `starts ${formatTime(o.start ?? 0)}`
                : o.rule}
          </option>
        ))}
      </select>
    </label>
  );
}
