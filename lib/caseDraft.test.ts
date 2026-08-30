import assert from 'node:assert/strict';
import test from 'node:test';

import { blankCaseTemplate, parseCaseFile, toRawCase } from './caseFile';
import {
  addArea, addJob, addTechnician, draftGaps, emptyDraft, nextJobId, nextTechnicianId,
  normaliseTravel, removeArea, removeJob, removeTechnician, renameArea, setTravel,
  skillsInDraft, updateJob, updateTechnician,
} from './caseDraft';
import { PUBLISHED_CASES } from './cases';

/**
 * The form exists so nobody has to keep a travel table symmetric by hand. These
 * tests are that promise: whatever you do in the builder, the case that comes
 * out is one the validator accepts.
 */

function threeAreas() {
  let d = emptyDraft('2026-08-30');
  for (const a of ['Gulshan', 'Motijheel', 'Mirpur']) d = addArea(d, a);
  return d;
}

test('an empty draft is empty, not broken', () => {
  const d = emptyDraft();
  assert.deepEqual(d.areas, []);
  assert.deepEqual(d.technicians, []);
  assert.deepEqual(d.jobs, []);
  assert.ok(draftGaps(d).length >= 3, 'and it says what is missing');
});

test('adding an area fills in its whole row and column', () => {
  const d = threeAreas();
  assert.deepEqual(d.areas, ['Gulshan', 'Motijheel', 'Mirpur']);
  for (const a of d.areas) {
    for (const b of d.areas) {
      assert.equal(typeof d.travel_minutes[a][b], 'number', `${a}→${b} must exist`);
      if (a === b) assert.equal(d.travel_minutes[a][b], 0, 'the diagonal is zero');
    }
  }
});

test('an area cannot be added twice or blank', () => {
  let d = threeAreas();
  const before = d.areas.length;
  d = addArea(d, 'Gulshan');
  d = addArea(d, '   ');
  assert.equal(d.areas.length, before);
});

test('setting one direction of a leg sets the other', () => {
  let d = threeAreas();
  d = setTravel(d, 'Gulshan', 'Mirpur', 35);
  assert.equal(d.travel_minutes.Gulshan.Mirpur, 35);
  assert.equal(d.travel_minutes.Mirpur.Gulshan, 35, 'the table must stay symmetric');

  // Typing the other side works the same way.
  d = setTravel(d, 'Mirpur', 'Gulshan', 40);
  assert.equal(d.travel_minutes.Gulshan.Mirpur, 40);
});

test('a leg from an area to itself is never set', () => {
  let d = threeAreas();
  d = setTravel(d, 'Gulshan', 'Gulshan', 25);
  assert.equal(d.travel_minutes.Gulshan.Gulshan, 0);
});

test('renaming an area follows it through the travel table, technicians and jobs', () => {
  let d = threeAreas();
  d = setTravel(d, 'Gulshan', 'Mirpur', 35);
  d = addTechnician(d, ['ac']);
  d = addJob(d, ['ac']);
  const techId = d.technicians[0].id;
  const jobId = d.jobs[0].id;
  d = updateTechnician(d, techId, { home_area: 'Gulshan' });
  d = updateJob(d, jobId, { area: 'Gulshan' });

  d = renameArea(d, 'Gulshan', 'Banani');

  assert.ok(d.areas.includes('Banani') && !d.areas.includes('Gulshan'));
  assert.equal(d.travel_minutes.Banani.Mirpur, 35, 'the leg came with it');
  assert.equal(d.travel_minutes.Mirpur.Banani, 35);
  assert.equal(d.travel_minutes.Banani.Banani, 0);
  assert.equal(d.technicians[0].home_area, 'Banani', 'the technician moved with it');
  assert.equal(d.jobs[0].area, 'Banani', 'so did the job');
});

test('renaming to a name already in use does nothing', () => {
  const d = threeAreas();
  assert.deepEqual(renameArea(d, 'Gulshan', 'Mirpur').areas, d.areas);
  assert.deepEqual(renameArea(d, 'Gulshan', '  ').areas, d.areas);
});

test('removing an area moves anyone standing in it somewhere real', () => {
  let d = threeAreas();
  d = addTechnician(d, ['ac']);
  d = addJob(d, ['ac']);
  d = updateTechnician(d, d.technicians[0].id, { home_area: 'Mirpur' });
  d = updateJob(d, d.jobs[0].id, { area: 'Mirpur' });

  d = removeArea(d, 'Mirpur');

  assert.ok(!d.areas.includes('Mirpur'));
  assert.ok(d.areas.includes(d.technicians[0].home_area), 'the technician lives somewhere that exists');
  assert.ok(d.areas.includes(d.jobs[0].area), 'and the job happens somewhere that exists');
  for (const a of d.areas) {
    assert.equal(d.travel_minutes[a].Mirpur, undefined, 'the column went too');
  }
});

