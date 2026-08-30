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

It runs on the twenty-five published P11 cases from the participant pack. The
solver, the rules and the board are entirely client-side — every plan is
computed in your browser. Two optional services sit alongside: a Gemini
assistant behind a single server route, and Supabase for publishing a day you
wrote so others can open it. **Both are optional; the four scored requirements
work with neither.**

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
- **The map.** Switch to the map view for the real city: OpenStreetMap tiles,
  pan and zoom, with one route per technician drawn through their stops in
  order and animated in as the plan lands. It answers the question a Gantt chart
  cannot — is this technician working a neighbourhood, or crossing Dhaka twice?
  Areas are sized by how much work sits in them and pulse in the alarm colour
  when something there cannot be done. Hovering a lane on the timeline lights
  that route, and hovering a route highlights the lane.
- **The manual move — drag it.** Pick up any job, from a lane or from the
  blocked list, and drag it onto another technician. The moment you lift it,
  **every lane says whether it may land**: a green edge and the time the job
  would start, or a red edge and the name of the rule that stops it. You are
  told before you let go, not after. Drop it on the panel at the right to take
  it off the board entirely.
- **The manual move — or use the dropdown.** Every job also has a dropdown
  listing every technician with the same verdicts, which is the keyboard route
  and the one that survives a screenshot. Both surfaces call the same
  `previewMoves()`, so they can never disagree about what is legal.
- **Scripted move.** Each published case ships a `manual_move` for the AT4
  check. All 25 are deliberate rejections, and the app names every one
  correctly.

