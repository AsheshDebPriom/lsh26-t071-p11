import assert from 'node:assert/strict';
import test from 'node:test';

import { CASES, PUBLISHED_CASES, caseWindow } from './cases';
import { checkFeasible } from './feasibility';
import {
  applyPlacement,
  buildTimeline,
  emptyPlan,
  emptyPlanForCase,
  refreshPlan,
  withEmptyRoute,
} from './plan';
import { CRAFTED_DAY, CRAFTED_TRAVEL } from './seed';
import { randomBaselineForCase, solveCase } from './solver';
import { hm, parseHM } from './time';
import { assertMatrixIsSane, travelMinutes } from './travel';
import type { Job, Plan, RuleOptions, Technician } from './types';
import { DEFAULT_RULES } from './types';

/**
 * One case per RuleName, plus the happy path, plus the invariants the whole
 * board depends on, run against both the crafted day and all 25 published
 * cases. `npm test`.
 */

const RETURN_HOME: RuleOptions = { requireReturnHome: true };

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

function planFor(tech: Technician, jobs: Job[], rules: RuleOptions = DEFAULT_RULES): Plan {
  return emptyPlan([tech], jobs, CRAFTED_TRAVEL, rules);
}

test('parseHM and formatTime round-trip the published time format', () => {
  assert.equal(parseHM('09:00'), 540);
  assert.equal(parseHM('6:05'), 365);
  assert.equal(parseHM('19:30'), 1170);
  assert.throws(() => parseHM('nine'));
});