test('ids are handed out without collisions, and reused once freed', () => {
  let d = threeAreas();
  d = addTechnician(d, ['ac']);
  d = addTechnician(d, ['ac']);
  assert.deepEqual(d.technicians.map((t) => t.id), ['T01', 'T02']);
  assert.equal(nextTechnicianId(d), 'T03');

  d = removeTechnician(d, 'T01');
  assert.equal(nextTechnicianId(d), 'T01', 'a freed id comes back');

  d = addJob(d, ['ac']);
  assert.equal(d.jobs[0].id, 'J01');
  assert.equal(nextJobId(d), 'J02');
});

test('removing a technician or job drops a scripted move that pointed at it', () => {
  let d = threeAreas();
  d = addTechnician(d, ['ac']);
  d = addJob(d, ['ac']);
  d = { ...d, manual_move: { job_id: d.jobs[0].id, to_technician: d.technicians[0].id } };

  assert.equal(removeTechnician(d, d.technicians[0].id).manual_move, undefined);
  assert.equal(removeJob(d, d.jobs[0].id).manual_move, undefined);
});

test('normalising fills every gap and zeroes the diagonal', () => {
  let d = threeAreas();
  // Break it the way hand-editing would.
  d = { ...d, travel_minutes: { ...d.travel_minutes, Gulshan: { Gulshan: 9, Motijheel: 20 } } };
  d = normaliseTravel(d);

  assert.equal(d.travel_minutes.Gulshan.Gulshan, 0);
  for (const a of d.areas) {
    for (const b of d.areas) {
      assert.equal(typeof d.travel_minutes[a][b], 'number', `${a}→${b}`);
    }
  }
  assert.equal(d.travel_minutes.Gulshan.Mirpur, d.travel_minutes.Mirpur.Gulshan, 'symmetric again');
});

test('skills offered always include the four the format uses, plus any invented', () => {
  let d = threeAreas();
  d = addTechnician(d, ['ac']);
  d = updateTechnician(d, d.technicians[0].id, { skills: ['refrigeration'] });
  const skills = skillsInDraft(d);
  for (const s of ['ac', 'plumbing', 'electrical', 'gas_line', 'refrigeration']) {
    assert.ok(skills.includes(s), `should offer ${s}`);
  }
});

// ---- The promise: whatever the form produces, the validator accepts ------

test('a day built through the form passes the validator', () => {
  let d = threeAreas();
  d = setTravel(d, 'Gulshan', 'Motijheel', 45);
  d = setTravel(d, 'Gulshan', 'Mirpur', 35);
  d = setTravel(d, 'Motijheel', 'Mirpur', 60);

  d = addTechnician(d, ['ac', 'plumbing']);
  d = updateTechnician(d, 'T01', { name: 'Rafiq', skills: ['ac'], home_area: 'Gulshan' });
  d = addTechnician(d, ['plumbing']);
  d = updateTechnician(d, 'T02', { name: 'Sumon', skills: ['plumbing'], home_area: 'Motijheel' });

  d = addJob(d, ['ac']);
  d = updateJob(d, 'J01', { area: 'Mirpur', skill: 'ac' });
  d = addJob(d, ['plumbing']);
  d = updateJob(d, 'J02', { area: 'Motijheel', skill: 'plumbing' });

  const result = parseCaseFile(JSON.stringify(normaliseTravel(d)));
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
});

test('a real published case can be pulled into the form and put back unchanged', () => {
  const original = toRawCase(PUBLISHED_CASES[0]);
  // The builder round-trips through a deep copy, exactly as the UI does.
  const draft = normaliseTravel(JSON.parse(JSON.stringify(original)));

  const result = parseCaseFile(JSON.stringify(draft));
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
  assert.equal(draft.technicians.length, original.technicians.length);
  assert.equal(draft.jobs.length, original.jobs.length);
  for (const a of original.areas) {
    for (const b of original.areas) {
      assert.equal(draft.travel_minutes[a][b], original.travel_minutes[a][b], `${a}→${b} unchanged`);
    }
  }
});

test('the example the builder starts from is itself valid', () => {
  const example = JSON.parse(blankCaseTemplate()).cases[0];
  const result = parseCaseFile(JSON.stringify(example));
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
});

test('gaps are reported while the form is still half filled', () => {
  let d = emptyDraft();
  assert.ok(draftGaps(d).some((g) => /two areas/.test(g)));
  d = threeAreas();
  assert.ok(draftGaps(d).some((g) => /one technician/.test(g)));
  d = addTechnician(d, ['ac']);
  assert.ok(draftGaps(d).some((g) => /one job/.test(g)));

  // A job nobody can do is flagged as a choice, not an error.
  d = addJob(d, ['gas_line']);
  d = updateJob(d, 'J01', { skill: 'gas_line' });
  d = updateTechnician(d, 'T01', { skills: ['ac'] });
  assert.ok(draftGaps(d).some((g) => /Nobody holds gas_line/.test(g)));
});
