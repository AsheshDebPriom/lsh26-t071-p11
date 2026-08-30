'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';

import { CASES, DEFAULT_CASE_ID, caseWindow, findCase } from '@/lib/cases';
import {
  applyPlacement,
  bestPlacementOnTech,
  emptyPlanForCase,
  findTechForJob,
  refreshPlan,
  totalIdle,
  withoutJob,
} from '@/lib/plan';
import { previewFor, previewMoves, type MovePreview } from '@/lib/moves';
import { colourFor, skillColours } from '@/lib/palette';
import { callInSick, insertEmergency } from '@/lib/replan';
import { scorePlan } from '@/lib/score';
import { randomBaselineForCase, solveCase, type BaselineStats, type SolveStats } from '@/lib/solver';
import { formatDuration, formatTime } from '@/lib/time';
import type { DayCase, Job, Plan, RuleName, RuleOptions } from '@/lib/types';
import { DEFAULT_RULES, skillLabel } from '@/lib/types';

import { BlockedPanel } from './BlockedPanel';
import { CityMap } from './CityMap';
import { EmergencyForm } from './EmergencyForm';
import { Header, type BoardView } from './Header';
import { JobChip } from './JobChip';
import { Legend } from './Legend';
import { TechnicianLane } from './TechnicianLane';

