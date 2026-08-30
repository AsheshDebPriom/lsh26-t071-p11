import assert from 'node:assert/strict';
import test from 'node:test';

import { blankCaseTemplate, parseCaseFile, serialiseCases, toRawCase } from './caseFile';
import { caseFromRaw, PUBLISHED_CASES } from './cases';
import { CRAFTED_DAY } from './seed';
import { solveCase } from './solver';
import { assertMatrixIsSane } from './travel';

/**
 * Anyone can write their own day, so the validator is the only thing standing
 * between a hand-edited file and a board full of nonsense. It has to catch
 * every kind of mistake, report them all at once, and never let a half-valid
 * case through.
 */

const day = PUBLISHED_CASES[0];

/** A known-good case object, which each test then breaks in one specific way. */
function good(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(toRawCase(day)));
}

function errorsFor(mutate: (c: Record<string, unknown>) => void): string[] {
  const c = good();
  mutate(c);
  const result = parseCaseFile(JSON.stringify(c));
  return result.ok ? [] : result.errors;
}

// ---- Round trip ---------------------------------------------------------

test('a published case survives being written out and read back', () => {
  const text = serialiseCases([day]);
  const result = parseCaseFile(text);
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
  if (!result.ok) return;

  const back = caseFromRaw(result.cases[0], 'imported');
  assert.equal(back.technicians.length, day.technicians.length);
  assert.equal(back.jobs.length, day.jobs.length);
  assert.deepEqual(back.areas, day.areas);

  // Times survive the trip through HH:MM exactly.
  day.technicians.forEach((t, i) => {
    assert.equal(back.technicians[i].shiftStart, t.shiftStart, `${t.id} shift start`);
    assert.equal(back.technicians[i].shiftEnd, t.shiftEnd, `${t.id} shift end`);
  });
  day.jobs.forEach((j, i) => {
    assert.equal(back.jobs[i].windowStart, j.windowStart, `${j.code} window start`);
    assert.equal(back.jobs[i].windowEnd, j.windowEnd, `${j.code} window end`);
    assert.equal(back.jobs[i].durationMin, j.durationMin, `${j.code} duration`);
  });
});

test('an exported case still solves to the same plan', () => {
  const result = parseCaseFile(serialiseCases([day]));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const original = solveCase(day);
  const reloaded = solveCase(caseFromRaw(result.cases[0], 'imported'));
  assert.equal(reloaded.stats.assigned, original.stats.assigned);
  assert.equal(reloaded.stats.totalTravelMin, original.stats.totalTravelMin);
  assert.equal(reloaded.plan.blocked.length, original.plan.blocked.length);
});

test('the crafted day exports and reloads too', () => {
  const result = parseCaseFile(serialiseCases([CRAFTED_DAY]));
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
});

test('the starter template is valid and solvable', () => {
  const result = parseCaseFile(blankCaseTemplate());
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
  if (!result.ok) return;

  const template = caseFromRaw(result.cases[0], 'imported');
  assertMatrixIsSane(template.travel, template.areas);
  const { plan } = solveCase(template);
  const placed = Object.values(plan.routes).reduce((n, r) => n + r.length, 0);
  assert.ok(placed > 0, 'the template should schedule something');
  // It deliberately includes a skill nobody holds, to show the blocked list.
  assert.ok(plan.blocked.length > 0, 'the template should demonstrate a blocked job');
});

// ---- Accepted shapes ----------------------------------------------------

test('a whole file, a bare array and a single case are all accepted', () => {
  const one = toRawCase(day);
  for (const text of [
    JSON.stringify({ schema_version: '2.1', problem_id: 'P11', cases: [one] }),
    JSON.stringify([one]),
    JSON.stringify(one),
  ]) {
    const result = parseCaseFile(text);
    assert.equal(result.ok, true, `should accept this shape: ${result.ok ? '' : result.errors[0]}`);
  }
});

// ---- Rejections ---------------------------------------------------------

test('text that is not JSON is refused kindly', () => {
  const result = parseCaseFile('{ not json');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors[0], /not valid JSON/i);
});

test('an empty or shapeless payload is refused', () => {
  for (const text of ['{}', '[]', '"hello"', '42']) {
    assert.equal(parseCaseFile(text).ok, false, `${text} should be refused`);
  }
});

test('a travel table that is not symmetric is caught, naming both directions', () => {
  const errors = errorsFor((c) => {
    const travel = c.travel_minutes as Record<string, Record<string, number>>;
    const [a, b] = c.areas as string[];
    travel[a][b] = travel[a][b] + 5;
  });
  assert.ok(errors.some((e) => /symmetric/i.test(e)), errors.join('\n'));
});

test('a non-zero diagonal is caught', () => {
  const errors = errorsFor((c) => {
    const travel = c.travel_minutes as Record<string, Record<string, number>>;
    const a = (c.areas as string[])[0];
    travel[a][a] = 7;
  });
  assert.ok(errors.some((e) => /must be 0/.test(e)), errors.join('\n'));
});

