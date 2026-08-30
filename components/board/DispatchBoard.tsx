'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';

import { CASES, DEFAULT_CASE_ID, caseWindow, findCase } from '@/lib/cases';
import {
  applyPlacement,
  bestPlacementOnTech,
  findTechForJob,
  refreshPlan,
  totalIdle,
  withoutJob,
} from '@/lib/plan';
import { skillColours } from '@/lib/palette';
import { randomBaselineForCase, solveCase, type BaselineStats, type SolveStats } from '@/lib/solver';
import { formatDuration, formatTime } from '@/lib/time';
import type { Plan, RuleName, RuleOptions } from '@/lib/types';
import { DEFAULT_RULES, skillLabel } from '@/lib/types';

import { BlockedPanel } from './BlockedPanel';
import { Legend } from './Legend';
import { TechnicianLane } from './TechnicianLane';

interface Rejection {
  jobCode: string;
  techName: string;
  rule: RuleName;
  detail: string;
}

interface Applied {
  kind: 'moved' | 'already-there';
  jobCode: string;
  techName: string;
  start: number;
}

export function DispatchBoard() {
  const [caseId, setCaseId] = useState<string>(DEFAULT_CASE_ID);
  const day = useMemo(() => findCase(caseId), [caseId]);

  const [rules, setRules] = useState<RuleOptions>(day.defaultRules ?? DEFAULT_RULES);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stats, setStats] = useState<SolveStats | null>(null);
  const [baseline, setBaseline] = useState<BaselineStats | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [manualMoves, setManualMoves] = useState(0);

  const colours = useMemo(() => skillColours(day), [day]);
  const window = useMemo(() => caseWindow(day), [day]);

  const clearPlan = useCallback(() => {
    setPlan(null);
    setStats(null);
    setBaseline(null);
    setSelectedJobId(null);
    setRejection(null);
    setApplied(null);
    setManualMoves(0);
  }, []);

  const pickCase = useCallback(
    (id: string) => {
      setCaseId(id);
      setRules(findCase(id).defaultRules ?? DEFAULT_RULES);
      clearPlan();
    },
    [clearPlan],
  );

  const toggleReturnHome = useCallback(
    (on: boolean) => {
      setRules({ requireReturnHome: on });
      clearPlan();
    },
    [clearPlan],
  );

  const generate = useCallback(() => {
    const outcome = solveCase(day, rules);
    setPlan(outcome.plan);
    setStats(outcome.stats);
    setBaseline(randomBaselineForCase(day, rules));
    setRejection(null);
    setApplied(null);
    setManualMoves(0);
  }, [day, rules]);

  /** The dispatcher's hand. Every move goes through checkFeasible first. */
  const move = useCallback(
    (jobId: string, techId: string) => {
      if (!plan) return;
      const job = plan.jobs[jobId];
      const tech = day.technicians.find((t) => t.id === techId);
      if (!job || !tech) return;

      const from = findTechForJob(plan, jobId);

      // Moving a job to the technician who already has it is a no-op, not a
      // rule violation. Some published cases script exactly that.
      if (from === tech.id) {
        const current = (plan.routes[tech.id] ?? []).find((a) => a.jobId === jobId);
        setRejection(null);
        setApplied({
          kind: 'already-there',
          jobCode: job.code,
          techName: tech.name,
          start: current?.start ?? job.windowStart,
        });
        setSelectedJobId(jobId);
        return;
      }

      const lifted = from ? withoutJob(plan, jobId, day.technicians) : plan;
      const attempt = bestPlacementOnTech(lifted, job, tech);

      if (!attempt.ok) {
        setRejection({ jobCode: job.code, techName: tech.name, rule: attempt.rule, detail: attempt.detail });
        setApplied(null);
        setSelectedJobId(jobId);
        return;
      }

      const next = refreshPlan(
        applyPlacement(lifted, tech, job, attempt.placement.position),
        day.technicians,
        day.jobs,
      );
      setPlan(next);
      setRejection(null);
      setApplied({
        kind: 'moved',
        jobCode: job.code,
        techName: tech.name,
        start: attempt.placement.result.start,
      });
      setSelectedJobId(jobId);
      setManualMoves((n) => n + 1);
    },
    [plan, day],
  );

  const scriptedMove = useCallback(() => {
    if (!plan || !day.manualMove) return;
    move(day.manualMove.jobId, day.manualMove.toTechnicianId);
  }, [plan, day, move]);

  const assigned = plan
    ? Object.values(plan.routes).reduce((n, r) => n + r.length, 0)
    : 0;
  const savedPct =
    plan && baseline && baseline.meanTravelMin > 0
      ? Math.round(((baseline.meanTravelMin - plan.totalTravelMin) / baseline.meanTravelMin) * 100)
      : null;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <Header
        day={day}
        cases={CASES}
        onPickCase={pickCase}
        rules={rules}
        onToggleReturnHome={toggleReturnHome}
        onGenerate={generate}
        onReset={clearPlan}
        onScriptedMove={scriptedMove}
        hasPlan={plan !== null}
        plan={plan}
        stats={stats}
        baseline={baseline}
        assigned={assigned}
        savedPct={savedPct}
        manualMoves={manualMoves}
      />

      <AnimatePresence mode="wait">
        {rejection && (
          <motion.div
            key={`rej-${rejection.jobCode}-${rejection.rule}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b"
            style={{ borderColor: 'var(--alarm)', background: 'var(--alarm-dim)' }}
          >
            <div className="flex items-baseline gap-3 px-5 py-2.5">
              <span
                className="num shrink-0 rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: 'var(--alarm)', color: 'oklch(0.16 0.02 250)' }}
              >
                {rejection.rule}
              </span>
              <p className="text-[12.5px] leading-relaxed text-foreground">
                <span className="num font-semibold">{rejection.jobCode}</span> cannot go to{' '}
                <span className="font-semibold">{rejection.techName}</span>. {rejection.detail}
              </p>
              <button
                type="button"
                onClick={() => setRejection(null)}
                className="num ml-auto shrink-0 text-[11px] uppercase tracking-wider text-foreground/70 hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
        {applied && !rejection && (
          <motion.div
            key={`ok-${applied.jobCode}-${applied.start}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hairline bg-panel-2"
          >
            <div className="flex items-baseline gap-3 px-5 py-2.5">
              <span className="num shrink-0 rounded-[3px] border border-hairline px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {applied.kind === 'moved' ? 'Move applied' : 'No change'}
              </span>
              <p className="num text-[12.5px] text-foreground">
                {applied.kind === 'moved'
                  ? `${applied.jobCode} → ${applied.techName}, starting ${formatTime(applied.start)}.`
                  : `${applied.jobCode} is already on ${applied.techName}'s day, starting ${formatTime(applied.start)}.`}
              </p>
              <button
                type="button"
                onClick={() => setApplied(null)}
                className="num ml-auto shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {plan === null ? (
        <EmptyState day={day} rules={rules} onGenerate={generate} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto">
            <div className="min-w-[56rem] flex-1">
              <HourRuler start={window.start} end={window.end} />
              <LayoutGroup>
                {day.technicians.map((tech, i) => (
                  <TechnicianLane
                    key={tech.id}
                    tech={tech}
                    plan={plan}
                    dayStart={window.start}
                    dayEnd={window.end}
                    colours={colours}
                    striped={i % 2 === 1}
                    selectedJobId={selectedJobId}
                    onSelectJob={setSelectedJobId}
                  />
                ))}
              </LayoutGroup>
            </div>
            <Legend
              day={day}
              colours={colours}
              plan={plan}
              idleMin={totalIdle(plan, day.technicians)}
              selectedJobId={selectedJobId}
              onMove={move}
            />
          </main>
          <BlockedPanel
            plan={plan}
            technicians={day.technicians}
            colours={colours}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
            onMove={move}
          />
        </div>
      )}
    </div>
  );
}

