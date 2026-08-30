import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BlockedPanel } from '../components/board/BlockedPanel';
import { EmergencyForm } from '../components/board/EmergencyForm';
import { Header } from '../components/board/Header';
import { Legend } from '../components/board/Legend';
import { MoveControl } from '../components/board/MoveControl';
import { TechnicianLane } from '../components/board/TechnicianLane';
import { PUBLISHED_CASES, caseWindow } from './cases';
import { bestPlacementOnTech, findTechForJob, totalIdle, withoutJob } from './plan';
import { skillColours } from './palette';
import { randomBaselineForCase, solveCase } from './solver';
import { scorePlan } from './score';
import { DEFAULT_RULES, RULE_LABEL, RULE_ORDER } from './types';

/**
 * The board is drawn from arithmetic, not from a chart library, so the markup
 * is worth asserting on: percentage geometry inside the track, all three block
 * types present, and every blocked job reachable with its rule named.
 */

const day = PUBLISHED_CASES[0];
const { plan } = solveCase(day);
const colours = skillColours(day);
const window = caseWindow(day);
const noop = () => {};

function laneMarkup(techIndex: number): string {
  return renderToStaticMarkup(
    createElement(TechnicianLane, {
      tech: day.technicians[techIndex],
      plan,
      dayStart: window.start,
      dayEnd: window.end,
      colours,
      striped: false,
      selectedJobId: null,
      onSelectJob: noop,
    }),
  );
}

test('a technician lane renders all three block types on a percentage scale', () => {
  const busiest = day.technicians
    .map((t, i) => ({ i, n: (plan.routes[t.id] ?? []).length }))
    .sort((a, b) => b.n - a.n)[0];
  assert.ok(busiest.n >= 2, 'the test needs a technician with a real route');

  const html = laneMarkup(busiest.i);
  assert.match(html, /hatch-travel/, 'travel gaps are drawn');
  assert.match(html, /tint-idle/, 'idle time is drawn');
  assert.match(html, /left:\s*[\d.]+%/, 'blocks are positioned as a percentage of the day');
  assert.match(html, /width:\s*[\d.]+%/, 'blocks are sized as a percentage of the day');

  const tech = day.technicians[busiest.i];
  assert.ok(html.includes(tech.name), 'the lane names its technician');
  for (const a of plan.routes[tech.id] ?? []) {
    assert.ok(html.includes(plan.jobs[a.jobId].code), `lane shows ${plan.jobs[a.jobId].code}`);
  }
});

test('every lane renders, including technicians with an empty day', () => {
  for (let i = 0; i < day.technicians.length; i++) {
    const html = laneMarkup(i);
    assert.ok(html.length > 200, `${day.technicians[i].id} lane must render`);
  }
  const idle = day.technicians.findIndex((t) => (plan.routes[t.id] ?? []).length === 0);
  if (idle >= 0) assert.match(laneMarkup(idle), /no jobs/);
});

test('the blocked panel names the rule and the reason for every job', () => {
  const html = renderToStaticMarkup(
    createElement(BlockedPanel, {
      plan,
      technicians: day.technicians,
      colours,
      selectedJobId: null,
      onSelectJob: noop,
      onMove: noop,
    }),
  );
  assert.ok(plan.blocked.length > 0, 'this case should have blocked jobs to show');
  for (const b of plan.blocked) {
    assert.ok(html.includes(plan.jobs[b.jobId].code), `panel lists ${b.jobId}`);
    assert.ok(html.includes(b.rule), `panel names the rule for ${b.jobId}`);
  }
  assert.match(html, /Cannot be done today/);
});

test('the legend explains all three block types and every rule', () => {
  const html = renderToStaticMarkup(
    createElement(Legend, {
      day,
      colours,
      plan,
      technicians: day.technicians,
      idleMin: totalIdle(plan, day.technicians),
      selectedJobId: null,
      onMove: noop,
    }),
  );
  for (const needle of ['Job', 'Driving', 'Idle', 'Off shift']) {
    assert.ok(html.includes(needle), `legend explains ${needle}`);
  }
  for (const rule of RULE_ORDER) {
    assert.ok(html.includes(RULE_LABEL[rule]), `legend explains ${rule}`);
  }
});

test('the header states what the tool is, the goal, and where the data came from', () => {
  const { stats } = solveCase(day);
  const html = renderToStaticMarkup(
    createElement(Header, {
      day,
      cases: [day],
      onPickCase: noop,
      rules: DEFAULT_RULES,
      onToggleReturnHome: noop,
      onGenerate: noop,
      onReset: noop,
      solving: false,
      hasPlan: true,
      plan,
      stats,
      baseline: randomBaselineForCase(day, undefined, 5),
      score: scorePlan(plan, day.technicians, day.jobs.length),
      generatedScore: null,
      edited: false,
      onRestore: noop,
    }),
  );

  // A first-time visitor must be told what this is before they see a number.
  assert.match(html, /Dispatch Board/);
  assert.match(html, /who goes where/);
  // The goal has to be stated in words, not just implied by a figure.
  assert.match(html, /Minimising total travel time across all technicians/);
  // Provenance: the published case is named, so nothing is passed off as ours.
  assert.match(html, /Published case PUB-01/);
  // The scored numbers are labelled in plain English.
  for (const label of ['Jobs scheduled', 'Cannot be done', 'Total travel', 'Better than random']) {
    assert.ok(html.includes(label), `header labels "${label}"`);
  }
});

