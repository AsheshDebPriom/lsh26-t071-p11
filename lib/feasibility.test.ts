import assert from 'node:assert/strict';
import test from 'node:test';

import { checkFeasible } from './feasibility';
import { emptyPlan, applyPlacement, buildTimeline, refreshPlan, withEmptyRoute } from './plan';
import { JOBS, TECHNICIANS } from './seed';
import { randomBaseline, solve } from './solver';
import { hm } from './time';
import { assertMatrixIsSane, travelMinutes } from './travel';
import type { Job, Technician } from './types';
import { SKILLS } from './types';

/**
 * One case per RuleName, plus the happy path, plus the invariants the whole
 * board depends on. Run with `npm test`.
 */

const gulshanTech: Technician = {
  id: 'TT', name: 'Test', skills: ['AC_SERVICE'],
  homeArea: 'Gulshan', shiftStart: hm(8), shiftEnd: hm(18),
};

const motijheelTech: Technician = {
  id: 'TM', name: 'Kamal', skills: ['AC_SERVICE'],
  homeArea: 'Motijheel', shiftStart: hm(8), shiftEnd: hm(16),
};

function job(over: Partial<Job> & Pick<Job, 'id'>): Job {
  return {
    code: over.id, customer: 'Test customer', area: 'Banani', skill: 'AC_SERVICE',
    durationMin: 60, windowStart: hm(9), windowEnd: hm(11), ...over,
  };
}

function planFor(tech: Technician, jobs: Job[]) {
  return emptyPlan([tech], jobs);
}

test('travel matrix is symmetric, zero on the diagonal and inside 15..70', () => {
  assertMatrixIsSane();
});

test('happy path: returns arrival, start and finish', () => {
  const j = job({ id: 'A', area: 'Banani' });
  const res = checkFeasible(j, gulshanTech, null, planFor(gulshanTech, [j]));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // Leaves home Gulshan at 08:00, 15 min to Banani, waits for the 09:00 window.
  assert.equal(res.arrival, hm(8, 15));
  assert.equal(res.start, hm(9));
  assert.equal(res.finish, hm(10));
});

test('SKILL_MISMATCH: technician does not hold the required skill', () => {
  const j = job({ id: 'A', skill: 'PLUMBING' });
  const res = checkFeasible(j, gulshanTech, null, planFor(gulshanTech, [j]));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.rule, 'SKILL_MISMATCH');
  assert.match(res.detail, /Plumbing/);
  assert.match(res.detail, /Test/);
});

test('WINDOW_MISSED: cannot arrive before the window closes', () => {
  // Motijheel to Uttara is 70 minutes; leaving home at 08:00 lands 09:10.
  const j = job({ id: 'A', area: 'Uttara', windowStart: hm(8), windowEnd: hm(9) });
  const res = checkFeasible(j, motijheelTech, null, planFor(motijheelTech, [j]));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.rule, 'WINDOW_MISSED');
  assert.match(res.detail, /Arrives 09:10/);
  assert.match(res.detail, /window closes 09:00/);
  assert.match(res.detail, /10m late/);
});

test('OUTSIDE_SHIFT: work would finish after the shift ends', () => {
  const j = job({ id: 'A', area: 'Motijheel', windowStart: hm(15), windowEnd: hm(16), durationMin: 90 });
  const res = checkFeasible(j, motijheelTech, null, planFor(motijheelTech, [j]));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.rule, 'OUTSIDE_SHIFT');
  assert.match(res.detail, /finishing 16:30/);
  assert.match(res.detail, /30m past/);
});

test('NO_RETURN_TIME: finishes inside the shift but cannot get home in it', () => {
  // Finishes 15:00 in Uttara; 70 minutes home to Motijheel lands 16:10 > 16:00.
  const j = job({ id: 'A', area: 'Uttara', windowStart: hm(13), windowEnd: hm(14), durationMin: 120 });
  const res = checkFeasible(j, motijheelTech, null, planFor(motijheelTech, [j]));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.rule, 'NO_RETURN_TIME');
  assert.match(res.detail, /Finishes 15:00 in Uttara/);
  assert.match(res.detail, /home area Motijheel/);
  assert.match(res.detail, /10m past/);
});

test('OVERLAPS_JOB: would not clear the area before the next job is due', () => {
  // Follower B is committed at 10:00 in Motijheel. A runs to 10:30 in Gulshan
  // and the trip is 45 minutes, so A cannot go first.
  const a = job({ id: 'A', area: 'Gulshan', windowStart: hm(8), windowEnd: hm(12), durationMin: 150 });
  const b = job({ id: 'B', area: 'Motijheel', windowStart: hm(10), windowEnd: hm(12), durationMin: 60 });

  let plan = planFor(gulshanTech, [a, b]);
  plan = applyPlacement(plan, gulshanTech, b, 0);
  assert.equal(plan.routes.TT[0].start, hm(10));

  const res = checkFeasible(a, gulshanTech, null, plan);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.rule, 'OVERLAPS_JOB');
  assert.match(res.detail, /due at B in Motijheel at 10:00/);
  assert.match(res.detail, /1h 15m short/);
});

