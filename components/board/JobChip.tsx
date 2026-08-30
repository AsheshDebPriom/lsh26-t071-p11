'use client';

import { formatDuration } from '@/lib/time';
import type { Job } from '@/lib/types';
import { skillLabel } from '@/lib/types';

/**
 * The block that follows the pointer during a drag. Deliberately carries more
 * than the block on the board does — while you are holding a job, the thing you
 * need to remember is what it needs and how long it takes.
 */
export function JobChip({ job, colour }: { job: Job; colour: string }) {
  return (
    <div
      className="pointer-events-none flex items-center gap-2 rounded-[6px] px-2.5 py-1.5"
      style={{
        background: colour,
        color: 'oklch(0.19 0.02 250)',
        boxShadow: '0 10px 26px oklch(0 0 0 / 55%), 0 1px 0 oklch(1 0 0 / 25%) inset',
        cursor: 'grabbing',
      }}
    >
      <span className="num text-[12.5px] font-bold leading-none">{job.code}</span>
      <span className="text-[11px] font-medium leading-none opacity-85">
        {skillLabel(job.skill)} · {job.area} · {formatDuration(job.durationMin)}
      </span>
    </div>
  );
}
