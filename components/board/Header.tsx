'use client';

import type { BaselineStats, SolveStats } from '@/lib/solver';
import { SCORE_RULE, type PlanScore } from '@/lib/score';
import { formatDuration } from '@/lib/time';
import type { DayCase, Plan, RuleOptions } from '@/lib/types';

/**
 * Identity, then controls, then results — in that order, because that is the
 * order someone landing on this page cold needs them. The objective is written
 * out in words next to the number it achieved and the number a random
 * assignment achieves, so "better than random" is shown rather than asserted.
 */

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
}

export function Header(props: Props) {
  const {
    day, cases, onPickCase, rules, onToggleReturnHome, onGenerate, onReset,
    solving, hasPlan, plan, stats, baseline, score, generatedScore, edited, onRestore,
  } = props;

  const savedPct =
    plan && baseline && baseline.meanTravelMin > 0
      ? Math.round(((baseline.meanTravelMin - plan.totalTravelMin) / baseline.meanTravelMin) * 100)
      : null;
  const blocked = plan?.blocked.length ?? 0;

  return (
    <header className="border-b border-hairline bg-panel">
      {/* 1 — What this is. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 pb-2.5 pt-3">
        <div>
          <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-foreground">
            Dispatch Board
          </h1>
          <p className="mt-0.5 max-w-3xl text-[13px] leading-snug text-muted-foreground">
            Builds the day plan for a home-service company in Dhaka — who goes where, in what
            order, and which jobs cannot be done at all. Every rule is checked before a job is
            placed, and nothing is dropped silently.
          </p>
        </div>
        <span className="num shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          LSH26-T071 · Problem P11
        </span>
      </div>

      {/* 2 — The controls, labelled. */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-hairline px-5 py-2.5">
        <label className="flex flex-col gap-1">
          <span className="num text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Which day
          </span>
          <select
            value={day.id}
            onChange={(e) => onPickCase(e.target.value)}
            className="num rounded-[4px] border border-input bg-panel-2 px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.technicians.length} technicians, {c.jobs.length} jobs
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span className="num text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Plan
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={solving}
              className="num rounded-[4px] bg-primary px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {solving ? 'Solving…' : hasPlan ? 'Re-solve' : 'Build day plan'}
            </button>
            {hasPlan && (
              <button
                type="button"
                onClick={onReset}
                className="num rounded-[4px] border border-hairline bg-panel-2 px-3 py-1.5 text-[12px] uppercase tracking-wider text-foreground hover:border-ring"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <label
          className="flex cursor-pointer flex-col gap-1"
          title="The published P11 case format says no return home is required, so this is off by default. Turn it on to see what an end-of-shift return policy costs."
        >
          <span className="num text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Optional rule
          </span>
          <span className="flex items-center gap-2 rounded-[4px] border border-hairline bg-panel-2 px-2 py-1.5">
            <input
              type="checkbox"
              checked={rules.requireReturnHome}
              onChange={(e) => onToggleReturnHome(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--skill-1)]"
            />
            <span className="text-[12px] text-foreground">Must reach home before shift end</span>
          </span>
        </label>

        <p className="num ml-auto max-w-[18rem] text-[11px] leading-snug text-muted-foreground">
          {day.source === 'published'
            ? `Published case ${day.id} from the P11 participant pack · ${day.today}`
            : `${day.label} · invented data · ${day.today}`}
        </p>
      </div>

      {/* 3 — The objective and the numbers, only once there is a plan to describe. */}
      {hasPlan && plan && (
        <div className="border-t border-hairline bg-panel-2 px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="max-w-[15rem]">
              <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Goal being improved
              </span>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">
                Minimising total travel time across all technicians
              </p>
            </div>

            <Stat
              value={`${score?.assigned ?? 0}`}
              unit={`of ${day.jobs.length}`}
              label="Jobs scheduled"
            />
            <Stat
              value={`${blocked}`}
              unit={blocked === 1 ? 'job' : 'jobs'}
              label="Cannot be done"
              alarm={blocked > 0}
              hint="Listed on the right with the rule that blocked each one"
            />
            <Stat
              value={formatDuration(plan.totalTravelMin)}
              unit="driving"
              label="Total travel"
            />
            {baseline && (
              <Stat
                value={savedPct === null ? '—' : `${savedPct}%`}
                unit="less driving"
                label="Better than random"
                good={(savedPct ?? 0) > 0}
                hint={`A random legal assignment averages ${formatDuration(baseline.meanTravelMin)} over ${baseline.runs} runs`}
              />
            )}
            {score && (
              <Stat
                value={`${score.score}`}
                unit="points"
                label="Plan score"
                hint={SCORE_RULE}
              />
            )}
            {stats && (
              <div className="max-w-[16rem]">
                <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  How it got there
                </span>
                <p className="num mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                  Greedy insertion ({stats.ordering}) reached {stats.greedyTravelMin} min; the
                  improvement pass took off {stats.greedyTravelMin - stats.totalTravelMin} min with{' '}
                  {stats.swapsApplied} swap{stats.swapsApplied === 1 ? '' : 's'} and{' '}
                  {stats.relocationsApplied} relocation{stats.relocationsApplied === 1 ? '' : 's'}.
                </p>
              </div>
            )}
          </div>

          {/* Bonus: the hand-edited plan measured against the one the solver built. */}
          {edited && generatedScore && score && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-hairline pt-2.5">
              <span className="num text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Your edits vs the generated plan
              </span>
              <Delta
                label="jobs"
                now={score.assigned}
                before={generatedScore.assigned}
                higherIsBetter
              />
              <Delta
                label="travel min"
                now={score.travelMin}
                before={generatedScore.travelMin}
                higherIsBetter={false}
              />
              <Delta label="score" now={score.score} before={generatedScore.score} higherIsBetter />
              <button
                type="button"
                onClick={onRestore}
                className="num rounded-[4px] border border-hairline px-2 py-1 text-[11px] uppercase tracking-wider text-foreground hover:border-ring"
              >
                Restore generated plan
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

function Stat({
  value, unit, label, alarm, good, hint,
}: {
  value: string;
  unit: string;
  label: string;
  alarm?: boolean;
  good?: boolean;
  hint?: string;
}) {
  const colour = alarm ? 'var(--alarm)' : good ? 'var(--skill-2)' : 'var(--foreground)';
  return (
    <div title={hint}>
      <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="num text-[24px] font-semibold leading-none" style={{ color: colour }}>
          {value}
        </span>
        <span className="num text-[11.5px] text-muted-foreground">{unit}</span>
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
    <span className="num text-[12px] text-muted-foreground">
      {label}{' '}
      <span style={{ color: 'var(--foreground)' }}>{now}</span>{' '}
      <span style={{ color: colour }}>
        ({diff === 0 ? 'no change' : `${diff > 0 ? '+' : ''}${diff}`})
      </span>
    </span>
  );
}