test('afterJob chains from the previous job area and finish time', () => {
  const a = job({ id: 'A', area: 'Gulshan', windowStart: hm(8), windowEnd: hm(12), durationMin: 60 });
  const b = job({ id: 'B', area: 'Banani', windowStart: hm(8), windowEnd: hm(14), durationMin: 30 });

  let plan = planFor(gulshanTech, [a, b]);
  plan = applyPlacement(plan, gulshanTech, a, 0); // 08:00–09:00 in Gulshan

  const res = checkFeasible(b, gulshanTech, a, plan);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.travelMin, travelMinutes('Gulshan', 'Banani'));
  assert.equal(res.arrival, hm(9, 15));
  assert.equal(res.start, hm(9, 15));
  assert.equal(res.finish, hm(9, 45));
});

// ---- Seed data and solver ----------------------------------------------

test('seed data meets the stated minimums', () => {
  assert.ok(TECHNICIANS.length >= 12, 'at least 12 technicians');
  assert.ok(JOBS.length >= 30, 'at least 30 jobs');
  for (const t of TECHNICIANS) {
    assert.ok(t.shiftEnd > t.shiftStart, `${t.id} shift must be positive`);
    assert.ok(t.skills.length > 0, `${t.id} needs a skill`);
  }
  for (const j of JOBS) {
    assert.ok(j.windowEnd >= j.windowStart, `${j.code} window must not be inverted`);
    assert.ok(j.durationMin > 0, `${j.code} needs a duration`);
    assert.ok(SKILLS.includes(j.skill), `${j.code} skill must be in the catalogue`);
  }
  assert.equal(new Set(JOBS.map((j) => j.id)).size, JOBS.length, 'job ids unique');
  assert.equal(new Set(TECHNICIANS.map((t) => t.id)).size, TECHNICIANS.length, 'tech ids unique');
});

test('every job on the solved board is legal where it sits', () => {
  const { plan } = solve(TECHNICIANS, JOBS);
  for (const tech of TECHNICIANS) {
    const route = plan.routes[tech.id] ?? [];
    let scratch = withEmptyRoute(plan, tech.id);
    let previous: Job | null = null;
    for (const a of route) {
      const j = plan.jobs[a.jobId];
      const res = checkFeasible(j, tech, previous, scratch);
      assert.equal(res.ok, true, `${j.code} on ${tech.name} must be legal`);
      if (!res.ok) return;
      assert.equal(res.start, a.start, `${j.code} start must match the board`);
      assert.equal(res.finish, a.finish, `${j.code} finish must match the board`);
      scratch = applyPlacement(scratch, tech, j, scratch.routes[tech.id].length);
      previous = j;
    }
  }
});

test('the blocked list names a rule for every job it could not place', () => {
  const { plan, stats } = solve(TECHNICIANS, JOBS);
  assert.ok(stats.assigned >= 30, `expected 30+ jobs assigned, got ${stats.assigned}`);
  assert.ok(plan.blocked.length >= 4 && plan.blocked.length <= 6,
    `expected 4-6 blocked jobs, got ${plan.blocked.length}`);

  for (const b of plan.blocked) {
    assert.ok(b.detail.length > 20, `${b.jobId} needs a human reason, got "${b.detail}"`);
    assert.equal(b.perTech.length, TECHNICIANS.length, `${b.jobId} must be checked against everyone`);
  }

  const rules = new Set(plan.blocked.map((b) => b.rule));
  for (const expected of ['SKILL_MISMATCH', 'OUTSIDE_SHIFT', 'WINDOW_MISSED', 'NO_RETURN_TIME', 'OVERLAPS_JOB']) {
    assert.ok(rules.has(expected as never), `seed data should demonstrate ${expected}; got ${[...rules].join(', ')}`);
  }
});

test('the improvement pass lowers travel and never raises it', () => {
  const { stats } = solve(TECHNICIANS, JOBS);
  assert.ok(stats.totalTravelMin <= stats.greedyTravelMin,
    `improvement pass must not make travel worse (${stats.greedyTravelMin} -> ${stats.totalTravelMin})`);
  assert.ok(stats.swapsApplied + stats.relocationsApplied > 0, 'the pass should find at least one improvement');
  assert.ok(stats.totalTravelMin < stats.greedyTravelMin, 'and that improvement should show in the objective');
});

test('the optimised plan is clearly better than random', () => {
  const { plan, stats } = solve(TECHNICIANS, JOBS);
  const baseline = randomBaseline(TECHNICIANS, JOBS);
  assert.ok(
    stats.totalTravelMin < baseline.meanTravelMin,
    `optimised ${stats.totalTravelMin} should beat random mean ${baseline.meanTravelMin}`,
  );
  assert.ok(stats.assigned >= baseline.meanAssigned, 'and should not place fewer jobs');
  assert.equal(plan.totalTravelMin, stats.totalTravelMin);
});

test('the timeline accounts for every minute of a technician shift', () => {
  const { plan } = solve(TECHNICIANS, JOBS);
  for (const tech of TECHNICIANS) {
    const segments = buildTimeline(tech, plan);
    let cursor = tech.shiftStart;
    for (const s of segments) {
      assert.equal(s.from, cursor, `${tech.id} timeline must be contiguous`);
      assert.ok(s.to > s.from, `${tech.id} segment must have length`);
      cursor = s.to;
    }
    assert.equal(cursor, tech.shiftEnd, `${tech.id} timeline must cover the whole shift`);
  }
});

test('refreshPlan keeps the objective and the blocked list in step', () => {
  const { plan } = solve(TECHNICIANS, JOBS);
  const again = refreshPlan(plan, TECHNICIANS, JOBS);
  assert.equal(again.totalTravelMin, plan.totalTravelMin);
  assert.equal(again.blocked.length, plan.blocked.length);
});
