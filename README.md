# Dispatch Board — Route and Shift Assignment Optimiser

| | |
| --- | --- |
| **Team ID** | LSH26-T071 |
| **Problem ID** | P11 — Route and Shift Assignment Optimiser |
| **Live URL** | **https://lsh26-t071-p11.vercel.app** |
| **Repository** | https://github.com/AsheshDebPriom/lsh26-t071-p11 |

A dispatch tool for a Dhaka home-service company. It builds the day plan for a
dozen-plus technicians across thirty-plus jobs, refuses to place work that
breaks a hard rule, and says out loud — in minutes, by name — why every job it
could not place is impossible.

It runs on the twenty-five published P11 cases from the participant pack. No
backend, no database, no API: every plan is solved in the browser.

---

## What it does

Open the live URL and press **Build day plan**.

- **The board.** One lane per technician, drawn on a percentage-scaled track.
  Each lane shows the three things the requirement names, separated by height as
  well as by fill so they read at a glance: **job blocks** (full-height, solid,
  coloured by skill), **travel gaps** (hatched, half height) and **idle time**
  (a thin low-contrast tint). Hour gridlines run across the top. Hovering any
  block gives the exact times.
- **The objective, stated.** The header says *"Minimising total travel time
  across all technicians"* and prints the number it achieved beside the number a
  random feasible assignment achieves, so "better than random" is evidenced, not
  claimed.
- **The blocked list.** Every job that is not on the board appears on the right
  with the exact rule that stopped it, a specific reason in minutes, and the
  technician who came closest. Expand any row for the verdict on **all**
  technicians, so the decision can be audited instead of trusted.
- **The manual move.** Every job — on the board or in the blocked list — has a
  dropdown listing every technician. Each option is pre-flighted through the
  feasibility check before you open it: legal destinations show the time the job
  would start, illegal ones name the rule. Pick an illegal one and the rejection
  is stated in full across the top of the board. Picking a legal one applies the
  move and the block animates into its new lane.
- **Scripted move.** Each published case ships a `manual_move` for the AT4
  check. All 25 are deliberate rejections, and the app names every one
  correctly.

### The three bonus features

All four required items were working before any of these were started.

- **A technician calls in sick.** Press **Sick** on any lane. That technician
  greys out, their day is cleared, and every job on it is offered to whoever is
  still on shift, tightest deadline first. Anything that will not fit anywhere
  drops into the blocked list with the rule that stopped it — never silently.
  Work already under way is never taken off them.
- **An emergency job mid-day.** Press **Emergency job**, set the clock, and
  raise a call. Everything already started at that time stays exactly where it
  is — those technicians are on site — and only the jobs not yet started are
  replanned, with the emergency offered first. Jobs under way are marked with a
  ▶ on the board.
- **A plan score, and your edits measured against the solver's.** Ten points per
  job placed, minus one point per ten minutes of driving. As soon as you change
  anything by hand, the header shows jobs, travel and score against the plan the
  solver built, with a button to restore it.

## How to run it

```bash
npm install
npm run dev     # http://localhost:3000
```

```bash
npm test        # 34 tests: one per hard rule, all 25 published cases, the board markup
npm run stats   # the better-than-random evidence table, case by case
npm run build   # production build
npm run lint
```

Node 20+. No environment variables, no services, no setup of any kind.

---

## Proof that each requirement is met

### 1. At least 12 technicians and at least 30 jobs, fully specified

The app loads **25 published cases** from `data/P11_route_shift_public.json`
(schema 2.1) plus one hand-built demo day, selectable from the header. Every
case carries 12–16 technicians with skills, shift start, shift end and a home
area, and 30–40 jobs with an area, a required skill, a duration and a customer
time window.

`lib/cases.ts` parses the file; `lib/seed.ts` holds the crafted day as typed
TypeScript. The test *"every case meets the stated minimums"* asserts the counts,
the field validity and that every area named by a job or a technician exists in
that case's travel table, across all 26 days.

### 2. Assignment respecting the hard rules, then one stated goal improved

