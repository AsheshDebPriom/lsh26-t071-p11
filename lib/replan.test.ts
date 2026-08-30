import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLISHED_CASES } from './cases';
import { checkFeasible } from './feasibility';
import { applyPlacement, withEmptyRoute } from './plan';
import { callInSick, insertEmergency, startedJobIds } from './replan';
import { scorePlan } from './score';
import { solveCase } from './solver';
import { hm } from './time';
import type { Job, Plan, Technician } from './types';

/**
 * The three bonus behaviours. Each one is a replan, so the thing worth
 * asserting is that the board it produces is still legal — every job still
 * clears checkFeasible where it now sits — and that the promise each feature
 * makes is actually kept.
 */

const day = PUBLISHED_CASES[0];
const base = solveCase(day).plan;

/** Every job on every route is legal where it sits, built forward from scratch. */
function assertPlanIsLegal(plan: Plan, technicians: Technician[], label: string) {
  for (const tech of technicians) {
    let scratch = withEmptyRoute(plan, tech.id);
    let previous: Job | null = null;
    for (const a of plan.routes[tech.id] ?? []) {
      const job = plan.jobs[a.jobId];
      const res = checkFeasible(job, tech, previous, scratch);
      assert.equal(res.ok, true, `${label}: ${job.code} on ${tech.name} must still be legal`);
      if (!res.ok) return;
      assert.equal(res.start, a.start, `${label}: ${job.code} start must match the board`);
      scratch = applyPlacement(scratch, tech, job, scratch.routes[tech.id].length);
      previous = job;
    }
  }
}

/** No job may appear on two technicians at once. */
function assertNoDuplicates(plan: Plan, label: string) {
  const seen = new Set<string>();
  for (const route of Object.values(plan.routes)) {
    for (const a of route) {
      assert.ok(!seen.has(a.jobId), `${label}: ${a.jobId} is on the board twice`);
      seen.add(a.jobId);
    }
  }
}

// ---- Bonus: a technician calls in sick ---------------------------------

test('calling in sick empties that technician and redistributes what it can', () => {
  const busiest = [...day.technicians].sort(
    (a, b) => (base.routes[b.id] ?? []).length - (base.routes[a.id] ?? []).length,
  )[0];
  const had = (base.routes[busiest.id] ?? []).length;
  assert.ok(had > 0, 'the test needs a technician with a real day');

  const out = callInSick(base, day.technicians, day.jobs, busiest.id, new Set());

  assert.equal((out.plan.routes[busiest.id] ?? []).length, 0, 'their day is cleared');
  assert.equal(out.rehomed.length + out.stranded.length, had, 'every lifted job is accounted for');
  for (const r of out.rehomed) {
    assert.notEqual(r.techId, busiest.id, 'nothing goes back to the sick technician');
  }

  const remaining = day.technicians.filter((t) => t.id !== busiest.id);
  assertPlanIsLegal(out.plan, remaining, 'after sick');
  assertNoDuplicates(out.plan, 'after sick');
});

test('a job stranded by a sick technician is explained, not dropped silently', () => {
  const busiest = [...day.technicians].sort(
    (a, b) => (base.routes[b.id] ?? []).length - (base.routes[a.id] ?? []).length,
  )[0];
  const out = callInSick(base, day.technicians, day.jobs, busiest.id, new Set());

  const onBoard = new Set(Object.values(out.plan.routes).flatMap((r) => r.map((a) => a.jobId)));
  const missing = day.jobs.filter((j) => !onBoard.has(j.id));
  assert.equal(out.plan.blocked.length, missing.length, 'the blocked list covers everything absent');
  for (const b of out.plan.blocked) {
    assert.ok(b.detail.length > 20, `${b.jobId} needs a real reason`);
  }
  for (const id of out.stranded) {
    assert.ok(out.plan.blocked.some((b) => b.jobId === id), `${id} must appear in the blocked list`);
  }
});