/** Hour gridlines and their labels, on the same percentage scale as the lanes. */
function HourRuler({ start, end }: { start: number; end: number }) {
  const span = end - start;
  const hours: number[] = [];
  for (let m = start; m < end; m += 60) hours.push(m);

  return (
    <div className="sticky top-0 z-10 flex border-b border-hairline bg-panel">
      <div className="w-[13.5rem] shrink-0 border-r border-hairline px-3 py-1.5">
        <span className="num text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Technician
        </span>
      </div>
      <div className="relative h-7 flex-1 overflow-hidden">
        {hours.map((m) => (
          <div
            key={m}
            className="absolute top-0 h-full border-l border-hairline"
            style={{ left: `${((m - start) / span) * 100}%` }}
          >
            <span className="num absolute left-1 top-1.5 text-[10px] text-muted-foreground">
              {formatTime(m)}
            </span>
          </div>
        ))}
        <span className="num absolute right-1 top-1.5 text-[10px] text-muted-foreground">
          {formatTime(end)}
        </span>
      </div>
    </div>
  );
}

function EmptyState({
  day, rules, onGenerate,
}: {
  day: ReturnType<typeof findCase>;
  rules: RuleOptions;
  onGenerate: () => void;
}) {
  const jobsBySkill = new Map<string, number>();
  for (const j of day.jobs) jobsBySkill.set(j.skill, (jobsBySkill.get(j.skill) ?? 0) + 1);
  const totalWork = day.jobs.reduce((n, j) => n + j.durationMin, 0);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <p className="num text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {day.source === 'published' ? 'Published case' : 'Crafted case'} · {day.id} · {day.today}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          No plan generated yet
        </h2>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
          {day.technicians.length} technicians and {day.jobs.length} jobs are loaded across{' '}
          {day.areas.length} areas — {formatDuration(totalWork)} of work before a minute of driving.
          Nothing has been assigned. Build the day plan to see the timeline, the objective, and the
          jobs the hard rules will not allow.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 border-t border-hairline pt-4 sm:grid-cols-4">
          {[...jobsBySkill.entries()].sort().map(([skill, n]) => (
            <div key={skill}>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {skillLabel(skill)}
              </dt>
              <dd className="num text-[15px] text-foreground">{n}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={onGenerate}
          className="num mt-6 rounded-[3px] bg-primary px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90"
        >
          Build the day plan
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Return-to-home rule is {rules.requireReturnHome ? 'ON' : 'OFF'} for this case.
        </p>
      </div>
    </div>
  );
}

function Header(props: {
  day: ReturnType<typeof findCase>;
  cases: typeof CASES;
  onPickCase: (id: string) => void;
  rules: RuleOptions;
  onToggleReturnHome: (on: boolean) => void;
  onGenerate: () => void;
  onReset: () => void;
  onScriptedMove: () => void;
  hasPlan: boolean;
  plan: Plan | null;
  stats: SolveStats | null;
  baseline: BaselineStats | null;
  assigned: number;
  savedPct: number | null;
  manualMoves: number;
}) {
  const {
    day, cases, onPickCase, rules, onToggleReturnHome, onGenerate, onReset, onScriptedMove,
    hasPlan, plan, stats, baseline, assigned, savedPct, manualMoves,
  } = props;

  return (
    <header className="border-b border-hairline bg-panel">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
        <div>
          <h1 className="text-[14px] font-semibold tracking-tight text-foreground">
            Dispatch Board
          </h1>
          <p className="num text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            LSH26-T071 · P11 · Route &amp; shift assignment
          </p>
        </div>

        <label className="flex items-center gap-2">
          <span className="num text-[10px] uppercase tracking-wider text-muted-foreground">Case</span>
          <select
            value={day.id}
            onChange={(e) => onPickCase(e.target.value)}
            className="num rounded-[3px] border border-input bg-panel-2 px-2 py-1 text-[11.5px] text-foreground outline-none focus:border-ring"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.technicians.length} tech · {c.jobs.length} jobs
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2" title="The published format note says no return home is required, so this is off by default.">
          <input
            type="checkbox"
            checked={rules.requireReturnHome}
            onChange={(e) => onToggleReturnHome(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--skill-1)]"
          />
          <span className="num text-[10px] uppercase tracking-wider text-muted-foreground">
            Require return home
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          {hasPlan && day.manualMove && (
            <button
              type="button"
              onClick={onScriptedMove}
              title={`Run the case's published manual_move: ${day.manualMove.jobId} to ${day.manualMove.toTechnicianId}`}
              className="num rounded-[3px] border border-hairline bg-panel-2 px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-foreground hover:border-ring"
            >
              Scripted move: {day.manualMove.jobId} → {day.manualMove.toTechnicianId}
            </button>
          )}
          <button
            type="button"
            onClick={hasPlan ? onReset : onGenerate}
            className="num rounded-[3px] bg-primary px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90"
          >
            {hasPlan ? 'Clear plan' : 'Build day plan'}
          </button>
          {hasPlan && (
            <button
              type="button"
              onClick={onGenerate}
              className="num rounded-[3px] border border-hairline bg-panel-2 px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-foreground hover:border-ring"
            >
              Re-solve
            </button>
          )}
        </div>
      </div>

      {/* The objective, stated in words, and the numbers that back it. */}
      <div className="flex flex-wrap items-stretch gap-x-6 gap-y-2 border-t border-hairline px-5 py-2">
        <div className="max-w-[22rem]">
          <span className="num text-[10px] uppercase tracking-wider text-muted-foreground">
            Objective
          </span>
          <p className="text-[12px] leading-snug text-foreground">
            Minimising total travel time across all technicians.
          </p>
        </div>

        <Stat label="Jobs placed" value={hasPlan ? `${assigned}` : '—'} sub={`of ${day.jobs.length}`} />
        <Stat
          label="Blocked"
          value={hasPlan ? `${plan?.blocked.length ?? 0}` : '—'}
          sub="rule named"
          alarm={(plan?.blocked.length ?? 0) > 0}
        />
        <Stat
          label="Total travel"
          value={hasPlan ? `${plan?.totalTravelMin ?? 0}` : '—'}
          sub={hasPlan ? formatDuration(plan?.totalTravelMin ?? 0) : 'min'}
        />
        <Stat
          label="Random baseline"
          value={baseline ? `${baseline.meanTravelMin}` : '—'}
          sub={baseline ? `mean of ${baseline.runs} runs` : 'min'}
        />
        <Stat
          label="Better than random"
          value={savedPct === null ? '—' : `${savedPct}%`}
          sub={
            baseline && plan
              ? `${baseline.meanTravelMin - plan.totalTravelMin} min saved`
              : 'travel saved'
          }
          good={savedPct !== null && savedPct > 0}
        />
        {stats && (
          <Stat
            label="Improvement pass"
            value={`${stats.greedyTravelMin - stats.totalTravelMin}`}
            sub={`min off greedy · ${stats.swapsApplied} swaps, ${stats.relocationsApplied} moves`}
          />
        )}
        {manualMoves > 0 && (
          <Stat label="Manual moves" value={`${manualMoves}`} sub="applied by hand" />
        )}
      </div>
    </header>
  );
}

function Stat({
  label, value, sub, alarm, good,
}: {
  label: string;
  value: string;
  sub: string;
  alarm?: boolean;
  good?: boolean;
}) {
  const colour = alarm ? 'var(--alarm)' : good ? 'var(--skill-2)' : 'var(--foreground)';
  return (
    <div className="min-w-[6.5rem]">
      <span className="num block text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="num text-[17px] font-semibold leading-tight" style={{ color: colour }}>
        {value}
      </span>
      <span className="num ml-1 text-[10.5px] text-muted-foreground">{sub}</span>
    </div>
  );
}