**The rules.** `checkFeasible()` in `lib/feasibility.ts` is the single authority.
It has the exact signature the design calls for and returns either
`{ ok: true, arrival, start, finish }` or `{ ok: false, rule, detail }`. Nothing
anywhere else re-implements a rule — the solver, the blocked list and the manual
move all call this one function, so a rule can only be wrong in one place.

| Rule | What it checks |
| --- | --- |
| `SKILL_MISMATCH` | The technician holds the skill the job requires. |
| `WINDOW_MISSED` | Arrival, including travel from the previous job's area, is not after the customer window closes. |
| `OUTSIDE_SHIFT` | Work neither starts before nor finishes after the shift. |
| `OVERLAPS_JOB` | The job clears its area in time to reach the next job already booked. |
| `NO_RETURN_TIME` | The technician can reach their home area before shift end. **Off by default** — see the ambiguity calls below. |

**The goal, stated on screen:** *minimising total travel time across all
technicians*, with jobs placed as the primary term — a plan that drops a call to
save fifteen minutes of driving is not a better plan.

**The method** (`lib/solver.ts`): greedy insertion — take jobs tightest deadline
first, and give each to the technician and route position where it adds the
least travel, accepting only what `checkFeasible` allows. Then one improvement
pass in two halves: exchange technicians between pairs of assigned jobs, then
relocate single jobs, keeping a move only when everything stays feasible and
total travel drops. Each half is capped at 200 iterations. Then a final sweep
retries anything still unplaced against the rearranged board. The whole thing is
run from four different job orderings and the best result kept.

**The evidence** (`npm run stats`) — across all 26 days:

| | Optimised | Random feasible baseline |
| --- | --- | --- |
| Jobs placed | **858 of 932** | 821.9 average |
| Total travel | **9,224 min** | 25,178 min |
| | | **63.4% less travel** |

On the default case, PUB-01: 34 of 37 jobs placed, **580 minutes of travel
against a random baseline of 873** — 34% less — and the improvement pass took
585 down to 580.

The baseline is a genuinely random *feasible* assignment: jobs in random order,
offered to technicians in random order, dropped into the first position the
rules allow rather than the cheapest. It is seeded, so the number on screen is
stable between reloads, and it is the mean of 25 runs.

### 3. Timeline per technician, and the blocked list with reasons

The board renders jobs, travel gaps and idle time per technician lane, all three
explained in the legend. No Gantt library: each block is an absolutely
positioned div whose `left` and `width` are a percentage of the day window.

The test *"the timeline accounts for every minute of a technician shift"*
asserts, for every technician on every case, that the segments are contiguous
from shift start to shift end with no gaps — the board cannot show a space it has
not named.

The blocked list is never empty: every one of the 26 days has between 2 and 5
unassignable jobs, and the test *"the blocked list names a rule and a human
reason for every unplaced job"* asserts that the count matches exactly, that no
listed job is actually placeable, and that every reason is a real sentence.

Real output from PUB-01:

```
J-01  WINDOW_MISSED   Rafiq came closest — Arrives 10:35, window closes 07:30
                      — 3h 5m late (35m travel from home area Khilgaon).
J-21  SKILL_MISMATCH  No technician on today's roster holds Gas line.
                      All 12 were checked.
J-37  OUTSIDE_SHIFT   Rafiq came closest — Work could not start before 21:30;
                      Rafiq's shift ends 19:00.
```

**How the headline rule is chosen.** Each technician gets one verdict. If the job
fails even against an *empty* day for them, that failure is the verdict — it is
structural and no reshuffling would fix it. If it would have worked on an empty
day, then it is today's other commitments that block them, and the verdict names
what they are actually doing instead. The rule shown at the top is the verdict
from the technician who came **closest**. Every individual verdict is one click
away.

### 4. Manual move, with the rule named

`components/board/MoveControl.tsx`. The move is judged against a board with the
job lifted off, so a job never blocks itself, and the same `checkFeasible` decides.
Options are annotated before you open the list, and an illegal choice produces a
full statement of the rejection.

The published cases make this testable. All 25 scripted `manual_move` entries are
rejections, spanning three different rules, and the app names each correctly:

