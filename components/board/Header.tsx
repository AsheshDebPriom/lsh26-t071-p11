'use client';

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';

import { SCORE_RULE, type PlanScore } from '@/lib/score';
import type { BaselineStats, SolveStats } from '@/lib/solver';
import { formatDuration } from '@/lib/time';
import type { DayCase, Plan, RuleOptions } from '@/lib/types';

/**
 * Identity, then controls, then results — the order someone landing cold needs
 * them. The objective is written out in words beside the number it achieved and
 * the number a random assignment achieves, so "better than random" is shown
 * rather than asserted.
 */

export type BoardView = 'timeline' | 'map';

interface Props {
  day: DayCase;
  cases: DayCase[];
  onPickCase: (id: string) => void;
  rules: RuleOptions;
  onToggleReturnHome: (on: boolean) => void;
  onGenerate: () => void;
  onReset: () => void;
  solving: boolean;
  hasPlan: boolean;
  plan: Plan | null;
  stats: SolveStats | null;
  baseline: BaselineStats | null;
  score: PlanScore | null;
  generatedScore: PlanScore | null;
  edited: boolean;
  onRestore: () => void;
  view: BoardView;
  onView: (v: BoardView) => void;
}

export function Header(props: Props) {
  const {
    day, cases, onPickCase, rules, onToggleReturnHome, onGenerate, onReset,
    solving, hasPlan, plan, stats, baseline, score, generatedScore, edited, onRestore,
    view, onView,
  } = props;

  const savedPct =
    plan && baseline && baseline.meanTravelMin > 0
      ? Math.round(((baseline.meanTravelMin - plan.totalTravelMin) / baseline.meanTravelMin) * 100)
      : null;
  const blocked = plan?.blocked.length ?? 0;

  return (
    <header className="shrink-0 border-b border-hairline bg-panel">
      {/* 1 — What this is. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <h1 className="text-[18px] font-semibold leading-tight tracking-tight text-foreground">
              Dispatch Board
            </h1>
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Plans the day for a Dhaka home-service company — who goes where, in what order, and
              what cannot be done at all.
            </p>
          </div>
        </div>
        <span className="num shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          LSH26-T071 · P11
        </span>
      </div>

      {/* 2 — The controls. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-hairline px-5 py-2.5">
        <Field label="Which day">
          <select
            value={day.id}
            onChange={(e) => onPickCase(e.target.value)}
            className="rounded-md border border-input bg-panel-2 px-2.5 py-1.5 text-[12.5px] text-foreground outline-none transition-colors focus:border-ring"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.technicians.length} technicians, {c.jobs.length} jobs
              </option>
            ))}
          </select>
        </Field>

        <Field label="Plan">
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={onGenerate}
              disabled={solving}
              whileTap={{ scale: 0.97 }}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {solving ? 'Solving…' : hasPlan ? 'Re-solve' : 'Build day plan'}
            </motion.button>
            {hasPlan && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-md border border-hairline bg-panel-2 px-3 py-1.5 text-[12.5px] text-foreground transition-colors hover:border-ring"
              >
                Clear
              </button>
            )}
          </div>
        </Field>

        {hasPlan && (
          <Field label="View">
            <div className="flex rounded-md border border-hairline bg-panel-2 p-0.5">
              {(['timeline', 'map'] as BoardView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onView(v)}
                  className="relative rounded-[5px] px-3 py-1 text-[12.5px] capitalize transition-colors"
                  style={{ color: view === v ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}
                >
                  {view === v && (
                    <motion.span
                      layoutId="view-pill"
                      className="absolute inset-0 rounded-[5px] bg-primary"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{v}</span>
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Optional rule">
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md border border-hairline bg-panel-2 px-2.5 py-1.5"
            title="The published P11 case format says no return home is required, so this is off by default. Turn it on to see what an end-of-shift return policy costs."
          >
            <input
              type="checkbox"
              checked={rules.requireReturnHome}
              onChange={(e) => onToggleReturnHome(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--skill-1)]"
            />
            <span className="text-[12.5px] text-foreground">Must reach home before shift end</span>
          </label>
        </Field>

        <p className="ml-auto max-w-[17rem] text-[11.5px] leading-snug text-muted-foreground">
          {day.source === 'published' ? (
            <>
              Published case <span className="num text-foreground">{day.id}</span> from the P11
              participant pack · <span className="num">{day.today}</span>
            </>
          ) : (
            <>
              {day.label} · invented data · <span className="num">{day.today}</span>
            </>
          )}
        </p>
      </div>

      {/* 3 — The objective and the numbers. */}
      {hasPlan && plan && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-hairline bg-panel-2 px-5 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
            <div className="max-w-[14rem]">
              <Label>Goal being improved</Label>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">
                Minimising total travel time across all technicians
              </p>
            </div>

            <Stat value={score?.assigned ?? 0} unit={`of ${day.jobs.length}`} label="Jobs scheduled" />
            <Stat
              value={blocked}
              unit={blocked === 1 ? 'job' : 'jobs'}
              label="Cannot be done"
              alarm={blocked > 0}
              hint="Listed on the right with the rule that blocked each one"
            />
            <Stat
              value={plan.totalTravelMin}
              format={formatDuration}
              unit="driving"
              label="Total travel"
            />
            {baseline && savedPct !== null && (
              <Stat
                value={savedPct}
                suffix="%"
                unit="less driving"
                label="Better than random"
                good={savedPct > 0}
                hint={`A random legal assignment averages ${formatDuration(baseline.meanTravelMin)} over ${baseline.runs} runs`}
              />
            )}
            {score && <Stat value={score.score} unit="points" label="Plan score" hint={SCORE_RULE} />}

            {stats && (
              <div className="max-w-[15rem]">
                <Label>How it got there</Label>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                  Greedy insertion ({stats.ordering}) reached{' '}
                  <span className="num">{stats.greedyTravelMin}</span> min; the improvement pass took
                  off <span className="num">{stats.greedyTravelMin - stats.totalTravelMin}</span> min
                  with <span className="num">{stats.swapsApplied}</span> swap
                  {stats.swapsApplied === 1 ? '' : 's'} and{' '}
                  <span className="num">{stats.relocationsApplied}</span> relocation
                  {stats.relocationsApplied === 1 ? '' : 's'}.
                </p>
              </div>
            )}
          </div>

          {/* Your edits, measured against the plan the solver built. */}
          {edited && generatedScore && score && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 overflow-hidden border-t border-hairline pt-2.5"
            >
              <Label>Your edits vs the generated plan</Label>
              <Delta label="jobs" now={score.assigned} before={generatedScore.assigned} higherIsBetter />
              <Delta label="travel min" now={score.travelMin} before={generatedScore.travelMin} higherIsBetter={false} />
              <Delta label="score" now={score.score} before={generatedScore.score} higherIsBetter />
              <button
                type="button"
                onClick={onRestore}
                className="rounded-md border border-hairline px-2.5 py-1 text-[11.5px] text-foreground transition-colors hover:border-ring"
              >
                Restore generated plan
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </header>
  );
}

/** A route folding back on itself — the thing this tool exists to stop. */
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="shrink-0">
      <path
        d="M5 23 Q 11 6, 16 14 T 25 8"
        fill="none"
        stroke="var(--skill-1)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="5" cy="23" r="2.6" fill="var(--skill-2)" />
      <circle cx="25" cy="8" r="2.6" fill="var(--skill-4)" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
      {children}
    </span>
  );
}

