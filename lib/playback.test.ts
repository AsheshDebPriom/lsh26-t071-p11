import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLISHED_CASES } from './cases';
import { describeReach, fleetAt, fleetSummary, positionAt, reachFor } from './playback';
import { longestLeg, buildRoutes, worstLegs } from './routes';
import { CRAFTED_DAY } from './seed';
import { solveCase } from './solver';
import { travelMinutes } from './travel';

/**
 * The map's three new answers: where the driving is being spent, where each
 * technician actually is at a given minute, and how far away help was from a
 * job nobody could take.
 */

const day = PUBLISHED_CASES[0];
const { plan } = solveCase(day);
const routes = buildRoutes(day, plan);

// ---- Where the driving goes --------------------------------------------

test('a route reports one leg per real move, with the plan’s own minutes', () => {
  for (const route of routes) {
    const assignments = plan.routes[route.techId];
    // Every leg's minutes must come from the plan, not from the map.
    route.legs.forEach((leg) => {
      assert.equal(
        leg.minutes,
        travelMinutes(plan.travel, leg.from, leg.to),
        `${route.name}: ${leg.from}→${leg.to} must match the travel table`,
      );
      assert.notEqual(leg.from, leg.to, 'a leg between one area and itself is not a leg');
    });
    // The legs must add up to what the plan says the technician drove.
    const summed = route.legs.reduce((n, l) => n + l.minutes, 0);
    const planned = assignments.reduce((n, a) => n + a.travelMin, 0);
    assert.equal(summed, planned, `${route.name}: legs must total the plan's travel`);
  }
});

test('the worst legs really are the longest ones', () => {
  const worst = worstLegs(routes, 3);
  assert.ok(worst.length > 0, 'this case should have legs to rank');

  const everyLeg = routes.flatMap((r) => r.legs.map((l) => l.minutes)).sort((a, b) => b - a);
  worst.forEach((w, i) => assert.equal(w.leg.minutes, everyLeg[i], `worst[${i}] must be the ${i + 1}th longest`));
  assert.equal(longestLeg(routes), everyLeg[0], 'longestLeg must agree');
});

test('a plan with no driving has no legs to rank', () => {
  const empty = buildRoutes(day, { ...plan, routes: {} });
  assert.deepEqual(worstLegs(empty), []);
  assert.equal(longestLeg(empty), 1, 'and a safe divisor rather than zero');
});

// ---- Where everyone is --------------------------------------------------

test('a technician is off shift before it starts and after it ends', () => {
  const tech = day.technicians[0];
  assert.equal(positionAt(tech, plan, tech.shiftStart - 1).kind, 'off');
  assert.equal(positionAt(tech, plan, tech.shiftEnd + 1).kind, 'off');
  assert.notEqual(positionAt(tech, plan, tech.shiftStart).kind, 'off', 'on shift at the very start');
});

test('at the exact minute a job starts, the technician is on site working it', () => {
  for (const tech of day.technicians) {
    for (const a of plan.routes[tech.id] ?? []) {
      const job = plan.jobs[a.jobId];
      const at = positionAt(tech, plan, a.start);
      assert.equal(at.kind, 'at', `${tech.name} should be somewhere at ${a.start}`);
      if (at.kind !== 'at') return;
      assert.equal(at.area, job.area, `${job.code}: in the job's area`);
      assert.equal(at.doing, 'working');
      assert.equal(at.jobId, job.id);
    }
  }
});

