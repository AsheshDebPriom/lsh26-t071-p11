'use client';

import { useState } from 'react';

import { formatTime, parseHM } from '@/lib/time';
import type { DayCase, Job } from '@/lib/types';
import { skillLabel } from '@/lib/types';

/**
 * Bonus: an emergency call arrives mid-day. The form is prefilled with a
 * sensible call so a first-time user can raise one in a single click, and the
 * "now" control is here too because "which jobs have already started" is the
 * only thing that makes a mid-day replan different from a fresh solve.
 */

interface Props {
  day: DayCase;
  nowMinutes: number;
  onNowChange: (minutes: number) => void;
  onRaise: (job: Job, nowMinutes: number) => void;
  onCancel: () => void;
  index: number;
}

export function EmergencyForm({ day, nowMinutes, onNowChange, onRaise, onCancel, index }: Props) {
  const skills = [...new Set(day.technicians.flatMap((t) => t.skills))].sort();
  const [area, setArea] = useState(day.areas[0]);
  const [skill, setSkill] = useState(skills[0] ?? 'ac');
  const [duration, setDuration] = useState(60);
  const [windowStart, setWindowStart] = useState(formatTime(nowMinutes + 30));
  const [windowEnd, setWindowEnd] = useState(formatTime(nowMinutes + 150));
  const [error, setError] = useState<string | null>(null);

  function raise() {
    let ws: number;
    let we: number;
    try {
      ws = parseHM(windowStart);
      we = parseHM(windowEnd);
    } catch {
      setError('Times must be written as HH:MM, for example 14:30.');
      return;
    }
    if (we < ws) {
      setError('The window closes before it opens.');
      return;
    }
    if (duration <= 0) {
      setError('The job needs a duration in minutes.');
      return;
    }
    const id = `EMG${index}`;
    onRaise(
      {
        id,
        code: `E-${String(index).padStart(2, '0')}`,
        customer: `Emergency call, ${area}`,
        area,
        skill,
        durationMin: duration,
        windowStart: ws,
        windowEnd: we,
      },
      nowMinutes,
    );
  }

  return (
    <div className="border-b border-hairline bg-panel-2 px-5 py-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <span className="num block text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Time now
          </span>
          <input
            type="time"
            value={formatTime(nowMinutes)}
            onChange={(e) => {
              try {
                onNowChange(parseHM(e.target.value));
              } catch {
                /* half-typed value; ignore until it parses */
              }
            }}
            className="num mt-1 rounded-[4px] border border-input bg-panel px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          />
        </div>

        <Field label="Area">
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="num w-full rounded-[4px] border border-input bg-panel px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          >
            {day.areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>

        <Field label="Skill needed">
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            className="num w-full rounded-[4px] border border-input bg-panel px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          >
            {skills.map((s) => (
              <option key={s} value={s}>{skillLabel(s)}</option>
            ))}
          </select>
        </Field>

        <Field label="Minutes">
          <input
            type="number"
            min={15}
            max={300}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="num w-20 rounded-[4px] border border-input bg-panel px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          />
        </Field>

        <Field label="Window opens">
          <input
            type="time"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
            className="num rounded-[4px] border border-input bg-panel px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          />
        </Field>

        <Field label="Window closes">
          <input
            type="time"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            className="num rounded-[4px] border border-input bg-panel px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          />
        </Field>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={raise}
            className="num rounded-[4px] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wider"
            style={{ background: 'var(--alarm)', color: 'oklch(0.17 0.02 250)' }}
          >
            Raise emergency
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="num rounded-[4px] border border-hairline px-3 py-1.5 text-[12px] uppercase tracking-wider text-foreground hover:border-ring"
          >
            Cancel
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
        Jobs already under way at {formatTime(nowMinutes)} stay exactly where they are — those
        technicians are on site. Everything not yet started is replanned around the emergency.
      </p>
      {error && (
        <p className="num mt-1.5 text-[12px]" style={{ color: 'var(--alarm)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="num text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
