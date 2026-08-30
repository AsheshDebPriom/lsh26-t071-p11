import assert from 'node:assert/strict';
import test from 'node:test';

import { CASES, PUBLISHED_CASES } from './cases';
import {
  answer,
  findArea,
  findDuration,
  findJob,
  findSkill,
  findTechnicians,
  findTime,
  parseCommand,
  type Command,
  type ConsoleContext,
} from './console';
import { solveCase } from './solver';

/**
 * The console is a parser, so the risk is not that it crashes — it is that it
 * quietly understands the wrong thing and moves the wrong job. These tests
 * pin the grammar down, and check that it refuses to guess when it should.
 */

const day = PUBLISHED_CASES[0];
const { plan } = solveCase(day);
const ctx: ConsoleContext = { day, plan, caseIds: CASES.map((c) => c.id) };
const noPlan: ConsoleContext = { ...ctx, plan: null };

const parse = (text: string, c: ConsoleContext = ctx) => parseCommand(text, c);

// ---- Entity resolution --------------------------------------------------

test('a job is found however it is written', () => {
  const wanted = day.jobs.find((j) => j.code === 'J-13')!;
  for (const text of ['J-13', 'j13', 'job 13', 'move J 13 somewhere', 'why is j-13 blocked']) {
    const found = findJob(text, day);
    assert.equal(found.length, 1, `"${text}" should find exactly one job`);
    assert.equal(found[0].id, wanted.id, `"${text}" should find ${wanted.code}`);
  }
});

test('a job number that this case does not have is not invented', () => {
  assert.deepEqual(findJob('J-99', day), []);
});

test('a technician is found by name or id, and not inside another word', () => {
  const tech = day.technicians[0];
  assert.deepEqual(findTechnicians(tech.name, day).map((t) => t.id), [tech.id]);
  assert.deepEqual(findTechnicians(tech.id, day).map((t) => t.id), [tech.id]);
  assert.deepEqual(
    findTechnicians(tech.name.toUpperCase(), day).map((t) => t.id),
    [tech.id],
    'matching is case-insensitive',
  );
  // A name embedded in a longer word is not that technician.
  assert.deepEqual(findTechnicians(`${tech.name}ing`, day), []);
});

test('times are read in the forms people type them', () => {
  assert.equal(findTime('at 14:00'), 14 * 60);
  assert.equal(findTime('at 2pm'), 14 * 60);
  assert.equal(findTime('at 2 PM'), 14 * 60);
  assert.equal(findTime('at 9am'), 9 * 60);
  assert.equal(findTime('at 12am'), 0);
  assert.equal(findTime('no time here'), null);
});

test('durations are read in the forms people type them', () => {
  assert.equal(findDuration('for 45 min'), 45);
  assert.equal(findDuration('for 45 minutes'), 45);
  assert.equal(findDuration('for 2h'), 120);
  assert.equal(findDuration('1h 30m'), 90);
  assert.equal(findDuration('no duration'), null);
});

test('areas and skills are matched against this case only', () => {
  assert.equal(findArea(`something in ${day.areas[0]}`, day), day.areas[0]);
  assert.equal(findArea('something in Paris', day), null);

  const skill = day.jobs[0].skill;
  assert.equal(findSkill(`a ${skill} job`, day), skill);
});

// ---- Intents ------------------------------------------------------------

test('the plain commands parse', () => {
  const cases: [string, Command['kind']][] = [
    ['help', 'help'],
    ['what can you do?', 'help'],
    ['solve', 'solve'],
    ['re-solve the day', 'solve'],
    ['clear', 'clear'],
    ['restore', 'restore'],
    ['show the map', 'view'],
    ['summary', 'summary'],
    ["what can't be done?", 'listBlocked'],
    ['who is busiest?', 'busiest'],
  ];
  for (const [text, kind] of cases) {
    assert.equal(parse(text).kind, kind, `"${text}" should parse as ${kind}`);
  }
});

test('a move names both the job and the technician', () => {
  const tech = day.technicians[2];
  const cmd = parse(`move J-05 to ${tech.name}`);
  assert.equal(cmd.kind, 'move');
  if (cmd.kind !== 'move') return;
  assert.equal(cmd.techId, tech.id);
  assert.equal(plan.jobs[cmd.jobId].code, 'J-05');
});

test('"give J-07 to Rafiq" and "send J-07 to Rafiq" mean the same thing', () => {
  const tech = day.technicians.find((t) => t.name === 'Rafiq') ?? day.technicians[0];
  for (const verb of ['give', 'send', 'assign', 'put', 'move']) {
    const cmd = parse(`${verb} J-07 to ${tech.name}`);
    assert.equal(cmd.kind, 'move', `"${verb}" should be a move`);
  }
});

test('a technician calling in sick parses', () => {
  const tech = day.technicians[1];
  for (const text of [`${tech.name} is sick`, `${tech.name} called in ill`, `${tech.name} is off sick`]) {
    const cmd = parse(text);
    assert.equal(cmd.kind, 'sick', `"${text}" should be a sick call`);
    if (cmd.kind === 'sick') assert.equal(cmd.techId, tech.id);
  }
});