test('mid-leg, the technician is between the two areas and part way along', () => {
  let checked = 0;
  for (const tech of day.technicians) {
    for (const a of plan.routes[tech.id] ?? []) {
      if (a.travelMin < 2) continue;
      const mid = a.departure + Math.floor(a.travelMin / 2);
      const at = positionAt(tech, plan, mid);
      assert.equal(at.kind, 'between', `${tech.name} should be driving at ${mid}`);
      if (at.kind !== 'between') return;
      assert.equal(at.to, plan.jobs[a.jobId].area);
      assert.ok(at.t > 0 && at.t < 1, `t should be part way, got ${at.t}`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'the case should have some driving to check');
});

test('waiting for a window to open is reported as waiting, not working', () => {
  let found = 0;
  for (const tech of day.technicians) {
    for (const a of plan.routes[tech.id] ?? []) {
      if (a.start <= a.arrival) continue; // no wait on this job
      const at = positionAt(tech, plan, a.arrival);
      assert.equal(at.kind, 'at');
      if (at.kind !== 'at') return;
      assert.equal(at.doing, 'waiting', `${plan.jobs[a.jobId].code}: arrived early`);
      assert.equal(at.area, plan.jobs[a.jobId].area, 'waiting at the job, not on the road');
      found++;
    }
  }
  assert.ok(found > 0, 'this case should have someone arriving early');
});

test('a technician with no jobs is on shift but idle, never off', () => {
  const idle = day.technicians.find((t) => (plan.routes[t.id] ?? []).length === 0);
  if (!idle) return; // nothing to check on this case
  const at = positionAt(idle, plan, (idle.shiftStart + idle.shiftEnd) / 2);
  assert.equal(at.kind, 'at');
  if (at.kind !== 'at') return;
  assert.equal(at.area, idle.homeArea);
  assert.match(at.label, /nothing scheduled/);
});

test('the fleet summary accounts for every technician at every hour', () => {
  for (let m = 6 * 60; m <= 22 * 60; m += 30) {
    const fleet = fleetAt(day, plan, m);
    assert.equal(fleet.length, day.technicians.length);
    const s = fleetSummary(fleet);
    assert.equal(
      s.working + s.driving + s.waiting + s.off,
      day.technicians.length,
      `everyone is somewhere at ${m}`,
    );
  }
});

test('the return-home leg is only walked when the rule is on', () => {
  const on = solveCase(CRAFTED_DAY, { requireReturnHome: true }).plan;
  const off = solveCase(CRAFTED_DAY, { requireReturnHome: false }).plan;

  for (const tech of CRAFTED_DAY.technicians) {
    const route = off.routes[tech.id] ?? [];
    if (route.length === 0) continue;
    const last = route[route.length - 1];
    const after = positionAt(tech, off, Math.min(last.finish + 5, tech.shiftEnd));
    assert.notEqual(after.kind, 'between', `${tech.name} should not drive home with the rule off`);
  }

  // With the rule on, somebody drives home after their last job.
  const drivesHome = CRAFTED_DAY.technicians.some((tech) => {
    const route = on.routes[tech.id] ?? [];
    if (route.length === 0) return false;
    const last = route[route.length - 1];
    const lastArea = on.jobs[last.jobId].area;
    if (lastArea === tech.homeArea) return false;
    return positionAt(tech, on, Math.min(last.finish + 1, tech.shiftEnd)).kind === 'between';
  });
  assert.ok(drivesHome, 'with the rule on, someone should be driving home');
});

// ---- Why a blocked job was out of reach --------------------------------

test('reach lists only technicians who hold the skill, nearest first', () => {
  for (const b of plan.blocked) {
    const job = plan.jobs[b.jobId];
    const reaches = reachFor(job, day, plan);

    for (const r of reaches) {
      assert.ok(r.tech.skills.includes(job.skill), `${r.tech.name} must hold ${job.skill}`);
      assert.equal(
        r.travelMin,
        travelMinutes(plan.travel, r.fromArea, job.area),
        'distance comes from the travel table',
      );
      assert.equal(r.earliestArrival, job.windowStart + r.travelMin);
      assert.equal(r.ok, false, 'a blocked job cannot be legally taken by anyone');
      assert.ok(r.rule, 'and each refusal names its rule');
    }

    for (let i = 1; i < reaches.length; i++) {
      assert.ok(reaches[i - 1].travelMin <= reaches[i].travelMin, 'sorted nearest first');
    }
  }
});

test('a job nobody is qualified for says exactly that', () => {
  const mismatch = plan.blocked.find((b) => b.rule === 'SKILL_MISMATCH');
  if (!mismatch) return;
  const job = plan.jobs[mismatch.jobId];
  const reaches = reachFor(job, day, plan);
  assert.equal(reaches.length, 0, 'nobody holds the skill');
  assert.match(describeReach(job, reaches), /Nobody on today's roster holds/);
});

test('the reach caption names the nearest technician and the distance', () => {
  const reachable = plan.blocked
    .map((b) => plan.jobs[b.jobId])
    .find((job) => reachFor(job, day, plan).length > 0);
  if (!reachable) return;

  const reaches = reachFor(reachable, day, plan);
  const caption = describeReach(reachable, reaches);
  assert.ok(caption.includes(reaches[0].tech.name), 'names the nearest');
  assert.ok(caption.includes(reaches[0].fromArea), 'and where they were');
});