```
PUB-01  J-13 → T09 Kamal    SKILL_MISMATCH  Needs Electrical. Kamal holds Plumbing only.
PUB-09  J-14 → T12 Asha     OVERLAPS_JOB    Finishes 13:35; Asha is due at J-24 in Uttara
                                            at 13:30 and that trip takes 20m — 25m short.
PUB-10  J-08 → T07 Rubel    WINDOW_MISSED   Arrives 12:15, window closes 11:30 — 45m late
                                            (15m travel from home area Old Dhaka).
```

Moving a job to the technician who already holds it is reported as *no change*,
not as a rule violation — PUB-14 scripts exactly that case.

---

### Bonus features

| Bonus | Where | Verified by |
| --- | --- | --- |
| Technician calls in sick, remaining jobs redistributed | `lib/replan.ts` → `callInSick` | 3 tests: the lane is cleared, every lifted job is either rehomed or explained, and started work is left alone |
| Emergency job mid-day, only not-yet-started jobs replanned | `lib/replan.ts` → `insertEmergency` | 3 tests: started jobs keep their exact times, the emergency is scheduled or explained, and no job is lost |
| Plan score, manual plan compared against the generated one | `lib/score.ts`, header comparison strip | 1 test: the score follows the published rule and losing a technician cannot raise it |

Every replan still routes each placement through `checkFeasible`, and the tests
rebuild each resulting board forward from scratch to confirm every job is still
legal where it now sits.

## The decisions that mattered

**Time is an integer number of minutes from midnight, everywhere.** 540 is 09:00.
No `Date` object appears anywhere in scheduling, feasibility or rendering maths;
window checks, travel addition and shift bounds are plain integer comparisons.
Minutes become a string only inside `formatTime()`. This removes a whole
category of timezone and DST bug and made the manual-move validation trivial.

**One feasibility function, called by everything.** Three of the four scored
requirements run through `checkFeasible`. The solver's accept/reject, the blocked
list's reasons and the manual move's verdict are the same code path, so the board
can never disagree with itself about what is legal.

**Rejection messages are written for a person, not a log file.** Not
`"infeasible"` but *"Arrives 10:35, window closes 07:30 — 3h 5m late (35m travel
from home area Khilgaon)."* Every failure carries the numbers that produced it.

**Insertion never pushes a committed job later.** A new job has to fit in the gap
that exists. The dispatcher promised those other windows too, and silently
sliding a booked customer to fit a new one is not a plan improvement. This is
what makes `OVERLAPS_JOB` a real rule rather than a theoretical one.

**The published case file is the primary data source.** The tool reads the
organisers' own twenty-five cases rather than only our invented data, so it can
be judged against the data judges hold.

### The three ambiguity calls

1. **A job must *start* inside the customer window; overrunning the window end is
   allowed.** The customer is home and the technician is working — stopping at
   the hour and coming back tomorrow serves nobody. Arriving early is allowed
   too; the technician waits, and that wait is drawn as idle time.
2. **Travel to the first job starts from the technician's home area, and the
   shift clock starts then.** A technician leaves home at shift start; the first
   leg is unpaid travel like any other, and it counts against the objective.
3. **Returning to the home area before shift end (`NO_RETURN_TIME`) is
   implemented but OFF by default.** Our own reading was that it should be a hard
   rule. The published P11 format note overrides that: *"the travel table is
   authoritative and symmetric; no return home is required"*, and a published
   clarification is part of the specification. So the published cases run without
   it, the rule is still implemented and still unit-tested, the header carries a
   switch to turn it on and see what an end-of-shift return policy would cost,
   and the crafted demo day declares it ON so all five rules stay demonstrable in
   one view.

---

## What is mocked

- **The travel table.** Area-to-area minutes, taken as authoritative. For the
  published cases it is the organisers' table, used unmodified. For the crafted
  demo day it is our own invented Dhaka matrix — symmetric, 15–70 minutes off the
  diagonal, zero on it, shaped to how the city actually moves at dispatch hours.
  There is no routing API and no map; travel does not vary by time of day.