test('every travel table is symmetric and zero on the diagonal', () => {
  assertMatrixIsSane(CRAFTED_TRAVEL, CRAFTED_DAY.areas);
  for (const day of PUBLISHED_CASES) assertMatrixIsSane(day.travel, day.areas);
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

test('NO_RETURN_TIME: only bites when the return-home rule is switched on', () => {
  // Finishes 15:00 in Uttara; 70 minutes home to Motijheel lands 16:10 > 16:00.
  const j = job({ id: 'A', area: 'Uttara', windowStart: hm(13), windowEnd: hm(14), durationMin: 120 });

  // Default policy follows the published format note: no return home required.
  const allowed = checkFeasible(j, motijheelTech, null, planFor(motijheelTech, [j]));
  assert.equal(allowed.ok, true, 'with the rule off this is a legal day');

  const res = checkFeasible(j, motijheelTech, null, planFor(motijheelTech, [j], RETURN_HOME));
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
  assert.equal(res.travelMin, travelMinutes(CRAFTED_TRAVEL, 'Gulshan', 'Banani'));
  assert.equal(res.arrival, hm(9, 15));
  assert.equal(res.start, hm(9, 15));
  assert.equal(res.finish, hm(9, 45));
});

// ---- Case data ---------------------------------------------------------

test('every case meets the stated minimums', () => {
  assert.equal(PUBLISHED_CASES.length, 25, 'all published cases load');
  for (const day of CASES) {
    assert.ok(day.technicians.length >= 12, `${day.id}: at least 12 technicians`);
    assert.ok(day.jobs.length >= 30, `${day.id}: at least 30 jobs`);
    for (const t of day.technicians) {
      assert.ok(t.shiftEnd > t.shiftStart, `${day.id}/${t.id} shift must be positive`);
      assert.ok(t.skills.length > 0, `${day.id}/${t.id} needs a skill`);
      assert.ok(day.areas.includes(t.homeArea), `${day.id}/${t.id} home area must be known`);
    }
    for (const j of day.jobs) {
      assert.ok(j.windowEnd >= j.windowStart, `${day.id}/${j.code} window must not be inverted`);
      assert.ok(j.durationMin > 0, `${day.id}/${j.code} needs a duration`);
      assert.ok(day.areas.includes(j.area), `${day.id}/${j.code} area must be known`);
    }
    assert.equal(new Set(day.jobs.map((j) => j.id)).size, day.jobs.length, `${day.id} job ids unique`);
    assert.equal(new Set(day.technicians.map((t) => t.id)).size, day.technicians.length, `${day.id} tech ids unique`);
    const w = caseWindow(day);
    assert.ok(w.end > w.start, `${day.id} board window must have width`);
  }
});

test('every published case carries the scripted manual move for requirement 4', () => {
  for (const day of PUBLISHED_CASES) {
    assert.ok(day.manualMove, `${day.id} should publish a manual_move`);
    if (!day.manualMove) continue;
    assert.ok(day.jobs.some((j) => j.id === day.manualMove!.jobId), `${day.id} move names a real job`);
    assert.ok(
      day.technicians.some((t) => t.id === day.manualMove!.toTechnicianId),
      `${day.id} move names a real technician`,
    );
  }
});

// ---- Solver ------------------------------------------------------------

test('every job on every solved board is legal where it sits', () => {
  for (const day of CASES) {
    const { plan } = solveCase(day);
    for (const tech of day.technicians) {
      const route = plan.routes[tech.id] ?? [];
      let scratch = withEmptyRoute(plan, tech.id);
      let previous: Job | null = null;
      for (const a of route) {
        const j = plan.jobs[a.jobId];
        const res = checkFeasible(j, tech, previous, scratch);
        assert.equal(res.ok, true, `${day.id}: ${j.code} on ${tech.name} must be legal`);
        if (!res.ok) return;
        assert.equal(res.start, a.start, `${day.id}: ${j.code} start must match the board`);
        assert.equal(res.finish, a.finish, `${day.id}: ${j.code} finish must match the board`);
        scratch = applyPlacement(scratch, tech, j, scratch.routes[tech.id].length);
        previous = j;
      }
    }
  }
});

test('the blocked list names a rule and a human reason for every unplaced job', () => {
  for (const day of CASES) {
    const { plan } = solveCase(day);
    const placed = new Set(Object.values(plan.routes).flatMap((r) => r.map((a) => a.jobId)));
    const unplaced = day.jobs.filter((j) => !placed.has(j.id));
    assert.equal(plan.blocked.length, unplaced.length, `${day.id}: every unplaced job is explained`);
    for (const b of plan.blocked) {
      assert.ok(b.detail.length > 20, `${day.id}/${b.jobId} needs a human reason, got "${b.detail}"`);
      assert.equal(b.perTech.length, day.technicians.length, `${day.id}/${b.jobId} checked against everyone`);
      assert.ok(!b.nowPlaceable, `${day.id}/${b.jobId} must not be placeable after solving`);
    }
  }
});

test('the crafted day demonstrates all five hard rules at once', () => {
  const { plan, stats } = solveCase(CRAFTED_DAY);
  assert.ok(stats.assigned >= 30, `expected 30+ jobs assigned, got ${stats.assigned}`);
  assert.ok(
    plan.blocked.length >= 4 && plan.blocked.length <= 6,
    `expected 4-6 blocked jobs, got ${plan.blocked.length}`,
  );
  const rules = new Set(plan.blocked.map((b) => b.rule));
  for (const expected of [
    'SKILL_MISMATCH', 'OUTSIDE_SHIFT', 'WINDOW_MISSED', 'NO_RETURN_TIME', 'OVERLAPS_JOB',
  ]) {
    assert.ok(rules.has(expected as never), `crafted day should show ${expected}; got ${[...rules].join(', ')}`);
  }
});

test('the improvement pass never makes the objective worse', () => {
  for (const day of CASES) {
    const { stats } = solveCase(day);
    assert.ok(
      stats.totalTravelMin <= stats.greedyTravelMin,
      `${day.id}: improvement pass raised travel (${stats.greedyTravelMin} -> ${stats.totalTravelMin})`,
    );
  }
});

test('the optimised plan is clearly better than random on every case', () => {
  for (const day of CASES) {
    const { stats } = solveCase(day);
    const baseline = randomBaselineForCase(day, undefined, 10);
    assert.ok(
      stats.totalTravelMin < baseline.meanTravelMin,
      `${day.id}: optimised ${stats.totalTravelMin} should beat random mean ${baseline.meanTravelMin}`,
    );
    assert.ok(
      stats.assigned >= baseline.meanAssigned,
      `${day.id}: optimised placed ${stats.assigned}, random averaged ${baseline.meanAssigned}`,
    );
  }
});

test('the timeline accounts for every minute of a technician shift', () => {
  for (const day of CASES) {
    const { plan } = solveCase(day);
    for (const tech of day.technicians) {
      const segments = buildTimeline(tech, plan);
      let cursor = tech.shiftStart;
      for (const s of segments) {
        assert.equal(s.from, cursor, `${day.id}/${tech.id} timeline must be contiguous`);
        assert.ok(s.to > s.from, `${day.id}/${tech.id} segment must have length`);
        cursor = s.to;
      }
      assert.equal(cursor, tech.shiftEnd, `${day.id}/${tech.id} timeline must cover the whole shift`);
    }
  }
});

test('refreshPlan keeps the objective and the blocked list in step', () => {
  const { plan } = solveCase(CRAFTED_DAY);
  const again = refreshPlan(plan, CRAFTED_DAY.technicians, CRAFTED_DAY.jobs);
  assert.equal(again.totalTravelMin, plan.totalTravelMin);
  assert.equal(again.blocked.length, plan.blocked.length);
});

test('an empty plan for a case starts with every job blocked and no travel', () => {
  const plan = refreshPlan(emptyPlanForCase(CRAFTED_DAY), CRAFTED_DAY.technicians, CRAFTED_DAY.jobs);
  assert.equal(plan.totalTravelMin, 0);
  assert.equal(plan.blocked.length, CRAFTED_DAY.jobs.length);
});
