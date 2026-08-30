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
import { callInSick, insertEmergency } from '@/lib/replan';
import { scorePlan } from '@/lib/score';
import { randomBaselineForCase, solveCase, type BaselineStats, type SolveStats } from '@/lib/solver';
import { formatDuration, formatTime } from '@/lib/time';
import type { DayCase, Job, Plan, RuleName, RuleOptions } from '@/lib/types';
import { DEFAULT_RULES, skillLabel } from '@/lib/types';

import { BlockedPanel } from './BlockedPanel';
import { EmergencyForm } from './EmergencyForm';
import { Header } from './Header';
import { Legend } from './Legend';
import { TechnicianLane } from './TechnicianLane';

type Notice =
  | { kind: 'rejected'; jobCode: string; techName: string; rule: RuleName; detail: string }
  | { kind: 'moved'; jobCode: string; techName: string; start: number }
  | { kind: 'already-there'; jobCode: string; techName: string; start: number }
  | { kind: 'sick'; techName: string; rehomed: number; stranded: number }
  | { kind: 'emergency'; jobCode: string; placed: boolean; untouched: number; stranded: number };

export function DispatchBoard() {
  const [caseId, setCaseId] = useState<string>(DEFAULT_CASE_ID);
  const day = useMemo(() => findCase(caseId), [caseId]);

  const [rules, setRules] = useState<RuleOptions>(day.defaultRules ?? DEFAULT_RULES);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [generated, setGenerated] = useState<Plan | null>(null);
  const [stats, setStats] = useState<SolveStats | null>(null);
  const [baseline, setBaseline] = useState<BaselineStats | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [edits, setEdits] = useState(0);
  const [solving, setSolving] = useState(false);

  // Bonus state.
  const [sick, setSick] = useState<Set<string>>(() => new Set());
  const [extraJobs, setExtraJobs] = useState<Job[]>([]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  const colours = useMemo(() => skillColours(day), [day]);
  const boardWindow = useMemo(() => caseWindow(day), [day]);

  const activeTechnicians = useMemo(
    () => day.technicians.filter((t) => !sick.has(t.id)),
    [day, sick],
  );
  const allJobs = useMemo(() => [...day.jobs, ...extraJobs], [day, extraJobs]);

  const score = plan ? scorePlan(plan, day.technicians, allJobs.length) : null;
  const generatedScore = generated ? scorePlan(generated, day.technicians, day.jobs.length) : null;

  const reset = useCallback(() => {
    setPlan(null);
    setGenerated(null);
    setStats(null);
    setBaseline(null);
    setSelectedJobId(null);
    setNotice(null);
    setEdits(0);
    setSick(new Set());
    setExtraJobs([]);
    setEmergencyOpen(false);
    setNowMinutes(null);
  }, []);

  const pickCase = useCallback(
    (id: string) => {
      setCaseId(id);
      setRules(findCase(id).defaultRules ?? DEFAULT_RULES);
      reset();
    },
    [reset],
  );

  const toggleReturnHome = useCallback(
    (on: boolean) => {
      setRules({ requireReturnHome: on });
      reset();
    },
    [reset],
  );

  const generate = useCallback(() => {
    setSolving(true);
    // Yield a frame so the button can show "Solving…" before the work starts.
    setTimeout(() => {
      const outcome = solveCase(day, rules);
      setPlan(outcome.plan);
      setGenerated(outcome.plan);
      setStats(outcome.stats);
      setBaseline(randomBaselineForCase(day, rules));
      setNotice(null);
      setEdits(0);
      setSick(new Set());
      setExtraJobs([]);
      setNowMinutes(null);
      setSolving(false);
    }, 0);
  }, [day, rules]);

  const restoreGenerated = useCallback(() => {
    if (!generated) return;
    setPlan(generated);
    setEdits(0);
    setSick(new Set());
    setExtraJobs([]);
    setNowMinutes(null);
    setNotice(null);
  }, [generated]);

  /** Requirement 4. Every move goes through checkFeasible before it is allowed. */
  const move = useCallback(
    (jobId: string, techId: string) => {
      if (!plan) return;
      const job = plan.jobs[jobId];
      const tech = day.technicians.find((t) => t.id === techId);
      if (!job || !tech) return;

      if (sick.has(tech.id)) {
        setNotice({
          kind: 'rejected',
          jobCode: job.code,
          techName: tech.name,
          rule: 'OUTSIDE_SHIFT',
          detail: `${tech.name} is off sick today and is not taking work.`,
        });
        setSelectedJobId(jobId);
        return;
      }

      const from = findTechForJob(plan, jobId);

      if (from === tech.id) {
        const current = (plan.routes[tech.id] ?? []).find((a) => a.jobId === jobId);
        setNotice({
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
        setNotice({
          kind: 'rejected',
          jobCode: job.code,
          techName: tech.name,
          rule: attempt.rule,
          detail: attempt.detail,
        });
        setSelectedJobId(jobId);
        return;
      }

      setPlan(
        refreshPlan(
          applyPlacement(lifted, tech, job, attempt.placement.position),
          activeTechnicians,
          allJobs,
        ),
      );
      setNotice({
        kind: 'moved',
        jobCode: job.code,
        techName: tech.name,
        start: attempt.placement.result.start,
      });
      setSelectedJobId(jobId);
      setEdits((n) => n + 1);
    },
    [plan, day, activeTechnicians, allJobs, sick],
  );

  /** Bonus: a technician calls in sick and their day is redistributed. */
  const markSick = useCallback(
    (techId: string) => {
      if (!plan) return;
      const tech = day.technicians.find((t) => t.id === techId);
      if (!tech) return;

      const outcome = callInSick(plan, day.technicians, allJobs, techId, sick, nowMinutes);
      setSick((prev) => new Set([...prev, techId]));
      setPlan(outcome.plan);
      setNotice({
        kind: 'sick',
        techName: tech.name,
        rehomed: outcome.rehomed.length,
        stranded: outcome.stranded.length,
      });
      setEdits((n) => n + 1);
    },
    [plan, day, allJobs, sick, nowMinutes],
  );

  /** Bonus: an emergency arrives mid-day; only jobs not yet started are replanned. */
  const raiseEmergency = useCallback(
    (job: Job, at: number) => {
      if (!plan) return;
      const outcome = insertEmergency(plan, activeTechnicians, allJobs, job, at);
      setExtraJobs((prev) => [...prev, job]);
      setPlan(outcome.plan);
      setNowMinutes(at);
      setEmergencyOpen(false);
      setSelectedJobId(job.id);
      setNotice({
        kind: 'emergency',
        jobCode: job.code,
        placed: outcome.placed,
        untouched: outcome.untouched,
        stranded: outcome.stranded.length,
      });
      setEdits((n) => n + 1);
    },
    [plan, activeTechnicians, allJobs],
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <Header
        day={day}
        cases={CASES}
        onPickCase={pickCase}
        rules={rules}
        onToggleReturnHome={toggleReturnHome}
        onGenerate={generate}
        onReset={reset}
        solving={solving}
        hasPlan={plan !== null}
        plan={plan}
        stats={stats}
        baseline={baseline}
        score={score}
        generatedScore={generatedScore}
        edited={edits > 0}
        onRestore={restoreGenerated}
      />

      <AnimatePresence mode="wait">
        {notice && (
          <NoticeBar key={noticeKey(notice)} notice={notice} onDismiss={() => setNotice(null)} />
        )}
      </AnimatePresence>

      {plan !== null && emergencyOpen && (
        <EmergencyForm
          day={day}
          nowMinutes={nowMinutes ?? midday(boardWindow)}
          onNowChange={setNowMinutes}
          onRaise={raiseEmergency}
          onCancel={() => setEmergencyOpen(false)}
          index={extraJobs.length + 1}
        />
      )}

      {plan === null ? (
        <EmptyState day={day} rules={rules} solving={solving} onGenerate={generate} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto">
            <HowToStrip
              onEmergency={() => setEmergencyOpen((v) => !v)}
              emergencyOpen={emergencyOpen}
              nowMinutes={nowMinutes}
              sickCount={sick.size}
            />
            <div className="min-w-[60rem] flex-1">
              <HourRuler start={boardWindow.start} end={boardWindow.end} />
              <LayoutGroup>
                {day.technicians.map((tech, i) => (
                  <TechnicianLane
                    key={tech.id}
                    tech={tech}
                    plan={plan}
                    dayStart={boardWindow.start}
                    dayEnd={boardWindow.end}
                    colours={colours}
                    striped={i % 2 === 1}
                    selectedJobId={selectedJobId}
                    onSelectJob={setSelectedJobId}
                    onCallInSick={markSick}
                    offSick={sick.has(tech.id)}
                    nowMinutes={nowMinutes}
                  />
                ))}
              </LayoutGroup>
            </div>
            <Legend
              day={day}
              colours={colours}
              plan={plan}
              technicians={activeTechnicians}
              idleMin={totalIdle(plan, activeTechnicians)}
              selectedJobId={selectedJobId}
              onMove={move}
            />
          </main>
          <BlockedPanel
            plan={plan}
            technicians={activeTechnicians}
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

function midday(w: { start: number; end: number }): number {
  return Math.round((w.start + w.end) / 2 / 30) * 30;
}

function noticeKey(n: Notice): string {
  switch (n.kind) {
    case 'rejected': return `rej-${n.jobCode}-${n.rule}`;
    case 'moved': return `mv-${n.jobCode}-${n.start}`;
    case 'already-there': return `same-${n.jobCode}`;
    case 'sick': return `sick-${n.techName}-${n.rehomed}`;
    case 'emergency': return `emg-${n.jobCode}`;
  }
}

/** One strip, one voice: a machine stating a fact, not an apology. */
function NoticeBar({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const alarm = notice.kind === 'rejected';
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden border-b"
      style={{
        borderColor: alarm ? 'var(--alarm)' : 'var(--hairline)',
        background: alarm ? 'var(--alarm-dim)' : 'var(--panel-2)',
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5">
        <span
          className="num shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
          style={
            alarm
              ? { background: 'var(--alarm)', color: 'oklch(0.17 0.02 250)' }
              : { border: '1px solid var(--hairline)', color: 'var(--muted-foreground)' }
          }
        >
          {alarm ? notice.rule : label(notice)}
        </span>
        <p className="text-[13px] leading-relaxed text-foreground">{sentence(notice)}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="num ml-auto shrink-0 text-[11.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}

function label(n: Notice): string {
  switch (n.kind) {
    case 'moved': return 'Move applied';
    case 'already-there': return 'No change';
    case 'sick': return 'Off sick';
    case 'emergency': return 'Emergency';
    default: return 'Notice';
  }
}

function sentence(n: Notice): string {
  switch (n.kind) {
    case 'rejected':
      return `${n.jobCode} cannot go to ${n.techName}. ${n.detail}`;
    case 'moved':
      return `${n.jobCode} moved to ${n.techName}, starting ${formatTime(n.start)}.`;
    case 'already-there':
      return `${n.jobCode} is already on ${n.techName}’s day, starting ${formatTime(n.start)}.`;
    case 'sick':
      return (
        `${n.techName} is off shift. ${n.rehomed} job${n.rehomed === 1 ? '' : 's'} found another technician` +
        (n.stranded > 0
          ? `, and ${n.stranded} could not be covered — the blocked list names the rule.`
          : ' and nothing was lost.')
      );
    case 'emergency':
      return (
        `${n.jobCode} raised. ${n.untouched} job${n.untouched === 1 ? '' : 's'} already under way were left untouched; ` +
        (n.placed ? 'the emergency was scheduled' : 'the emergency could not be scheduled') +
        (n.stranded > 0 ? `, and ${n.stranded} replanned job${n.stranded === 1 ? '' : 's'} no longer fit.` : '.')
      );
  }
}

/** The one line that tells a first-time visitor what they can do here. */
function HowToStrip({
  onEmergency, emergencyOpen, nowMinutes, sickCount,
}: {
  onEmergency: () => void;
  emergencyOpen: boolean;
  nowMinutes: number | null;
  sickCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-panel px-5 py-2">
      <p className="text-[12.5px] text-muted-foreground">
        <span className="text-foreground">Click any job</span> to inspect it or move it to another
        technician · <span className="text-foreground">Sick</span> takes a technician off shift and
        redistributes their day
      </p>
      <div className="ml-auto flex items-center gap-3">
        {nowMinutes !== null && (
          <span className="num text-[11.5px] text-muted-foreground">
            Clock set to <span className="text-foreground">{formatTime(nowMinutes)}</span>
          </span>
        )}
        {sickCount > 0 && (
          <span className="num text-[11.5px]" style={{ color: 'var(--alarm)' }}>
            {sickCount} off sick
          </span>
        )}
        <button
          type="button"
          onClick={onEmergency}
          className="num rounded-[4px] border px-2.5 py-1 text-[11.5px] uppercase tracking-wider"
          style={{
            borderColor: emergencyOpen ? 'var(--alarm)' : 'var(--hairline)',
            color: emergencyOpen ? 'var(--alarm)' : 'var(--foreground)',
          }}
        >
          {emergencyOpen ? 'Close' : 'Emergency job'}
        </button>
      </div>
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
      <div className="w-[16rem] shrink-0 border-r border-hairline px-3 py-2">
        <span className="num text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          Technician
        </span>
      </div>
      <div className="relative h-8 flex-1 overflow-hidden">
        {hours.map((m) => (
          <div
            key={m}
            className="absolute top-0 h-full border-l border-hairline"
            style={{ left: `${((m - start) / span) * 100}%` }}
          >
            <span className="num absolute left-1 top-2 text-[11px] text-muted-foreground">
              {formatTime(m)}
            </span>
          </div>
        ))}
        <span className="num absolute right-1 top-2 text-[11px] text-muted-foreground">
          {formatTime(end)}
        </span>
      </div>
    </div>
  );
}

function EmptyState({
  day, rules, solving, onGenerate,
}: {
  day: DayCase;
  rules: RuleOptions;
  solving: boolean;
  onGenerate: () => void;
}) {
  const jobsBySkill = new Map<string, number>();
  for (const j of day.jobs) jobsBySkill.set(j.skill, (jobsBySkill.get(j.skill) ?? 0) + 1);
  const totalWork = day.jobs.reduce((n, j) => n + j.durationMin, 0);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-10">
      <div className="w-full max-w-2xl">
        <p className="num text-[11.5px] uppercase tracking-[0.18em] text-muted-foreground">
          {day.source === 'published' ? 'Published case' : 'Crafted case'} · {day.id} · {day.today}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No plan yet</h2>
        <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">
          {day.technicians.length} technicians and {day.jobs.length} jobs are loaded across{' '}
          {day.areas.length} areas — {formatDuration(totalWork)} of work before a minute of driving,
          and nothing assigned to anyone yet.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 border-y border-hairline py-4 sm:grid-cols-4">
          {[...jobsBySkill.entries()].sort().map(([skill, n]) => (
            <div key={skill}>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {skillLabel(skill)}
              </dt>
              <dd className="num text-[20px] font-semibold text-foreground">{n}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={onGenerate}
          disabled={solving}
          className="num mt-6 rounded-[4px] bg-primary px-5 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {solving ? 'Solving…' : 'Build the day plan'}
        </button>

        <p className="mt-4 max-w-lg text-[12.5px] leading-relaxed text-muted-foreground">
          You will get a timeline per technician showing jobs, driving and waiting; a list of every
          job that cannot be done with the exact rule that blocks it; and the ability to move any
          job by hand and be told immediately if that breaks a rule. The return-to-home rule is
          currently <span className="text-foreground">{rules.requireReturnHome ? 'on' : 'off'}</span>.
        </p>
      </div>
    </div>
  );
}
