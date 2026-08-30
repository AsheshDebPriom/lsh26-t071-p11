'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { colourFor, type SkillColours } from '@/lib/palette';
import { findTechForJob } from '@/lib/plan';
import { formatDuration, formatSpan, formatTime } from '@/lib/time';
import type { DayCase, Plan, Technician } from '@/lib/types';
import { RULE_LABEL, RULE_MEANING, RULE_ORDER, skillLabel } from '@/lib/types';

import { MoveControl } from './MoveControl';

/**
 * The key to the board, plus the detail strip for whichever job is selected.
 * The four block types are always visible because nobody should have to guess
 * what a stripe means; the rule glossary sits behind a toggle because it is
 * reference material, not something you read every time.
 */

interface Props {
  day: DayCase;
  colours: SkillColours;
  plan: Plan;
  idleMin: number;
  selectedJobId: string | null;
  onMove: (jobId: string, techId: string) => void;
  /** Technicians still on shift. Someone off sick is not a destination. */
  technicians: Technician[];
}

export function Legend({ day, colours, plan, idleMin, selectedJobId, onMove, technicians }: Props) {
  const [showRules, setShowRules] = useState(false);

  const job = selectedJobId ? plan.jobs[selectedJobId] : undefined;
  const techId = job ? findTechForJob(plan, job.id) : null;
  const tech = techId ? day.technicians.find((t) => t.id === techId) : undefined;
  const assignment = tech ? (plan.routes[tech.id] ?? []).find((a) => a.jobId === job?.id) : undefined;
  const offShiftCount = day.technicians.length - technicians.length;

  const skills = Object.keys(colours).sort();

  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-hairline bg-panel">
      {/* Selected job: everything about it, and where else it could go. */}
      <AnimatePresence>
        {job && (
          <motion.div
            key={job.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-hairline bg-panel-2"
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
              <span className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-[3px]"
                  style={{ background: colourFor(colours, job.skill) }}
                />
                <span className="num text-[15px] font-bold text-foreground">{job.code}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {skillLabel(job.skill)} in {job.area}, {formatDuration(job.durationMin)}
                </span>
              </span>

              <span className="text-[12.5px] text-muted-foreground">
                promised <span className="num">{formatSpan(job.windowStart, job.windowEnd)}</span>
              </span>

              {assignment && tech ? (
                <span className="text-[12.5px] text-foreground">
                  {tech.name}: drives{' '}
                  <span className="num">{formatDuration(assignment.travelMin)}</span> from{' '}
                  {assignment.fromArea}, arrives{' '}
                  <span className="num">{formatTime(assignment.arrival)}</span>
                  {assignment.start > assignment.arrival && (
                    <>
                      , waits{' '}
                      <span className="num">
                        {formatDuration(assignment.start - assignment.arrival)}
                      </span>
                    </>
                  )}
                  , works <span className="num">{formatSpan(assignment.start, assignment.finish)}</span>
                </span>
              ) : (
                <span className="text-[12.5px] font-semibold" style={{ color: 'var(--alarm)' }}>
                  Not scheduled
                </span>
              )}

              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
                  Move to
                </span>
                <span className="w-72">
                  <MoveControl
                    job={job}
                    plan={plan}
                    technicians={technicians}
                    currentTechId={techId}
                    onMove={onMove}
                  />
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The key, always on. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Key swatch={<span className="h-5 w-8 rounded-[5px]" style={{ background: 'var(--skill-1)', boxShadow: '0 1px 0 oklch(1 0 0 / 22%) inset' }} />}>
            Job
          </Key>
          <Key swatch={<span className="hatch-travel h-[1.15rem] w-8 rounded-[3px]" />}>Driving</Key>
          <Key swatch={<span className="tint-idle h-6 w-8 rounded-full" />}>
            Waiting <span className="num opacity-70">({formatDuration(idleMin)})</span>
          </Key>
          <Key swatch={<span className="h-6 w-8 rounded-full" style={{ background: 'oklch(1 0 0 / 4%)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 6%)' }} />}>
            On shift
          </Key>
        </span>

        <span className="h-4 w-px bg-hairline" />

        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {skills.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[12.5px] text-foreground">
              <span
                className="inline-block h-3 w-3 rounded-[3px]"
                style={{ background: colourFor(colours, s) }}
              />
              {skillLabel(s)}
            </span>
          ))}
        </span>

        {offShiftCount > 0 && (
          <span className="text-[12px]" style={{ color: 'var(--alarm)' }}>
            {offShiftCount} off sick
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowRules((v) => !v)}
          className="ml-auto rounded-md border border-hairline px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
        >
          {showRules ? 'Hide' : 'Show'} the five hard rules
        </button>
      </div>

      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-hairline"
          >
            <ul className="grid gap-x-6 gap-y-1 px-5 py-2.5 lg:grid-cols-2 xl:grid-cols-3">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Key({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-foreground">
      <span className="inline-flex shrink-0 items-center">{swatch}</span>
      {children}
    </span>
  );
}
