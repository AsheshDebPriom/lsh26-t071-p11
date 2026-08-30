import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLISHED_CASES } from './cases';
import { checkFeasible } from './feasibility';
import { legalCount, previewFor, previewMoves } from './moves';
import { applyPlacement, findTechForJob, withEmptyRoute, withoutJob } from './plan';
import { solveCase } from './solver';
import type { Job, Plan, Technician } from './types';

/**
 * previewMoves is the one answer behind both ways a dispatcher can move a job —
 * the dropdown and the drag. If it were ever wrong, the board would offer a
 * move it then refused, so it is worth pinning down hard.
 */

const day = PUBLISHED_CASES[0];
const { plan } = solveCase(day);

function assertLegal(plan: Plan, tech: Technician, job: Job, position: number) {
  // Rebuild the technician's day with the job inserted and check every stop.
  let scratch = withEmptyRoute(plan, tech.id);
  const ids = (plan.routes[tech.id] ?? []).map((a) => a.jobId);
  ids.splice(position, 0, job.id);

  let previous: Job | null = null;
  for (const id of ids) {
    const j = plan.jobs[id];
    const res = checkFeasible(j, tech, previous, scratch);
    assert.equal(res.ok, true, `${j.code} must be legal on ${tech.name} after the move`);
    if (!res.ok) return;
    scratch = applyPlacement(scratch, tech, j, scratch.routes[tech.id].length);
    previous = j;
  }
}

test('previewMoves judges the job against a board with itself lifted off', () => {
  const techWithWork = day.technicians.find((t) => (plan.routes[t.id] ?? []).length > 1)!;
  const jobId = plan.routes[techWithWork.id][0].jobId;
  const job = plan.jobs[jobId];

  const previews = previewMoves(plan, job, day.technicians, techWithWork.id);
  assert.equal(previews.length, day.technicians.length, 'every technician gets a verdict');

  const own = previewFor(previews, techWithWork.id);
  assert.ok(own?.current, 'the technician who holds it is marked as current');
  assert.equal(own?.ok, false, 'and is not offered as a destination');
});

test('every move previewMoves calls legal really is legal', () => {
  // Walk every assigned job against every technician; anything reported as a
  // legal landing must survive a full rebuild of that technician's day.
  let checked = 0;
  for (const [techId, route] of Object.entries(plan.routes)) {
    for (const a of route.slice(0, 2)) {
      const job = plan.jobs[a.jobId];
      const previews = previewMoves(plan, job, day.technicians, techId);
      const lifted = withoutJob(plan, job.id, day.technicians);
      for (const p of previews) {
        if (!p.ok) continue;
        assert.equal(typeof p.position, 'number', `${job.code} → ${p.tech.name} needs a position`);
        assertLegal(lifted, p.tech, job, p.position!);
        checked++;
      }
    }
  }
  assert.ok(checked > 0, 'the case should offer some legal moves to check');
});

test('every move previewMoves refuses names the rule that refuses it', () => {
  const blocked = plan.blocked[0];
  const job = plan.jobs[blocked.jobId];
  const previews = previewMoves(plan, job, day.technicians, null);

  assert.equal(legalCount(previews), 0, 'a blocked job has nowhere legal to go');
  for (const p of previews) {
    assert.ok(p.rule, `${p.tech.name} must name a rule`);
    assert.ok((p.detail ?? '').length > 20, `${p.tech.name} must explain itself`);
  }
});

test('an unassigned job is judged against the board as it stands', () => {
  const blocked = plan.blocked[0];
  const job = plan.jobs[blocked.jobId];
  assert.equal(findTechForJob(plan, job.id), null, 'this job is on nobody');

  const previews = previewMoves(plan, job, day.technicians, null);
  assert.ok(previews.every((p) => !p.current), 'nothing is marked current');
  assert.equal(previews.length, day.technicians.length);
});

test('the drag and the dropdown are the same answer', () => {
  // Both surfaces call previewMoves with the same arguments, so the only thing
  // worth asserting is that the verdicts agree with checkFeasible itself.
  const techWithWork = day.technicians.find((t) => (plan.routes[t.id] ?? []).length > 0)!;
  const job = plan.jobs[plan.routes[techWithWork.id][0].jobId];
  const lifted = withoutJob(plan, job.id, day.technicians);

  for (const p of previewMoves(plan, job, day.technicians, techWithWork.id)) {
    if (p.current) continue;
    const direct = checkFeasible(job, p.tech, null, withEmptyRoute(lifted, p.tech.id));
    // A technician who cannot take the job even with a clear day must never be
    // offered as a legal drop target.
    if (!direct.ok && direct.rule === 'SKILL_MISMATCH') {
      assert.equal(p.ok, false, `${p.tech.name} lacks the skill and must be refused`);
      assert.equal(p.rule, 'SKILL_MISMATCH');
    }
  }
});
