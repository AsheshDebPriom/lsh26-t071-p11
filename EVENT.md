# EVENT.md

| Field | Value |
| --- | --- |
| Team ID | **LSH26-T071** |
| Problem ID | **P11** — Route and Shift Assignment Optimiser |
| Repository | `lsh26-t071-p11` |
| Event start code | `REPLACE_WITH_EVENT_START_CODE` |

> **Action required before submission:** replace the event start code above with the
> code issued in the arena at 05:30 pm. Everything else in this file is final.

## Pre-event material declaration

Nothing in this repository was written before 06:00 pm other than the items listed here.

| Item | Status |
| --- | --- |
| `docs/problem-11.txt`, `docs/submission-guidelines.txt`, `docs/LofiStack_Hackathon_Format_and_Scoring.docx` | Event-issued material, committed for reference. Not code. |
| `create-next-app` scaffold (Next.js 16, TypeScript, Tailwind CSS v4, ESLint) | Generic scaffolding, generated **during** the event window by `npx create-next-app@latest`. Not a pre-built solution. |
| `shadcn/ui` component primitives in `components/ui/` | Generic third-party UI kit, added **during** the event window by `npx shadcn@latest add`. MIT licensed, see `LICENSES.md`. |
| Everything else (`lib/`, `components/board/`, `app/page.tsx`, docs) | Written during the event window for this problem. |

No pre-written solution to P11, or to any released problem, existed before the event window.

## AI assistant disclosure

This project was built with AI assistance (Anthropic Claude, via Claude Code). Every
architectural decision — integer-minute time model, the single `checkFeasible` authority,
greedy-insertion-plus-swap solver, deliberately seeded infeasible jobs — was specified,
reviewed and verified by the team. The unit tests in `lib/feasibility.test.ts` were run and
their output checked. The work and its correctness remain the team's responsibility.
