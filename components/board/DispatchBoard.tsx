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

import { caseFromRaw, CASES, DEFAULT_CASE_ID, caseWindow, findCase } from '@/lib/cases';
import { parseCaseFile, type RawCase } from '@/lib/caseFile';
import { answer, parseCommand, type Command } from '@/lib/console';
import { describeDay, RULES_BRIEF } from '@/lib/snapshot';
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
import { CaseLoader } from './CaseLoader';
import { CityMap } from './CityMap';
import { Console, type ConsoleLine } from './Console';
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

const STORE_KEY = 'p11.custom-cases.v1';

/** Days the dispatcher wrote themselves, kept in this browser between visits. */
function loadStoredCases(): RawCase[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    // Re-validated on the way in: something stale or hand-edited must not be
    // able to put a malformed day on the board.
    const parsed = parseCaseFile(raw);
    return parsed.ok ? parsed.cases : [];
  } catch {
    return [];
  }
}

export function DispatchBoard() {
  const [customRaw, setCustomRaw] = useState<RawCase[]>(loadStoredCases);
  const customCases = useMemo(
    () => customRaw.map((c) => caseFromRaw(c, 'imported')),
    [customRaw],
  );
  const allCases = useMemo(() => [...customCases, ...CASES], [customCases]);

  const [caseId, setCaseId] = useState<string>(DEFAULT_CASE_ID);
  const day = useMemo(
    () => allCases.find((c) => c.id === caseId) ?? findCase(caseId),
    [allCases, caseId],
  );
  const [loaderOpen, setLoaderOpen] = useState(false);

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

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [consoleThinking, setConsoleThinking] = useState(false);

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

  const importCases = useCallback(
    (incoming: RawCase[]) => {
      setCustomRaw((prev) => {
        // A re-import of the same case id replaces it rather than duplicating.
        const byId = new Map(prev.map((c) => [c.case_id, c]));
        for (const c of incoming) byId.set(c.case_id, c);
        const next = [...byId.values()];
        try {
          window.localStorage.setItem(
            STORE_KEY,
            JSON.stringify({ schema_version: '2.1', problem_id: 'P11', cases: next }),
          );
        } catch {
          // A full or blocked store is not a reason to refuse the import; the
          // day still loads, it just will not survive a reload.
        }
        return next;
      });
      const first = incoming[0];
      if (first) {
        setCaseId(first.case_id);
        reset();
      }
      setLoaderOpen(false);
    },
    // `reset` is declared below and is stable; see the callback list there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const forgetCustomCases = useCallback(() => {
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      // Nothing to do; the in-memory list is cleared either way.
    }
    setCustomRaw([]);
    setCaseId(DEFAULT_CASE_ID);
    reset();
    setLoaderOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = useCallback(
    (text: string, tone: ConsoleLine['tone'] = 'info', source?: ConsoleLine['source']) => {
      setConsoleLines((prev) => [...prev, { id: prev.length + 1, role: 'board', text, tone, source }]);
    },
    [],
  );

  const pickCase = useCallback(
    (id: string) => {
      setCaseId(id);
      const picked = allCases.find((c) => c.id === id) ?? findCase(id);
      setRules(picked.defaultRules ?? DEFAULT_RULES);
      reset();
    },
    [reset, allCases],
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

  /**
   * One entry point for everything the console can do. Commands that change the
   * plan are routed to the very same handlers the buttons call, so the console
   * cannot take a shortcut past a rule; read-only questions are answered by
   * lib/console.ts from the plan as it stands.
   */
  const execute = useCallback(
    (command: Command) => {
      const ctx = { day, plan, caseIds: allCases.map((c) => c.id) };

      const spoken = answer(command, ctx);
      if (spoken) {
        say(spoken.text, spoken.tone);
        return;
      }

      const needsPlan = () => {
        if (plan) return false;
        say('There is no plan yet. Say "solve" first.', 'warn');
        return true;
      };

      switch (command.kind) {
        case 'solve':
          generate();
          say('Building the day plan…', 'ok');
          return;
        case 'clear':
          reset();
          say('Cleared. Say "solve" to build it again.', 'info');
          return;
        case 'restore':
          if (!generated) return say('There is no generated plan to restore yet.', 'warn');
          restoreGenerated();
          say('Put back the plan the solver built.', 'ok');
          return;
        case 'view':
          if (!plan) return say('There is no plan to show yet. Say "solve" first.', 'warn');
          setView(command.view);
          say(command.view === 'map' ? 'Showing the map.' : 'Showing the timeline.', 'info');
          return;
        case 'loadCase':
          pickCase(command.caseId);
          say(`Loaded ${command.caseId}. Say "solve" to plan it.`, 'ok');
          return;
        case 'setRule':
          toggleReturnHome(command.requireReturnHome);
          say(
            command.requireReturnHome
              ? 'Return-to-home is on. Re-solve to see what it costs.'
              : 'Return-to-home is off, as the published case format allows.',
            'info',
          );
          return;
        case 'move': {
          if (needsPlan()) return;
          const job = plan!.jobs[command.jobId];
          const tech = day.technicians.find((t) => t.id === command.techId)!;

          // Work out the answer the same way `move` will, in the same order, so
          // the console and the notice strip can never tell different stories.
          if (sick.has(tech.id)) {
            move(command.jobId, command.techId);
            say(`${tech.name} is off sick today and is not taking work.`, 'warn');
            return;
          }
          const from = findTechForJob(plan!, command.jobId);
          if (from === tech.id) {
            move(command.jobId, command.techId);
            say(`${job.code} is already on ${tech.name}'s day.`, 'info');
            return;
          }

          const lifted = from ? withoutJob(plan!, command.jobId, day.technicians) : plan!;
          const verdict = bestPlacementOnTech(lifted, job, tech);
          move(command.jobId, command.techId);
          say(
            verdict.ok
              ? `Moved ${job.code} to ${tech.name}, starting ${formatTime(verdict.placement.result.start)}.`
              : `${job.code} cannot go to ${tech.name}. ${verdict.rule}: ${verdict.detail}`,
            verdict.ok ? 'ok' : 'warn',
          );
          return;
        }
        case 'unassign': {
          if (needsPlan()) return;
          const job = plan!.jobs[command.jobId];
          if (!findTechForJob(plan!, command.jobId)) {
            say(`${job.code} is not on anyone's day already.`, 'info');
            return;
          }
          unassign(command.jobId);
          say(`${job.code} taken off the board. It is unassigned, not blocked.`, 'ok');
          return;
        }
        case 'sick': {
          if (needsPlan()) return;
          const tech = day.technicians.find((t) => t.id === command.techId)!;
          if (sick.has(tech.id)) return say(`${tech.name} is already off sick.`, 'info');
          const had = (plan!.routes[tech.id] ?? []).length;
          markSick(tech.id);
          say(`${tech.name} is off shift. Redistributing ${had} job${had === 1 ? '' : 's'}…`, 'ok');
          return;
        }
        case 'emergency': {
          if (needsPlan()) return;
          raiseEmergency(command.job, command.at);
          say(
            `Raised a ${skillLabel(command.job.skill)} emergency in ${command.job.area} ` +
              `(${formatDuration(command.job.durationMin)}), replanning from ${formatTime(command.at)}.`,
            'ok',
          );
          return;
        }
        default:
          say('I did not understand that. Type help to see what I can do.', 'warn');
      }
    },
    [
      day, plan, generated, sick, say, generate, reset, restoreGenerated, pickCase,
      toggleReturnHome, move, unassign, markSick, raiseEmergency, allCases,
    ],
  );

  /**
   * What the console does with a line of text.
   *
   * The local grammar goes first: it is instant, free, works offline and is
   * exactly right for the phrasings it knows. Anything it does not understand
   * is handed to Gemini, which reads the same day the board is showing and
   * either answers or proposes ONE command. That command is then run through
   * `execute` — the same path the buttons use — so the model can no more break
   * a hard rule than the drag can. If no key is configured, or the call fails,
   * the console says what the parser would have said and carries on.
   */
  const runCommand = useCallback(
    async (text: string) => {
      setConsoleLines((prev) => [...prev, { id: prev.length + 1, role: 'you', text }]);

      const ctx = { day, plan, caseIds: allCases.map((c) => c.id) };
      const parsed = parseCommand(text, ctx);
      if (parsed.kind !== 'unknown') {
        execute(parsed);
        return;
      }

      setConsoleThinking(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            rules: RULES_BRIEF,
            day: describeDay(day, plan),
            history: consoleLines.slice(-6).map((l) => ({ role: l.role, text: l.text })),
          }),
        });
        const data = await res.json();

        if (!res.ok || data.error) {
          say(
            `${data.error ?? 'The assistant is unavailable.'} Type help for what I can do without it.`,
            'warn',
          );
          return;
        }
        if (data.configured === false) {
          // No key on the server — say what the parser would have said.
          const fallback = answer(parsed, ctx);
          say(
            `${fallback?.text ?? 'I did not understand that.'}
(No Gemini key is configured, so I am answering from the built-in commands only.)`,
            'warn',
          );
          return;
        }

        if (data.reply) say(data.reply, 'info', 'gemini');

        const kind = data.command?.kind;
        if (kind && kind !== 'none') {
          // The model proposes; the board decides. Rebuilt as a typed command
          // so nothing it invented can reach a handler unchecked.
          const proposed = toCommand(data.command, ctx);
          if (proposed) execute(proposed);
          else say('I could not act on that against today\u2019s board.', 'warn');
        }
      } catch {
        const fallback = answer(parsed, ctx);
        say(fallback?.text ?? 'I could not reach the assistant.', 'warn');
      } finally {
        setConsoleThinking(false);
      }
    },
    [day, plan, allCases, execute, say, consoleLines],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <Header
        day={day}
        cases={allCases}
        onOpenLoader={() => setLoaderOpen(true)}
        customCount={customCases.length}
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
              <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto bg-lane">
                <div className="min-w-[58rem]">
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
                  <RosterFoot
                    technicians={day.technicians.length}
                    sick={sick.size}
                    scheduled={score?.assigned ?? 0}
                    jobs={allJobs.length}
                  />
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
                dayStart={boardWindow.start}
                dayEnd={boardWindow.end}
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

      <CaseLoader
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        currentCase={day}
        onLoad={importCases}
        customCount={customCases.length}
        onForget={forgetCustomCases}
      />

      <Console
        open={consoleOpen}
        onOpenChange={setConsoleOpen}
        lines={consoleLines}
        thinking={consoleThinking}
        onSubmit={runCommand}
        caseLabel={day.label}
      />

      <DragOverlay dropAnimation={null}>
        {draggedJob && (
          <JobChip job={draggedJob} colour={colourFor(colours, draggedJob.skill)} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * The end of the roster. Without it the board simply stopped, and on a screen
 * taller than the technician list that looked like something had failed to
 * load rather than like the day being fully drawn.
 */
function RosterFoot({
  technicians, sick, scheduled, jobs,
}: {
  technicians: number;
  sick: number;
  scheduled: number;
  jobs: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline bg-panel px-3 py-2 text-[11.5px] text-muted-foreground">
      <span>
        End of roster — <span className="num text-foreground">{technicians}</span> technicians
        {sick > 0 && (
          <>
            , <span className="num" style={{ color: 'var(--alarm)' }}>{sick}</span> off sick
          </>
        )}
      </span>
      <span className="opacity-50">·</span>
      <span>
        <span className="num text-foreground">{scheduled}</span> of{' '}
        <span className="num">{jobs}</span> jobs on the board
      </span>
    </div>
  );
}

/**
 * Turn what the model proposed into a command this board will accept, or
 * nothing. Ids are checked against the day rather than trusted, so a
 * hallucinated technician or job simply does not become an action.
 */
function toCommand(
  raw: Record<string, unknown>,
  ctx: { day: DayCase; caseIds: string[] },
): Command | null {
  const kind = String(raw.kind);
  const jobId = typeof raw.jobId === 'string'
    ? ctx.day.jobs.find((j) => j.id === raw.jobId || j.code === raw.jobId)?.id
    : undefined;
  const techId = typeof raw.techId === 'string'
    ? ctx.day.technicians.find((t) => t.id === raw.techId)?.id
    : undefined;

  switch (kind) {
    case 'solve': return { kind: 'solve' };
    case 'clear': return { kind: 'clear' };
    case 'restore': return { kind: 'restore' };
    case 'summary': return { kind: 'summary' };
    case 'listBlocked': return { kind: 'listBlocked' };
    case 'busiest': return { kind: 'busiest' };
    case 'view':
      return raw.view === 'map' || raw.view === 'timeline' ? { kind: 'view', view: raw.view } : null;
    case 'setRule':
      return typeof raw.requireReturnHome === 'boolean'
        ? { kind: 'setRule', requireReturnHome: raw.requireReturnHome }
        : null;
    case 'loadCase': {
      const id = ctx.caseIds.find((c) => c === raw.caseId);
      return id ? { kind: 'loadCase', caseId: id } : null;
    }
    case 'move': return jobId && techId ? { kind: 'move', jobId, techId } : null;
    case 'unassign': return jobId ? { kind: 'unassign', jobId } : null;
    case 'sick': return techId ? { kind: 'sick', techId } : null;
    case 'explain': return jobId ? { kind: 'explain', jobId } : null;
    case 'whoCanTake': return jobId ? { kind: 'whoCanTake', jobId } : null;
    default: return null;
  }
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
  const previewWindow = caseWindow(day);

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
          dayStart={previewWindow.start}
          dayEnd={previewWindow.end}
        />
      </div>
    </div>
  );
}