- **Ask the board.** Press `/` and type what you want: *"move J-13 to Kamal"*,
  *"Rafiq is sick"*, *"why is J-21 blocked?"*, *"who can take J-05?"*,
  *"emergency plumbing in Uttara at 2pm for 45 min"*, *"take J-09 off the
  board"*, *"what can't be done?"*, *"load PUB-07"*. It does the thing and tells
  you what happened, in the same sentences the board uses.

  The built-in grammar answers instantly and offline. Anything it does not
  recognise goes to **Gemini**, which reads the same day the board is showing
  and either answers or proposes one action — see
  [How the assistant works](#how-the-assistant-works).

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

## Using your own technicians and jobs

Press **Build a day…** in the header. You can:

- **Start from a template** — a small valid day you can edit in place.
- **Copy any case in to edit** — loads the day you are looking at into the
  editor so you can change names, shifts, areas or the travel table.
- **Download it as JSON**, edit it in your own editor, and open the file again.
- **Paste** a case straight in.

The format is exactly the one the participant pack ships (`schema_version`
2.1), so a day you write here would load into any other P11 implementation, and
theirs would load into this one. There is no private format.

Your days are validated hard before anything is loaded — every problem is
reported at once, with the field path — and they are kept in your browser, so
they survive a reload. **Forget my days** clears them.

```jsonc
{
  "case_id": "MY-DAY-01",
  "today": "2026-08-30",
  "areas": ["Gulshan", "Motijheel", "Mirpur"],
  "travel_minutes": {                      // symmetric, 0 on the diagonal
    "Gulshan":   { "Gulshan": 0,  "Motijheel": 45, "Mirpur": 35 },
    "Motijheel": { "Gulshan": 45, "Motijheel": 0,  "Mirpur": 60 },
    "Mirpur":    { "Gulshan": 35, "Motijheel": 60, "Mirpur": 0  }
  },
  "technicians": [
    { "id": "T01", "name": "Rafiq", "skills": ["ac", "plumbing"],
      "shift_start": "09:00", "shift_end": "18:00", "home_area": "Gulshan" }
  ],
  "jobs": [
    { "id": "J01", "area": "Mirpur", "skill": "ac",
      "duration_minutes": 60, "window_start": "10:00", "window_end": "13:00" }
  ],
  "manual_move": { "job_id": "J01", "to_technician": "T01" }  // optional
}
```

A job whose skill nobody on the roster holds is allowed on purpose — it is how
you make a job the plan *must* refuse. You get a warning, not an error.

To ship a day with the app rather than load it at runtime, add it to
`lib/seed.ts` the way `CRAFTED_DAY` is written and export it from `CASES` in
`lib/cases.ts`.

## How to run it

```bash
npm install
npm run dev     # http://localhost:3000
```

```bash
npm test        # 98 tests: one per hard rule, all 25 published cases, the board markup
npm run stats   # the better-than-random evidence table, case by case
npm run build   # production build
npm run lint
```

Node 20+, no services, no accounts. It runs with no configuration at all.

One **optional** environment variable: `NEXT_PUBLIC_CARTO_KEY` removes the
watermark CARTO puts on its free basemap tiles. Copy `.env.example` to
`.env.local` and paste a key from
[carto.com/basemaps/apikey](https://carto.com/basemaps/apikey). Without it the
map still loads and works, just watermarked — so a fresh clone needs nothing.

No key is committed to this repository, and none is required to run it.

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

Two surfaces, one answer. `lib/moves.ts` exposes `previewMoves()`, which asks
`checkFeasible` what would happen if a job went to each technician; the drag
layer (`@dnd-kit/core`) and the dropdown (`components/board/MoveControl.tsx`)
both render its result, so the board cannot offer a move it would then refuse.

The move is always judged against a board with the job lifted off, so a job
never blocks its own move. Dragging shows the verdict for every lane while the
job is still in the air; an illegal drop is refused with the rule stated in full
across the top of the board.

Three tests pin this down: every landing the preview calls legal survives a full
rebuild of that technician's day, every refusal names a rule and explains
itself, and a technician who lacks the skill is never offered as a drop target.

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

## How the assistant works

The console answers in two layers, and which one replied is labelled on screen.

**The built-in grammar goes first.** `lib/console.ts` knows the vocabulary this
problem actually has — a dozen verbs, today's technicians, today's jobs, its
areas and skills. It is instant, free, works offline, and is exactly right for
the phrasings it knows. It also refuses to guess: "move J-05" with nobody named
asks *which technician* rather than picking one.

**Anything it does not recognise goes to Gemini**, through `app/api/chat`. The
route sends the model a plain-English snapshot of the day — the roster, the
routes, the blocked jobs with their rules, the travel table — and the five hard
rules, and asks for a short answer plus optionally one command.

Three things make that safe rather than alarming:

1. **The key never reaches the browser.** `GEMINI_API_KEY` has no
   `NEXT_PUBLIC_` prefix and is read only by the server route. This is the whole
   reason the route exists — earlier versions of this app had no server at all,
   and a browser-side model call would have meant shipping a credential to every
   visitor.
2. **The model proposes; the board decides.** It may return one command from a
   fixed list. The browser re-checks every id against the actual day, rebuilds it
   as a typed `Command`, and runs it through the same handlers the buttons use —
   so it still passes `checkFeasible`. A hallucinated technician simply does not
   become an action, and the model cannot invent or bypass a rule.
3. **It is optional.** With no key configured the route says so and the console
   falls back to its own grammar. The live URL never depends on a third-party
   service being up.

What it gives up: without a key it will not answer open questions, and it holds
only the last few turns of context.

## Optional services

Neither is needed for the four scored requirements, and both are disabled by
simply not setting their variables. See `.env.example`.

| Service | What it adds | Without it |
| --- | --- | --- |
| **Gemini** | Free-form questions and instructions in the console | The built-in grammar still answers |
| **Supabase** | Publishing a day you wrote so anyone with the live URL can open it | Your days are kept in your own browser |
| **CARTO** | Removes the watermark from the map tiles | Tiles still load, watermarked |

### Supabase

One table, `shared_days`, created by `supabase/migrations/0001_shared_days.sql`.
It holds dispatch scenarios — technicians, jobs, areas, a travel table — and no
personal data of any kind.

Row-level security grants **select and insert to anyone, and deliberately not
update or delete**: a published day can be read and added to, but nobody holding
only the publishable key can alter or remove someone else's. Anything read back
goes through the same validator as a pasted file, because a row in a table is
not more trustworthy than a text box.

To set it up: run the migration in the Supabase SQL editor, then set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

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
  There is no routing API and travel does not vary by time of day.
- **The map's geography is real; its routes are not roads.** `lib/geo.ts` holds
  approximate centroids for the twelve areas, and the tiles are OpenStreetMap
  via CARTO. But a line between two areas is an arc, not a route: we have no
  road network, and the travel table supplied with the case remains the only
  authority on how long a leg takes. No coordinate in `lib/geo.ts` is ever used
  for arithmetic. The tiles are the one thing in the app that needs the network;
  if they fail, the routes and areas still draw and the map says so.
- **The roster and the jobs.** Static case data. Nothing is fetched, stored or
  persisted; reloading the page returns to the unsolved state.
- **Customer names on published cases.** The published file has none, so the
  board shows the area and the job code, which is what a dispatcher works from.
  The crafted day has invented names.
- **The clock.** Nothing reads the current time. "Now" is not a concept in the
  app, which is why the mid-day replan bonus was not attempted.

### Reading the board

Each technician's lane is a **shift rail** — a recessed track running from their
shift start to their shift end — with the day laid on top of it:

| | |
| --- | --- |
| **Job** | A raised solid chip, coloured by the skill it needs. |
| **Driving** | A hatched bar between two jobs, the length of the travel leg. |
| **Waiting** | A lighter fill on the rail: arrived early, window not open yet. |
| **On shift** | The bare rail. Anything off the rail is outside their hours. |

The four states are distinguishable by shape before colour is considered, which
matters on a dense board and in a screenshot.

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
- **No authentication and no multi-user.** Deliberate: the brief asked for a
  dispatch board, not a product. The only thing stored is any day you write
  yourself, kept in your own browser — nothing is sent anywhere.
- **The basemap key is public by nature.** A browser map key is sent to the tile
  service by the visitor's own browser, so it is inlined into the client bundle
  and cannot be hidden — that is true of every web map, not a shortcut taken
  here. It is kept out of the repository, set in the hosting environment, and
  should be restricted by domain in the CARTO dashboard rather than treated as a
  secret.
- **The map needs the network for its tiles.** Everything else in the app runs
  offline. Without tiles the map degrades to routes and areas on a plain
  background rather than failing.
- **Without a Gemini key the console understands this problem only.** The
  built-in grammar is a domain parser: ask it something outside dispatch and it
  says so, and lists what it does know.
- **The assistant is not a planner.** It proposes one command at a time and the
  board rules on it; it cannot re-solve the day itself or reason its way around
  a hard rule, by design.

## What would come next

1. **Ejection chains** — when a job will not fit, try lifting one job out to make
   room and rehoming it, rather than giving up. This is where the remaining 74
   unplaced jobs across the case set mostly live.
2. **Risk of missing a window as a second objective.** Every arrival's slack
   against its window close is already computed; surfacing the tightest ones
   would let a dispatcher see fragility before the day starts, not after.
3. **Real road geometry on the map.** The areas are in the right places now, but
   the legs between them are arcs. Routing each leg along the actual road network
   would show where a technician really goes, not just the order of areas.
5. **Real travel times** by time of day, since a Dhaka afternoon is not a Dhaka
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
  geo.ts          area coordinates and leg arcs — drawing only, never arithmetic
  routes.ts       a plan expressed as journeys, which is what the map draws
  replan.ts       the bonuses: sick technician, mid-day emergency
  score.ts        the plan score used to compare a hand-edited day
  moves.ts        previewMoves — the one verdict behind the drag and the dropdown
  console.ts      the command grammar: parse text, answer questions
  snapshot.ts     the day written out for a language model to read
  sharedDays.ts   publishing and fetching days via Supabase
  caseFile.ts     read, validate and write days in the published JSON format
  palette.ts      per-case skill colour assignment
  *.test.ts       98 tests
components/board/ the header, the lanes, the city map, the blocked panel,
                  the legend, the move control, the emergency form,
                  the console, the case loader
app/api/chat/     the only server route: the Gemini call, key-side
utils/supabase/   browser and server Supabase clients
supabase/         the one table's migration
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

| Member | GitHub | Major contribution |
| --- | --- | --- |
| Md Sazzad Siddique | `MDSAZZADSIDDIQUE` | Data model and the feasibility rules — the integer-minute time model, `checkFeasible` as the single rule authority, and the unit tests behind it. Deployment and the live URL. |
| Ashesh Deb Priom | `AsheshDebPriom` | The solver — greedy insertion, the swap and relocation improvement pass, the multi-start ordering, and the random baseline the plan is measured against. The two replan features (sick technician, mid-day emergency). |
| Rezuan Islam | `RezuanIslam` | The board — technician lanes and the timeline geometry, the blocked-jobs panel, the city map, drag and drop, and the dispatcher console. |

> Adjust the wording if it does not match how the work actually split — these
> are the four workstreams in the repository, mapped onto three people. The
> submission guidelines require each registered member's major contribution to
> be named, so this table must be right before you send it.

AI assistance (Anthropic Claude, via Claude Code) was used throughout and is
disclosed in `EVENT.md`.
