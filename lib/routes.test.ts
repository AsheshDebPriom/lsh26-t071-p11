import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLISHED_CASES } from './cases';
import { arcBetween, areaLatLng, hasAreaLatLng, technicianColour } from './geo';
import { emptyPlanForCase } from './plan';
import { areaLoad, buildRoutes } from './routes';
import { CRAFTED_DAY } from './seed';
import { solveCase } from './solver';

/**
 * The map draws through Leaflet, imperatively, so there is nothing useful to
 * assert in its markup. What is worth pinning down is the model it draws from:
 * the journeys, the load per area, and the geography they are placed on.
 */

const day = PUBLISHED_CASES[0];
const { plan } = solveCase(day);

test('every area named by any case has a real position on the map', () => {
  for (const c of [...PUBLISHED_CASES, CRAFTED_DAY]) {
    for (const area of c.areas) {
      assert.ok(hasAreaLatLng(area), `${c.id} uses "${area}", which the map does not know`);
    }
  }
});

test('the area positions are inside Dhaka', () => {
  const areas = new Set(PUBLISHED_CASES.flatMap((c) => c.areas));
  for (const area of areas) {
    const p = areaLatLng(area);
    // A generous box around greater Dhaka; a typo would land far outside it.
    assert.ok(p.lat > 23.6 && p.lat < 24.0, `${area} latitude ${p.lat} is not in Dhaka`);
    assert.ok(p.lng > 90.2 && p.lng < 90.6, `${area} longitude ${p.lng} is not in Dhaka`);
  }
});

test('no two areas sit on top of each other', () => {
  const areas = [...new Set(PUBLISHED_CASES.flatMap((c) => c.areas))];
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areaLatLng(areas[i]);
      const b = areaLatLng(areas[j]);
      const apart = Math.hypot(a.lat - b.lat, a.lng - b.lng);
      assert.ok(apart > 0.004, `${areas[i]} and ${areas[j]} are drawn on the same spot`);
    }
  }
});

test('an arc starts and ends exactly on its two areas', () => {
  const a = areaLatLng('Uttara');
  const b = areaLatLng('Motijheel');
  const arc = arcBetween(a, b);

  assert.ok(arc.length > 2, 'an arc is sampled into points');
  assert.equal(arc[0][0], a.lat);
  assert.equal(arc[0][1], a.lng);
  assert.equal(arc[arc.length - 1][0], b.lat);
  assert.equal(arc[arc.length - 1][1], b.lng);

  // It bows: the midpoint is off the straight line between the two ends.
  const straightMid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const arcMid = arc[Math.floor(arc.length / 2)];
  assert.ok(
    Math.hypot(arcMid[0] - straightMid.lat, arcMid[1] - straightMid.lng) > 0.001,
    'the arc should not be a straight line',
  );
});

test('each technician colour is distinct and never the alarm red', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    const colour = technicianColour(i, 16);
    assert.ok(!seen.has(colour), 'technician colours must not repeat');
    seen.add(colour);
    const hue = Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(colour)?.[1]);
    assert.ok(Number.isFinite(hue), `could not read the hue from ${colour}`);
    // The alarm colour lives at hue 25; keep routes well clear of it.
    const distance = Math.min(Math.abs(hue - 25), 360 - Math.abs(hue - 25));
    assert.ok(distance > 20, `${colour} is too close to the alarm hue`);
  }
});

test('a route is one journey per working technician, in visit order', () => {
  const routes = buildRoutes(day, plan);
  const working = day.technicians.filter((t) => (plan.routes[t.id] ?? []).length > 0);
  assert.equal(routes.length, working.length, 'idle technicians draw no route');

  for (const route of routes) {
    const assignments = plan.routes[route.techId];
    const tech = day.technicians.find((t) => t.id === route.techId)!;

    // Home, then every job in the order the technician does them.
    assert.equal(route.stops[0].area, tech.homeArea, 'a day starts at the home area');
    assert.equal(route.stops.length, assignments.length + 1, 'one stop per job, plus home');
    assignments.forEach((a, i) => {
      assert.equal(route.stops[i + 1].jobId, a.jobId, 'stops follow the route order');
      assert.equal(route.stops[i + 1].area, plan.jobs[a.jobId].area);
    });

    assert.equal(
      route.travelMin,
      assignments.reduce((n, a) => n + a.travelMin, 0),
      'the route reports the travel the plan actually costs',
    );
    assert.ok(route.legCount <= route.stops.length - 1, 'legs cannot exceed gaps between stops');
  }
});

test('consecutive jobs in the same area are not counted as a journey', () => {
  const routes = buildRoutes(day, plan);
  for (const route of routes) {
    let expected = 0;
    for (let i = 0; i < route.stops.length - 1; i++) {
      if (route.stops[i].area !== route.stops[i + 1].area) expected++;
    }
    assert.equal(route.legCount, expected, `${route.name} leg count must skip same-area hops`);
  }
});

test('the return-home leg is only drawn when the rule requires it', () => {
  const withReturn = solveCase(CRAFTED_DAY, { requireReturnHome: true });
  const without = solveCase(CRAFTED_DAY, { requireReturnHome: false });

  for (const route of buildRoutes(CRAFTED_DAY, withReturn.plan)) {
    const tech = CRAFTED_DAY.technicians.find((t) => t.id === route.techId)!;
    assert.equal(
      route.stops[route.stops.length - 1].area,
      tech.homeArea,
      'with the rule on, the journey ends at home',
    );
  }
  for (const route of buildRoutes(CRAFTED_DAY, without.plan)) {
    assert.equal(
      route.stops[route.stops.length - 1].jobId !== null,
      true,
      'with the rule off, the journey ends at the last job',
    );
  }
});

test('area load counts every job and marks the ones nobody can take', () => {
  const load = areaLoad(day, plan);
  const totalCounted = [...load.values()].reduce((n, e) => n + e.total, 0);
  assert.equal(totalCounted, day.jobs.length, 'every job is counted once');

  const blockedCounted = [...load.values()].reduce((n, e) => n + e.blocked, 0);
  assert.equal(blockedCounted, plan.blocked.length, 'every blocked job is flagged in its area');

  for (const b of plan.blocked) {
    const area = plan.jobs[b.jobId].area;
    assert.ok((load.get(area)?.blocked ?? 0) > 0, `${area} should be flagged for ${b.jobId}`);
  }
});

test('there is nothing to draw before a plan exists', () => {
  const routes = buildRoutes(day, emptyPlanForCase(day));
  assert.equal(routes.length, 0, 'no plan, no journeys');

  // The work is still placed, which is what the empty state shows.
  const load = areaLoad(day, emptyPlanForCase(day));
  assert.equal([...load.values()].reduce((n, e) => n + e.total, 0), day.jobs.length);
});