test('an emergency carries the area, skill, duration and time it was given', () => {
  const area = day.areas[0];
  const skill = day.jobs[0].skill;
  const cmd = parse(`emergency ${skill} in ${area} at 2pm for 45 min`);
  assert.equal(cmd.kind, 'emergency');
  if (cmd.kind !== 'emergency') return;
  assert.equal(cmd.job.area, area);
  assert.equal(cmd.job.skill, skill);
  assert.equal(cmd.job.durationMin, 45);
  assert.equal(cmd.at, 14 * 60);
  assert.ok(cmd.job.windowStart >= cmd.at, 'the window opens no earlier than now');
});

test('questions about a job are questions, not commands', () => {
  assert.equal(parse('why is J-21 blocked?').kind, 'explain');
  assert.equal(parse("why can't J-21 be done?").kind, 'explain');
  assert.equal(parse('who can take J-05?').kind, 'whoCanTake');
  assert.equal(parse('tell me about J-05').kind, 'describeJob');
});

test('taking a job off the board parses as unassign, not as a move', () => {
  for (const text of ['unassign J-09', 'remove J-09', 'take J-09 off the board']) {
    assert.equal(parse(text).kind, 'unassign', `"${text}" should unassign`);
  }
});

// ---- Refusing to guess --------------------------------------------------

test('it asks rather than picking a technician for you', () => {
  const cmd = parse('move J-05');
  assert.equal(cmd.kind, 'ambiguous');
  if (cmd.kind === 'ambiguous') assert.match(cmd.question, /which technician/i);
});

test('it asks when two technicians are named', () => {
  const [a, b] = day.technicians;
  const cmd = parse(`move J-05 to ${a.name} or ${b.name}`);
  assert.equal(cmd.kind, 'ambiguous');
  if (cmd.kind === 'ambiguous') {
    assert.ok(cmd.question.includes(a.name) && cmd.question.includes(b.name));
  }
});

test('it asks when an emergency is missing what it needs', () => {
  const cmd = parse('emergency at 2pm');
  assert.equal(cmd.kind, 'ambiguous');
  if (cmd.kind === 'ambiguous') assert.match(cmd.question, /area/i);
});

test('nonsense is reported as nonsense, never acted on', () => {
  const cmd = parse('make me a sandwich');
  assert.equal(cmd.kind, 'unknown');
  const reply = answer(cmd, ctx);
  assert.equal(reply?.tone, 'warn');
  assert.match(reply!.text, /did not understand/i);
});

test('no input at all is not a command', () => {
  assert.equal(parse('   ').kind, 'unknown');
});

// ---- Answers ------------------------------------------------------------

test('a question needing a plan says so when there is none', () => {
  for (const text of ["what can't be done?", 'who is busiest?']) {
    const reply = answer(parse(text, noPlan), noPlan);
    assert.equal(reply?.tone, 'warn');
    assert.match(reply!.text, /no plan yet/i);
  }
});

test('the blocked list answer names every blocked job and its rule', () => {
  const reply = answer(parse("what can't be done?"), ctx);
  assert.ok(reply);
  for (const b of plan.blocked) {
    assert.ok(reply!.text.includes(plan.jobs[b.jobId].code), `mentions ${b.jobId}`);
    assert.ok(reply!.text.includes(b.rule), `names ${b.rule}`);
  }
});

test('explaining a blocked job quotes the same rule and detail the panel shows', () => {
  const blocked = plan.blocked[0];
  const job = plan.jobs[blocked.jobId];
  const reply = answer(parse(`why is ${job.code} blocked?`), ctx);
  assert.ok(reply);
  assert.ok(reply!.text.includes(blocked.rule));
  assert.ok(reply!.text.includes(blocked.detail));
});

test('"who can take" agrees with the move preview', () => {
  const blocked = plan.blocked[0];
  const job = plan.jobs[blocked.jobId];
  const reply = answer(parse(`who can take ${job.code}?`), ctx);
  assert.ok(reply);
  // Nothing may take a blocked job, and the answer must say why, not just no.
  assert.match(reply!.text, /nobody can take/i);
  assert.match(reply!.text, /×/);
});

test('the summary counts what the board counts', () => {
  const reply = answer(parse('summary'), ctx);
  const assigned = day.technicians.reduce((n, t) => n + (plan.routes[t.id] ?? []).length, 0);
  assert.ok(reply!.text.includes(`${assigned} of ${day.jobs.length}`));
  assert.ok(reply!.text.includes(`${plan.blocked.length} blocked`));
});

test('help lists commands that actually parse', () => {
  const reply = answer({ kind: 'help' }, ctx);
  assert.ok(reply);
  // Pull the quoted examples out of the help text and check each one is understood.
  const quoted = [...reply!.text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(quoted.length >= 8, 'help should offer a real set of examples');
  for (const example of quoted) {
    const kind = parse(example).kind;
    assert.ok(
      kind !== 'unknown',
      `help offers "${example}" but the parser does not understand it`,
    );
  }
});
