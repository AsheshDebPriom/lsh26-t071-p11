# LICENSES.md

Every third-party framework, library, starter, template, UI kit, font, icon and
asset used in this repository, with its licence. Versions are the ones in
`package-lock.json` at the submitted commit.

## Runtime dependencies

| Package | Version | Licence | What it does here |
| --- | --- | --- | --- |
| [next](https://github.com/vercel/next.js) | 16.3.3 | MIT | App Router, build and static export. All pages are `'use client'`; no server code. |
| [react](https://github.com/facebook/react) | 19.2.8 | MIT | UI runtime. |
| [react-dom](https://github.com/facebook/react) | 19.2.8 | MIT | DOM renderer; `react-dom/server` is used by the render tests. |
| [framer-motion](https://github.com/motiondivision/motion) | 13.1.1 | MIT | Layout animation for job blocks moving between technician lanes, the map's route drawing, and the counting stat figures. |
| [@dnd-kit/core](https://github.com/clauderic/dnd-kit) | 6.3.1 | MIT | Dragging a job from one technician's lane to another, with pointer and keyboard sensors. |
| [tailwindcss](https://github.com/tailwindlabs/tailwindcss) | 4.3.3 | MIT | Styling. |
| [@tailwindcss/postcss](https://github.com/tailwindlabs/tailwindcss) | 4.3.3 | MIT | Tailwind v4 PostCSS plugin. |
| [shadcn](https://github.com/shadcn-ui/ui) | 4.19.0 | MIT | UI kit. Its CLI generated `components/ui/*` and the base token layer in `app/globals.css`. |
| [@base-ui/react](https://github.com/mui/base-ui) | 1.7.0 | MIT | Headless primitives that shadcn/ui v4 components are built on. |
| [class-variance-authority](https://github.com/joe-bell/cva) | 0.7.1 | Apache-2.0 | Variant helper used by the generated shadcn components. |
| [clsx](https://github.com/lukeed/clsx) | 2.1.1 | MIT | Class-name joining, via `lib/utils.ts`. |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | 3.6.0 | MIT | Class-name merging, via `lib/utils.ts`. |
| [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) | 1.4.0 | MIT | Animation utilities imported by the shadcn token layer. |
| [lucide-react](https://github.com/lucide-icons/lucide) | 1.37.0 | ISC | Icon set pulled in by the shadcn/ui install. No icons are used on the board. |

## Development dependencies

| Package | Version | Licence | What it does here |
| --- | --- | --- | --- |
| [typescript](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | Type checking. |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.13 | MIT | Runs the `node:test` suites and `scripts/stats.ts` directly from TypeScript. |
| [eslint](https://github.com/eslint/eslint) | 9.39.5 | MIT | Linting. |
| [eslint-config-next](https://github.com/vercel/next.js) | 16.3.3 | MIT | Next.js lint rules. |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | 20.19.43 | MIT | Type definitions. |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.2.18 | MIT | Type definitions. |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.2.5 | MIT | Type definitions. |

## Starter / template

| Item | Licence | Notes |
| --- | --- | --- |
| `create-next-app` scaffold (`npx create-next-app@latest`, Next.js 16.3.3) | MIT | Generated during the event window. Provided `app/layout.tsx`, `app/page.tsx`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs` and the initial `app/globals.css`. All have since been edited or replaced. |
| `shadcn/ui` components (`npx shadcn@latest add button badge card select separator tooltip`) | MIT | Generated into `components/ui/`. `lib/utils.ts` and the CSS token layer in `app/globals.css` also came from the shadcn CLI. |
| `AGENTS.md` / `CLAUDE.md` | — | Written automatically by `next dev` (see `node_modules/next/dist/server/lib/generate-agent-files.js`). Committed to keep the working tree clean; not our prose and not part of the solution. |

## Fonts

| Font | Licence | Notes |
| --- | --- | --- |
| [Geist Sans](https://github.com/vercel/geist-font) | SIL Open Font License 1.1 | Self-hosted by `next/font/google`. The neutral grotesque used for labels. |
| [Geist Mono](https://github.com/vercel/geist-font) | SIL Open Font License 1.1 | Self-hosted by `next/font/google`. Every time, duration and travel figure on the board is set in it with `font-variant-numeric: tabular-nums lining-nums`. |

No other font, icon set, image, illustration or sound is used. There are no
icons, logos or raster assets in the repository at all.

## Event data

| Item | Source | Notes |
| --- | --- | --- |
| `data/P11_route_shift_public.json` | LofiStack Hackathon 2026 participant pack, problem P11, `schema_version` 2.1 | Twenty-five public cases issued by the organisers. Used unmodified and read at build time; it is the primary data source for the app. Not our work and not licensed to us for redistribution beyond this submission. |
| `docs/problem-11.txt`, `docs/submission-guidelines.txt`, `docs/LofiStack_Hackathon_Format_and_Scoring.docx` | LofiStack Hackathon 2026 | Event-issued reference material, committed for traceability. |

## Our own work

Everything in `lib/`, `components/board/`, `scripts/`, `app/page.tsx`, the
current `app/globals.css` palette, and all documentation in this repository was
written during the event window for this problem. The crafted demo day in
`lib/seed.ts` — its roster, its jobs and its Dhaka travel table — is invented
data, not taken from any source.

## AI assistance

Built with AI assistance (Anthropic Claude, via Claude Code), disclosed in
`EVENT.md` as the rules require. Every architectural decision was specified and
reviewed by the team, and the test suite was run and its output checked.