test('a missing travel entry is caught', () => {
  const errors = errorsFor((c) => {
    const travel = c.travel_minutes as Record<string, Record<string, number>>;
    const [a, b] = c.areas as string[];
    delete travel[a][b];
  });
  assert.ok(errors.some((e) => /missing, or not a number/.test(e)), errors.join('\n'));
});

test('an area nobody declared is caught, for technicians and for jobs', () => {
  const techErrors = errorsFor((c) => {
    (c.technicians as Record<string, unknown>[])[0].home_area = 'Atlantis';
  });
  assert.ok(techErrors.some((e) => /home_area/.test(e) && /Atlantis/.test(e)));

  const jobErrors = errorsFor((c) => {
    (c.jobs as Record<string, unknown>[])[0].area = 'Atlantis';
  });
  assert.ok(jobErrors.some((e) => /\.area/.test(e) && /Atlantis/.test(e)));
});

test('a badly written time is caught and shown back', () => {
  const errors = errorsFor((c) => {
    (c.technicians as Record<string, unknown>[])[0].shift_start = '9am';
  });
  assert.ok(errors.some((e) => /HH:MM/.test(e) && /9am/.test(e)), errors.join('\n'));
});

test('a shift that ends before it starts is caught', () => {
  const errors = errorsFor((c) => {
    const t = (c.technicians as Record<string, unknown>[])[0];
    t.shift_start = '18:00';
    t.shift_end = '09:00';
  });
  assert.ok(errors.some((e) => /must be after shift_start/.test(e)), errors.join('\n'));
});

test('a window that closes before it opens is caught', () => {
  const errors = errorsFor((c) => {
    const j = (c.jobs as Record<string, unknown>[])[0];
    j.window_start = '15:00';
    j.window_end = '09:00';
  });
  assert.ok(errors.some((e) => /closes before it opens/.test(e)), errors.join('\n'));
});

test('duplicate ids are caught for both technicians and jobs', () => {
  const techErrors = errorsFor((c) => {
    const techs = c.technicians as Record<string, unknown>[];
    techs[1].id = techs[0].id;
  });
  assert.ok(techErrors.some((e) => /duplicate id/.test(e)));

  const jobErrors = errorsFor((c) => {
    const jobs = c.jobs as Record<string, unknown>[];
    jobs[1].id = jobs[0].id;
  });
  assert.ok(jobErrors.some((e) => /duplicate id/.test(e)));
});

test('a zero or negative duration is caught', () => {
  for (const bad of [0, -30, 'sixty']) {
    const errors = errorsFor((c) => {
      (c.jobs as Record<string, unknown>[])[0].duration_minutes = bad;
    });
    assert.ok(errors.some((e) => /duration_minutes/.test(e)), `${bad} should be refused`);
  }
});

test('a scripted move naming something that does not exist is caught', () => {
  const errors = errorsFor((c) => {
    c.manual_move = { job_id: 'NOPE', to_technician: 'ALSO-NOPE' };
  });
  assert.ok(errors.some((e) => /manual_move\.job_id/.test(e)));
  assert.ok(errors.some((e) => /manual_move\.to_technician/.test(e)));
});

test('every problem is reported at once, not just the first', () => {
  const errors = errorsFor((c) => {
    (c.technicians as Record<string, unknown>[])[0].shift_start = 'nope';
    (c.technicians as Record<string, unknown>[])[1].home_area = 'Atlantis';
    (c.jobs as Record<string, unknown>[])[0].duration_minutes = -1;
    (c.jobs as Record<string, unknown>[])[1].window_end = '99:99';
  });
  assert.ok(errors.length >= 4, `expected at least four problems, got ${errors.length}`);
});

test('nothing is loaded when any case in the file is broken', () => {
  const bad = good();
  (bad.jobs as Record<string, unknown>[])[0].area = 'Atlantis';
  const result = parseCaseFile(
    JSON.stringify({ schema_version: '2.1', problem_id: 'P11', cases: [toRawCase(day), bad] }),
  );
  assert.equal(result.ok, false, 'one broken case fails the whole load');
});

// ---- Warnings, not errors ----------------------------------------------

test('a skill nobody holds is a warning, because that is how you demo a block', () => {
  const c = good();
  (c.jobs as Record<string, unknown>[])[0].skill = 'nobody_has_this';
  const result = parseCaseFile(JSON.stringify(c));
  assert.equal(result.ok, true, 'it must still load');
  if (!result.ok) return;
  assert.ok(
    result.warnings.some((w) => /nobody_has_this/.test(w) && /never be scheduled/.test(w)),
    result.warnings.join('\n'),
  );
});

test('a missing date warns rather than failing', () => {
  const c = good();
  delete c.today;
  const result = parseCaseFile(JSON.stringify(c));
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.warnings.some((w) => /today/.test(w)));
});