test('the move control pre-flights every technician and agrees with checkFeasible', () => {
  const blocked = plan.blocked[0];
  const job = plan.jobs[blocked.jobId];
  const html = renderToStaticMarkup(
    createElement(MoveControl, {
      job,
      plan,
      technicians: day.technicians,
      currentTechId: null,
      onMove: noop,
    }),
  );
  for (const tech of day.technicians) {
    assert.ok(html.includes(tech.name), `move list offers ${tech.name}`);
    const expected = bestPlacementOnTech(plan, job, tech);
    // A blocked job must be refused by everyone, and each refusal is named.
    assert.equal(expected.ok, false);
    if (!expected.ok) assert.ok(html.includes(expected.rule));
  }
  assert.match(html, /0 of \d+ legal/);
});

test('an assigned job offers legal alternatives once it is lifted off its own day', () => {
  // Most assigned jobs can legally go somewhere else; find one and check the
  // control counts the alternatives exactly as checkFeasible does.
  let found: { techId: string; jobId: string; legal: number } | null = null;
  for (const [techId, route] of Object.entries(plan.routes)) {
    for (const a of route) {
      const lifted = withoutJob(plan, a.jobId, day.technicians);
      const legal = day.technicians.filter(
        (t) => t.id !== techId && bestPlacementOnTech(lifted, plan.jobs[a.jobId], t).ok,
      ).length;
      if (legal > 0) {
        found = { techId, jobId: a.jobId, legal };
        break;
      }
    }
    if (found) break;
  }
  assert.ok(found, 'some assigned job should have a legal alternative technician');
  if (!found) return;

  const html = renderToStaticMarkup(
    createElement(MoveControl, {
      job: plan.jobs[found.jobId],
      plan,
      technicians: day.technicians,
      currentTechId: found.techId,
      onMove: noop,
    }),
  );
  assert.match(html, /current technician/);
  assert.ok(
    html.includes(`${found.legal} of ${day.technicians.length} legal`),
    `control should offer ${found.legal} legal destinations`,
  );
});

test('every published scripted manual move gets a named verdict', () => {
  // The published cases script a move for AT4. Whatever the answer is, the app
  // must give one: either a legal placement with a start time, or the exact
  // rule that stops it.
  const rulesSeen = new Set<string>();
  for (const day of PUBLISHED_CASES) {
    const { plan: p } = solveCase(day);
    assert.ok(day.manualMove, `${day.id} publishes a manual_move`);
    if (!day.manualMove) continue;

    const job = p.jobs[day.manualMove.jobId];
    const tech = day.technicians.find((t) => t.id === day.manualMove!.toTechnicianId)!;
    const from = findTechForJob(p, job.id);
    if (from === tech.id) continue; // a no-op move, handled as "already there"

    const lifted = from ? withoutJob(p, job.id, day.technicians) : p;
    const verdict = bestPlacementOnTech(lifted, job, tech);
    if (verdict.ok) {
      assert.ok(verdict.placement.result.start >= job.windowStart, `${day.id}: legal move starts in window`);
    } else {
      rulesSeen.add(verdict.rule);
      assert.ok(verdict.detail.length > 20, `${day.id}: rejection must explain itself`);
      assert.ok(
        verdict.detail.includes(tech.name) || verdict.detail.includes(job.area) || /\d\d:\d\d/.test(verdict.detail),
        `${day.id}: rejection must be specific, got "${verdict.detail}"`,
      );
    }
  }
  assert.ok(rulesSeen.size >= 2, `scripted moves should exercise several rules, saw ${[...rulesSeen].join(', ')}`);
});

test('the emergency form renders with a workable call already filled in', () => {
  const html = renderToStaticMarkup(
    createElement(EmergencyForm, {
      day,
      nowMinutes: 12 * 60,
      onNowChange: noop,
      onRaise: noop,
      onCancel: noop,
      index: 1,
    }),
  );
  assert.match(html, /Raise emergency/);
  assert.match(html, /Time now/);
  // Prefilled so a first-time user can raise one without inventing values.
  assert.match(html, /value="12:00"/);
  assert.match(html, /value="12:30"/);
  // Only areas and skills this case actually has may be offered.
  for (const area of day.areas) assert.ok(html.includes(area), `offers ${area}`);
  // And it must say what a mid-day replan will and will not touch.
  assert.match(html, /already under way/);
});
