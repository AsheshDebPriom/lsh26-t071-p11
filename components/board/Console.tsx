'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { EXAMPLE_COMMANDS } from '@/lib/console';

/**
 * The dispatcher console. Type what you want done and the board does it.
 *
 * Two answering layers. The built-in grammar handles the phrasings this problem
 * actually has — move, assign, unassign, sick, emergency, explain, who can take,
 * solve, restore, load a day — instantly, offline and for free. Anything it does
 * not recognise goes to Gemini through /api/chat, which reads the same day the
 * board is showing and either answers or proposes one command. Either way the
 * command runs through the handlers the buttons use, so nothing reaches the plan
 * without passing checkFeasible.
 *
 * Opens with / or Ctrl-K, closes with Escape.
 */

export interface ConsoleLine {
  id: number;
  role: 'you' | 'board';
  text: string;
  tone?: 'ok' | 'warn' | 'info';
  /** Set when the answer came from Gemini rather than the built-in grammar. */
  source?: 'gemini';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: ConsoleLine[];
  thinking: boolean;
  onSubmit: (text: string) => void;
  onReset: () => void;
  caseLabel: string;
}

export function Console({ open, onOpenChange, lines, thinking, onSubmit, onReset, caseLabel }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // "/" anywhere opens it; Escape closes it. Both ignored while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === 'Escape' && open) {
        onOpenChange(false);
        return;
      }
      if (typing) return;
      if (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, thinking]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setDraft('');
  }

  return (
    <>
      {!open && (
        <motion.button
          type="button"
          onClick={() => onOpenChange(true)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2 }}
          className="fixed bottom-4 right-4 z-[600] flex items-center gap-2 rounded-full border border-hairline bg-panel px-4 py-2.5 text-[12.5px] text-foreground shadow-lg"
          style={{ boxShadow: '0 10px 30px oklch(0 0 0 / 45%)' }}
        >
          <Cursor />
          Ask the board
          <kbd className="num rounded border border-hairline px-1 text-[10.5px] text-muted-foreground">
            /
          </kbd>
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed bottom-4 right-4 z-[600] flex max-h-[26rem] w-[30rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-hairline bg-panel"
            style={{ boxShadow: '0 24px 60px oklch(0 0 0 / 60%)' }}
            aria-label="Dispatcher console"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-3.5 py-2.5">
              <Cursor />
              <span className="text-[13px] font-semibold text-foreground">Ask the board</span>
              <span className="num text-[11px] text-muted-foreground">{caseLabel}</span>
              <span className="ml-auto flex items-center gap-1">
                {lines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onReset();
                      setDraft('');
                      inputRef.current?.focus();
                    }}
                    title="Clear this conversation and start again"
                    className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded px-1.5 text-[16px] leading-none text-muted-foreground hover:text-foreground"
                  aria-label="Close the console"
                >
                  ×
                </button>
              </span>
            </header>

            <div ref={logRef} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
              {lines.length === 0 && (
                <div className="space-y-2.5">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Type a command in plain English. I understand this board — the technicians on
                    today&rsquo;s roster, the jobs, the areas and the rules — and every change I
                    make is checked against the same rules the solver uses.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLE_COMMANDS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => submit(c)}
                        className="rounded-full border border-hairline px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {lines.map((line) => (
                <motion.div
                  key={line.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={line.role === 'you' ? 'flex justify-end' : ''}
                >
                  <p
                    className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed ${
                      line.role === 'you' ? 'bg-primary text-primary-foreground' : 'bg-panel-2'
                    }`}
                    style={
                      line.role === 'board'
                        ? {
                            color:
                              line.tone === 'warn'
                                ? 'var(--alarm)'
                                : line.tone === 'ok'
                                  ? 'var(--foreground)'
                                  : 'var(--muted-foreground)',
                            borderLeft:
                              line.tone === 'warn'
                                ? '2px solid var(--alarm)'
                                : '2px solid var(--hairline)',
                          }
                        : undefined
                    }
                  >
                    {line.text}
                    {line.source === 'gemini' && (
                      <span className="mt-1 block text-[10.5px] uppercase tracking-wide opacity-60">
                        via Gemini
                      </span>
                    )}
                  </p>
                </motion.div>
              ))}

              {thinking && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.3, repeat: Infinity }}
                  className="text-[12.5px] text-muted-foreground"
                >
                  Thinking…
                </motion.p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(draft);
              }}
              className="flex shrink-0 items-center gap-2 border-t border-hairline px-3 py-2.5"
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="move J-13 to Kamal…"
                className="min-w-0 flex-1 rounded-md border border-input bg-panel-2 px-2.5 py-1.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring"
              />
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Send
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function Cursor() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <path
        d="M2 3.5 L5.5 7 L2 10.5"
        fill="none"
        stroke="var(--skill-1)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="7.5" y="9" width="5" height="1.7" rx="0.85" fill="var(--skill-4)" />
    </svg>
  );
}