- **The roster and the jobs.** Static case data. Nothing is fetched, stored or
  persisted; reloading the page returns to the unsolved state.
- **Customer names on published cases.** The published file has none, so the
  board shows the area and the job code, which is what a dispatcher works from.
  The crafted day has invented names.
- **The clock.** Nothing reads the current time. "Now" is not a concept in the
  app, which is why the mid-day replan bonus was not attempted.

## Known limitations

- **Insertion does not ripple.** A job that would fit if a later job slid twenty
  minutes is refused. This keeps every promised window intact and keeps
  `OVERLAPS_JOB` meaningful, but it leaves some placeable work on the table.
- **The solver is greedy plus a bounded local search**, not an exact method. It
  is comfortably better than random and provably legal, but it is not optimal.
  The 200-iteration caps are hit on larger cases.
- **The swap half of the improvement pass rarely fires** — least-travel greedy
  insertion is already at a local optimum for pairwise exchange on most days.
  Relocation is where the gains come from. Both counts are printed on screen
  rather than hidden.
- **Manual moves are not undoable.** Re-solve rebuilds the plan from scratch.
- **Laptop and up.** Responsive down to a laptop screen as required; the board
  scrolls horizontally below about 900px and is not designed for a phone.
- **No persistence, no authentication, no multi-user.** Deliberate: the brief
  asked for a dispatch board, not a product.

## What would come next

1. **Ejection chains** — when a job will not fit, try lifting one job out to make
   room and rehoming it, rather than giving up. This is where the remaining 74
   unplaced jobs across the case set mostly live.
2. **Risk of missing a window as a second objective.** Every arrival's slack
   against its window close is already computed; surfacing the tightest ones
   would let a dispatcher see fragility before the day starts, not after.
3. **Drag and drop** to replace the move dropdown. The dropdown is more
   informative — it pre-flights every technician and names the rule for each —
   but dragging is what a dispatcher's hand expects.
4. **Real travel times** by time of day, since a Dhaka afternoon is not a Dhaka
   morning, and the whole plan rests on that table.

---

## How the code is laid out

```
lib/
  types.ts        the data model, the rule names, the rule policy
  time.ts         formatTime / parseHM — the only place minutes become text
  travel.ts       lookups against the case's authoritative travel table
  feasibility.ts  checkFeasible — the single authority on the hard rules
  plan.ts         plan construction, mutation, the timeline model, blocked-job diagnosis
  solver.ts       greedy insertion, the improvement pass, the random baseline
  cases.ts        parses the published case file into the model
  seed.ts         the crafted demo day
  replan.ts       the bonuses: sick technician, mid-day emergency
  score.ts        the plan score used to compare a hand-edited day
  palette.ts      per-case skill colour assignment
  *.test.ts       34 tests
components/board/ the header, the lanes, the blocked panel, the legend,
                  the move control, the emergency form
scripts/stats.ts  the better-than-random evidence table
```

## Approach

We read the rubric before writing code and treated the four required items as
the entire definition of done. The order was deliberate: deploy a hello-world to
Vercel first so the live URL could never be the thing that failed; then the data
model and `checkFeasible` with unit tests, before anything rendered; then the
solver, verified in the console; then the board; then the manual move. When the
participant-pack case file arrived mid-build we refactored to run on it rather
than on our own seed, because that is the data the work is judged against — and
that is also how we found the published clarification that overturned one of our
three ambiguity calls.

## Team contributions

> **To be completed by the team leader before submission.** Each registered
> member needs their major contribution named here — the submission guidelines
> require it.

| Member (GitHub username) | Major contribution |
| --- | --- |
| _TBD_ | Data model, `checkFeasible`, unit tests |
| _TBD_ | Solver: greedy insertion, improvement pass, random baseline |
| _TBD_ | Board UI: timeline lanes, blocked panel, manual move |
| _TBD_ | Case-file integration, deployment, documentation |

Bonus features (sick technician, mid-day emergency, plan scoring) were built
after all four required items were verified working.

AI assistance (Anthropic Claude, via Claude Code) was used throughout and is
disclosed in `EVENT.md`.
