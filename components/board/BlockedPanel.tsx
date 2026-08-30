'use client';

import { useState } from 'react';

import { colourFor, type SkillColours } from '@/lib/palette';
import { formatDuration, formatSpan, formatTime } from '@/lib/time';
import type { BlockedJob, Plan, Technician } from '@/lib/types';
import { RULE_LABEL, RULE_MEANING, skillLabel } from '@/lib/types';

import { MoveControl } from './MoveControl';

/**
 * The unassigned list. Silence is not an answer, so every job that is not on
 * the board appears here with the exact rule that blocked it, the near-miss in
 * minutes, and — on demand — the verdict for every single technician.
 */

interface Props {
  plan: Plan;
  technicians: Technician[];
  colours: SkillColours;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onMove: (jobId: string, techId: string) => void;
}

export function BlockedPanel({
  plan, technicians, colours, selectedJobId, onSelectJob, onMove,
}: Props) {
  const blocked = [...plan.blocked].sort((a, b) => a.jobId.localeCompare(b.jobId));

  return (
    <aside className="flex h-full min-h-0 w-[25rem] shrink-0 flex-col border-l border-hairline bg-panel">
      <header className="border-b border-hairline px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
            Cannot be done today
          </h2>
          <span
            className="num rounded-[4px] px-2 py-0.5 text-[15px] font-bold"
            style={{
              color: blocked.length ? 'var(--alarm)' : 'var(--muted-foreground)',
              background: blocked.length ? 'var(--alarm-dim)' : 'transparent',
            }}
          >
            {blocked.length}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          Every job the rules would not allow, with the rule that stopped it and the technician who
          came closest.
        </p>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {blocked.length === 0 ? (
          <p className="px-4 py-8 text-[13px] leading-relaxed text-muted-foreground">
            Every job on this day is on the board. Nothing was dropped.
          </p>
        ) : (
          <ul>
            {blocked.map((b) => (
              <BlockedRow
                key={b.jobId}
                blocked={b}
                plan={plan}
                technicians={technicians}
                colours={colours}
                selected={selectedJobId === b.jobId}
                onSelect={() => onSelectJob(selectedJobId === b.jobId ? null : b.jobId)}
                onMove={onMove}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function BlockedRow({
  blocked, plan, technicians, colours, selected, onSelect, onMove,
}: {
  blocked: BlockedJob;
  plan: Plan;
  technicians: Technician[];
  colours: SkillColours;
  selected: boolean;
  onSelect: () => void;
  onMove: (jobId: string, techId: string) => void;
}) {
  const [showAudit, setShowAudit] = useState(false);
  const job = plan.jobs[blocked.jobId];
  if (!job) return null;

  const placeable = blocked.nowPlaceable;
  const accent = placeable ? 'var(--skill-2)' : 'var(--alarm)';

  return (
    <li
      className={`border-b border-hairline px-4 py-3 ${selected ? 'bg-panel-2' : ''}`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-[3px]"
            style={{ background: colourFor(colours, job.skill) }}
          />
          <span className="num text-[14px] font-bold text-foreground">{job.code}</span>
          <span className="truncate text-[12px] text-muted-foreground">
            {skillLabel(job.skill)} in {job.area}
          </span>
        </div>

        <div className="num mt-1 text-[12px] text-muted-foreground">
          Customer promised {formatSpan(job.windowStart, job.windowEnd)} ·{' '}
          {formatDuration(job.durationMin)} of work
        </div>

        <div
          className="mt-2 inline-block rounded-[4px] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            color: accent,
            background: placeable ? 'transparent' : 'var(--alarm-dim)',
            border: placeable ? `1px solid ${accent}` : 'none',
          }}
        >
          {placeable ? 'Now placeable' : RULE_LABEL[blocked.rule]}
        </div>

        <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/90">
          {placeable
            ? `${technicians.find((t) => t.id === placeable.techId)?.name ?? placeable.techId} has room for this now — it could start ${formatTime(placeable.start)}. Assign it below.`
            : blocked.detail}
        </p>
        {!placeable && (
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            <span className="num">{blocked.rule}</span> — {RULE_MEANING[blocked.rule]}
          </p>
        )}
      </button>

      <div className="mt-2.5 flex items-center gap-2">
        <MoveControl
          job={job}
          plan={plan}
          technicians={technicians}
          currentTechId={null}
          onMove={onMove}
          label="Assign to…"
        />
        <button
          type="button"
          onClick={() => setShowAudit((v) => !v)}
          className="num shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {showAudit ? 'Hide' : 'Why all'} {blocked.perTech.length}
        </button>
      </div>

      {showAudit && (
        <ul className="mt-2 space-y-1.5 border-t border-hairline pt-2">
          {blocked.perTech.map((v) => {
            const tech = technicians.find((t) => t.id === v.techId);
            return (
              <li key={v.techId} className="text-[11.5px] leading-snug">
                <span className="text-foreground">{tech?.name ?? v.techId}</span>{' '}
                <span
                  className="num text-[10.5px] uppercase tracking-wider"
                  style={{ color: 'var(--alarm)' }}
                >
                  {v.rule}
                </span>
                <div className="text-muted-foreground">{v.detail}</div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