/** Counts up when the value changes, so a re-solve is felt as well as read. */
function Stat({
  value, unit, label, alarm, good, hint, suffix = '', format,
}: {
  value: number;
  unit: string;
  label: string;
  alarm?: boolean;
  good?: boolean;
  hint?: string;
  suffix?: string;
  format?: (n: number) => string;
}) {
  const colour = alarm ? 'var(--alarm)' : good ? 'var(--skill-2)' : 'var(--foreground)';
  const mv = useMotionValue(0);
  const [shown, setShown] = useState(0);
  const rounded = useTransform(mv, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.55, ease: 'easeOut' });
    const stop = rounded.on('change', (v) => setShown(v));
    return () => {
      controls.stop();
      stop();
    };
  }, [value, mv, rounded]);

  return (
    <div title={hint}>
      <Label>{label}</Label>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="num text-[25px] font-semibold leading-none" style={{ color: colour }}>
          {format ? format(shown) : shown}
          {suffix}
        </span>
        <span className="text-[11.5px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

function Delta({
  label, now, before, higherIsBetter,
}: {
  label: string;
  now: number;
  before: number;
  higherIsBetter: boolean;
}) {
  const diff = now - before;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  const colour = diff === 0 ? 'var(--muted-foreground)' : better ? 'var(--skill-2)' : 'var(--alarm)';
  return (
    <span className="text-[12px] text-muted-foreground">
      {label} <span className="num text-foreground">{now}</span>{' '}
      <span className="num" style={{ color: colour }}>
        ({diff === 0 ? 'no change' : `${diff > 0 ? '+' : ''}${diff}`})
      </span>
    </span>
  );
}