type Notice =
  | { kind: 'rejected'; jobCode: string; techName: string; rule: RuleName; detail: string }
  | { kind: 'moved'; jobCode: string; techName: string; start: number }
  | { kind: 'already-there'; jobCode: string; techName: string; start: number }
  | { kind: 'sick'; techName: string; rehomed: number; stranded: number }
  | { kind: 'emergency'; jobCode: string; placed: boolean; untouched: number; stranded: number }
  | { kind: 'unassigned'; jobCode: string; techName: string };

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

  /** The job currently in the air, with the verdict for every technician. */
  const [dragging, setDragging] = useState<{
    jobId: string;
    from: string | null;
    previews: MovePreview[];
  } | null>(null);

  const [view, setView] = useState<BoardView>('timeline');
  // Hovering a lane lights its route on the map, and vice versa.
  const [highlightTechId, setHighlightTechId] = useState<string | null>(null);

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
    setHighlightTechId(null);
    setDragging(null);
    setView('timeline');
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

  /** Take a job off the board by hand. The blocked list then says it is placeable. */
  const unassign = useCallback(
    (jobId: string) => {
      if (!plan) return;
      const job = plan.jobs[jobId];
      const from = findTechForJob(plan, jobId);
      if (!job || !from) return;
      const tech = day.technicians.find((t) => t.id === from);

      setPlan(refreshPlan(withoutJob(plan, jobId, day.technicians), activeTechnicians, allJobs));
      setNotice({ kind: 'unassigned', jobCode: job.code, techName: tech?.name ?? from });
      setSelectedJobId(jobId);
      setEdits((n) => n + 1);
    },
    [plan, day, activeTechnicians, allJobs],
  );

  // ---- Drag and drop ----------------------------------------------------

  // A few pixels of travel before a drag begins, so a click still selects.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!plan) return;
      const jobId = String(event.active.id).replace(/^job:/, '');
      const job = plan.jobs[jobId];
      if (!job) return;
      const from = findTechForJob(plan, jobId);
      // Every lane is judged once, here, so the board can answer before the
      // dispatcher lets go rather than after.
      setDragging({ jobId, from, previews: previewMoves(plan, job, day.technicians, from) });
      setNotice(null);
    },
    [plan, day],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const active = dragging;
      setDragging(null);
      if (!active || !event.over) return;

      const target = String(event.over.id);
      if (target === 'unassigned') {
        if (active.from) unassign(active.jobId);
        return;
      }
      if (target.startsWith('tech:')) {
        move(active.jobId, target.slice('tech:'.length));
      }
    },
    // `move` and `unassign` are stable per plan; dragging is read at drop time.
    [dragging, move, unassign],
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

  const draggedJob = dragging ? plan?.jobs[dragging.jobId] : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
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
        view={view}
        onView={setView}
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
          <main className="flex min-h-0 flex-1 flex-col">
            <HowToStrip
              view={view}
              onEmergency={() => setEmergencyOpen((v) => !v)}
              emergencyOpen={emergencyOpen}
              nowMinutes={nowMinutes}
              sickCount={sick.size}
            />

            {view === 'timeline' ? (
              <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto">
                <div className="min-w-[58rem] flex-1">
                  <HourRuler
                    start={boardWindow.start}
                    end={boardWindow.end}
                    nowMinutes={nowMinutes}
                  />
                  <LayoutGroup>
                    {day.technicians.map((tech, i) => (
                      <TechnicianLane
                        key={tech.id}
                        index={i}
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
                        highlighted={highlightTechId === tech.id}
                        onHighlight={setHighlightTechId}
                        dropVerdict={
                          dragging ? previewFor(dragging.previews, tech.id) : undefined
                        }
                        draggingJobId={dragging?.jobId ?? null}
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
              </div>
            ) : (
              <CityMap
                day={day}
                plan={plan}
                highlightTechId={highlightTechId}
                onHighlightTech={setHighlightTechId}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
              />
            )}
          </main>
          <BlockedPanel
            plan={plan}
            technicians={activeTechnicians}
            colours={colours}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
            onMove={move}
            draggingJobId={dragging?.jobId ?? null}
            draggingFromTech={dragging?.from ?? null}
          />
        </div>
      )}
    </div>

      <DragOverlay dropAnimation={null}>
        {draggedJob && (
          <JobChip job={draggedJob} colour={colourFor(colours, draggedJob.skill)} />
        )}
      </DragOverlay>
    </DndContext>
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
    case 'unassigned': return `off-${n.jobCode}-${n.techName}`;
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
    case 'unassigned': return 'Taken off the board';
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
    case 'unassigned':
      return `${n.jobCode} taken off ${n.techName}'s day. It is unassigned now, not blocked — the panel on the right will say who can still take it.`;
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
  view, onEmergency, emergencyOpen, nowMinutes, sickCount,
}: {
  view: BoardView;
  onEmergency: () => void;
  emergencyOpen: boolean;
  nowMinutes: number | null;
  sickCount: number;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-panel px-5 py-2">
      <p className="text-[12.5px] text-muted-foreground">
        {view === 'timeline' ? (
          <>
            <span className="text-foreground">Drag a job</span> onto another technician — every lane
            says whether it may land before you let go ·{' '}
            <span className="text-foreground">Click</span> to inspect ·{' '}
            <span className="text-foreground">Sick</span> redistributes a technician&rsquo;s day
          </>
        ) : (
          <>
            <span className="text-foreground">Each line is one technician&rsquo;s route</span> through
            the city · hover to isolate it · a pulsing ring marks an area with work nobody can take
          </>
        )}
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
function HourRuler({
  start, end, nowMinutes,
}: {
  start: number;
  end: number;
  nowMinutes: number | null;
}) {
  const span = end - start;
  const hours: number[] = [];
  for (let m = start; m < end; m += 60) hours.push(m);

  return (
    <div className="sticky top-0 z-20 flex border-b border-hairline bg-panel">
      <div className="w-[15rem] shrink-0 border-r border-hairline px-3 py-2">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
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
        {nowMinutes !== null && nowMinutes >= start && nowMinutes <= end && (
          <div
            className="absolute top-0 h-full"
            style={{ left: `${((nowMinutes - start) / span) * 100}%` }}
          >
            <span
              className="num absolute -top-0.5 left-1 whitespace-nowrap rounded-sm px-1 text-[10px] font-semibold"
              style={{ background: 'var(--alarm)', color: 'oklch(0.17 0.02 250)' }}
            >
              now {formatTime(nowMinutes)}
            </span>
          </div>
        )}
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
  const shiftMin = day.technicians.reduce((n, t) => n + (t.shiftEnd - t.shiftStart), 0);

  // The city with the work on it, but no routes yet — that is exactly what
  // "no plan" means, and it fills the screen with the problem rather than with
  // emptiness. Cheap enough to build on every render: it only indexes the jobs.
  const preview = emptyPlanForCase(day, rules);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[minmax(24rem,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col justify-center px-8 py-10">
        <motion.div
          key={day.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="max-w-xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-panel px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {day.source === 'published' ? 'Published case' : 'Crafted case'}
            <span className="num text-foreground">{day.id}</span>
            <span className="num opacity-70">{day.today}</span>
          </span>

          <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-tight text-foreground">
            {day.jobs.length} jobs.
            <br />
            {day.technicians.length} technicians.
            <br />
            <span className="text-muted-foreground">No plan yet.</span>
          </h2>

          <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
            {formatDuration(totalWork)} of work spread across {day.areas.length} areas of Dhaka,
            against {formatDuration(shiftMin)} of technician time — before anyone has driven a
            single minute. Nothing is assigned.
          </p>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-hairline py-5 sm:grid-cols-4">
            {[...jobsBySkill.entries()].sort().map(([skill, n], i) => (
              <motion.div
                key={skill}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.06 }}
              >
                <dt className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
                  {skillLabel(skill)}
                </dt>
                <dd className="num mt-1 text-[24px] font-semibold leading-none text-foreground">
                  {n}
                </dd>
              </motion.div>
            ))}
          </dl>

          <motion.button
            type="button"
            onClick={onGenerate}
            disabled={solving}
            whileTap={{ scale: 0.97 }}
            className="mt-7 rounded-lg bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {solving ? 'Solving…' : 'Build the day plan'}
          </motion.button>

          <p className="mt-4 max-w-lg text-[12.5px] leading-relaxed text-muted-foreground">
            You get a timeline per technician showing work, driving and waiting; every job that
            cannot be done with the exact rule that blocks it; a map of the routes; and the ability
            to move any job by hand and be told immediately if that breaks a rule.
            {' '}Return-to-home is{' '}
            <span className="text-foreground">{rules.requireReturnHome ? 'on' : 'off'}</span>.
          </p>
        </motion.div>
      </div>

      <div className="relative hidden min-h-0 border-l border-hairline lg:flex lg:flex-col">
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 px-5 pt-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
            Where the work is
          </span>
          <p className="mt-1 max-w-sm text-[12.5px] leading-snug text-muted-foreground">
            Each circle is an area, sized by how many jobs are waiting there. Build the plan to draw
            the routes.
          </p>
        </div>
        <CityMap
          day={day}
          plan={preview}
          highlightTechId={null}
          onHighlightTech={() => {}}
          selectedJobId={null}
          onSelectJob={() => {}}
        />
      </div>
    </div>
  );
}