test('work already under way is not taken off a technician who falls ill', () => {
  const noon = hm(12);
  const busiest = [...day.technicians].sort(
    (a, b) => (base.routes[b.id] ?? []).length - (base.routes[a.id] ?? []).length,
  )[0];
  const startedBefore = (base.routes[busiest.id] ?? []).filter((a) => a.start <= noon);

  const out = callInSick(base, day.technicians, day.jobs, busiest.id, new Set(), noon);
  const kept = out.plan.routes[busiest.id] ?? [];

  assert.equal(kept.length, startedBefore.length, 'started jobs stay put');
  for (const a of kept) {
    assert.ok(a.start <= noon, 'nothing that had not started is left with them');
  }
});

// ---- Bonus: an emergency job mid-day -----------------------------------

function emergencyFor(nowMinutes: number): Job {
  // A job any of the plumbers could physically take, in the middle of the day.
  return {
    id: 'EMG1',
    code: 'E-01',
    customer: 'Emergency call',
    area: day.areas[0],
    skill: day.technicians.flatMap((t) => t.skills)[0],
    durationMin: 45,
    windowStart: nowMinutes + 30,
    windowEnd: nowMinutes + 180,
  };
}

test('an emergency replans only the jobs that have not started', () => {
  const noon = hm(12);
  const startedBefore = startedJobIds(base, day.technicians, noon);
  const emergency = emergencyFor(noon);

  const out = insertEmergency(base, day.technicians, day.jobs, emergency, noon);

  assert.equal(out.untouched, startedBefore.size, 'every started job was left alone');
  for (const tech of day.technicians) {
    for (const a of out.plan.routes[tech.id] ?? []) {
      if (!startedBefore.has(a.jobId)) continue;
      const before = (base.routes[tech.id] ?? []).find((x) => x.jobId === a.jobId);
      assert.ok(before, `${a.jobId} must still be with the same technician`);
      assert.equal(a.start, before?.start, `${a.jobId} must keep its start time`);
      assert.equal(a.finish, before?.finish, `${a.jobId} must keep its finish time`);
    }
  }

  assertPlanIsLegal(out.plan, day.technicians, 'after emergency');
  assertNoDuplicates(out.plan, 'after emergency');
});

test('the emergency job itself is either scheduled or explained', () => {
  const noon = hm(12);
  const emergency = emergencyFor(noon);
  const out = insertEmergency(base, day.technicians, day.jobs, emergency, noon);

  const onBoard = Object.values(out.plan.routes).some((r) => r.some((a) => a.jobId === emergency.id));
  assert.equal(onBoard, out.placed, 'the reported outcome matches the board');
  if (!out.placed) {
    const why = out.plan.blocked.find((b) => b.jobId === emergency.id);
    assert.ok(why, 'an unplaced emergency must appear in the blocked list');
    assert.ok(why && why.detail.length > 20, 'with a real reason');
  }
});

test('every job in the day is still accounted for after an emergency', () => {
  const noon = hm(12);
  const emergency = emergencyFor(noon);
  const out = insertEmergency(base, day.technicians, day.jobs, emergency, noon);

  const all = [...day.jobs, emergency];
  const onBoard = new Set(Object.values(out.plan.routes).flatMap((r) => r.map((a) => a.jobId)));
  const blocked = new Set(out.plan.blocked.map((b) => b.jobId));
  for (const job of all) {
    assert.ok(
      onBoard.has(job.id) || blocked.has(job.id),
      `${job.code} must be either scheduled or explained`,
    );
  }
});

// ---- Bonus: a score, and comparing a manual plan to the generated one ---

test('the plan score rewards jobs placed and penalises driving', () => {
  const solved = scorePlan(base, day.technicians, day.jobs.length);
  assert.equal(solved.assigned + solved.blocked, day.jobs.length, 'every job is on one side');
  assert.equal(
    solved.score,
    Math.round(solved.assigned * 10 - solved.travelMin / 10),
    'score follows the published rule',
  );

  // Losing a technician cannot improve the score.
  const busiest = [...day.technicians].sort(
    (a, b) => (base.routes[b.id] ?? []).length - (base.routes[a.id] ?? []).length,
  )[0];
  const after = callInSick(base, day.technicians, day.jobs, busiest.id, new Set());
  const damaged = scorePlan(after.plan, day.technicians, day.jobs.length);
  assert.ok(
    damaged.score <= solved.score,
    `losing ${busiest.name} should not raise the score (${solved.score} -> ${damaged.score})`,
  );
});
