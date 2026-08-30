'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState } from 'react';

import { blankCaseTemplate, parseCaseFile, serialiseCases, type RawCase } from '@/lib/caseFile';
import type { DayCase } from '@/lib/types';

/**
 * Build your own day.
 *
 * The format is the one the participant pack ships, so a day authored here
 * would load into any other P11 implementation and vice versa — there is no
 * private format. Export gives you a valid file to start editing; import
 * checks it hard and lists everything wrong with it at once, by field path,
 * because fixing JSON one error per attempt is miserable.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCase: DayCase;
  onLoad: (cases: RawCase[]) => void;
  customCount: number;
  onForget: () => void;
}

export function CaseLoader({
  open, onOpenChange, currentCase, onLoad, customCount, onForget,
}: Props) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function load(source: string) {
    const result = parseCaseFile(source);
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings([]);
      return;
    }
    setErrors([]);
    setWarnings(result.warnings);
    onLoad(result.cases);
  }

  function download(name: string, contents: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-4"
        onClick={() => onOpenChange(false)}
      >
        <motion.section
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85dvh] w-[46rem] max-w-full flex-col overflow-hidden rounded-xl border border-hairline bg-panel"
          style={{ boxShadow: '0 30px 80px oklch(0 0 0 / 65%)' }}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-hairline px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Build your own day</h2>
              <p className="mt-0.5 max-w-lg text-[12.5px] leading-snug text-muted-foreground">
                Your own technicians, jobs, areas and travel table — in the same JSON the
                participant pack uses, so it stays interchangeable with the published cases.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-auto rounded px-1.5 text-[18px] leading-none text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setText(blankCaseTemplate())}
                className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90"
              >
                Start from a template
              </button>
              <button
                type="button"
                onClick={() => setText(serialiseCases([currentCase]))}
                className="rounded-md border border-hairline bg-panel-2 px-3 py-1.5 text-[12.5px] text-foreground hover:border-ring"
              >
                Copy {currentCase.id} in to edit
              </button>
              <button
                type="button"
                onClick={() => download(`${currentCase.id}.json`, serialiseCases([currentCase]))}
                className="rounded-md border border-hairline bg-panel-2 px-3 py-1.5 text-[12.5px] text-foreground hover:border-ring"
              >
                Download {currentCase.id}.json
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-md border border-hairline bg-panel-2 px-3 py-1.5 text-[12.5px] text-foreground hover:border-ring"
              >
                Open a file…
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const contents = await file.text();
                  setText(contents);
                  load(contents);
                  e.target.value = '';
                }}
              />
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder="Paste a case file here, or press “Start from a template”."
              className="num mt-3 h-64 w-full resize-y rounded-md border border-input bg-panel-2 p-3 text-[11.5px] leading-relaxed text-foreground outline-none focus:border-ring"
            />

            {errors.length > 0 && (
              <div
                className="mt-3 rounded-md border px-3 py-2.5"
                style={{ borderColor: 'var(--alarm)', background: 'var(--alarm-dim)' }}
              >
                <p className="text-[12.5px] font-semibold" style={{ color: 'var(--alarm)' }}>
                  {errors.length} problem{errors.length === 1 ? '' : 's'} — nothing was loaded
                </p>
                <ul className="mt-1.5 space-y-1">
                  {errors.slice(0, 25).map((err) => (
                    <li key={err} className="text-[11.5px] leading-snug text-foreground/90">
                      {err}
                    </li>
                  ))}
                  {errors.length > 25 && (
                    <li className="text-[11.5px] text-muted-foreground">
                      …and {errors.length - 25} more.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-hairline bg-panel-2 px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-foreground">
                  Loaded, with {warnings.length} thing{warnings.length === 1 ? '' : 's'} worth knowing
                </p>
                <ul className="mt-1.5 space-y-1">
                  {warnings.slice(0, 10).map((w) => (
                    <li key={w} className="text-[11.5px] leading-snug text-muted-foreground">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="mt-4 text-[12px] text-muted-foreground">
              <summary className="cursor-pointer text-foreground">What the file needs</summary>
              <ul className="mt-2 space-y-1 leading-relaxed">
                <li>
                  <b className="text-foreground">areas</b> — at least two names. Every technician
                  home area and every job area must be one of them.
                </li>
                <li>
                  <b className="text-foreground">travel_minutes</b> — a number for every pair of
                  areas, zero on the diagonal, and symmetric: A→B must equal B→A.
                </li>
                <li>
                  <b className="text-foreground">technicians</b> — id, name, skills, shift_start,
                  shift_end as <span className="num">HH:MM</span>, home_area.
                </li>
                <li>
                  <b className="text-foreground">jobs</b> — id, area, skill, duration_minutes, and a
                  window_start/window_end as <span className="num">HH:MM</span>.
                </li>
                <li>
                  <b className="text-foreground">manual_move</b> — optional; the scripted move the
                  board can replay.
                </li>
                <li>
                  A job whose skill nobody holds is allowed, and is how you make a job the plan must
                  refuse. You will get a warning, not an error.
                </li>
              </ul>
            </details>
          </div>

          <footer className="flex shrink-0 items-center gap-2 border-t border-hairline px-5 py-3">
            {customCount > 0 && (
              <button
                type="button"
                onClick={onForget}
                className="rounded-md border border-hairline px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-[var(--alarm)] hover:text-[var(--alarm)]"
              >
                Forget my {customCount} day{customCount === 1 ? '' : 's'}
              </button>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-hairline px-3 py-1.5 text-[12.5px] text-foreground hover:border-ring"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => load(text)}
                disabled={!text.trim()}
                className="rounded-md bg-primary px-4 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Load this day
              </button>
            </span>
          </footer>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
