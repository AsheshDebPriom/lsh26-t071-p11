'use client';

import { useState } from 'react';

import {
  addArea, addJob, addTechnician, draftGaps, draftSummary, normaliseTravel,
  removeArea, removeJob, removeTechnician, renameArea, setTravel,
  skillsInDraft, updateJob, updateTechnician,
} from '@/lib/caseDraft';
import type { RawCase } from '@/lib/caseFile';
import { skillLabel } from '@/lib/types';

/**
 * Building a day by filling in a form, rather than by editing JSON.
 *
 * Every edit keeps the case consistent — rename an area and the travel table
 * and everyone in it follow; type one side of a travel leg and the other side
 * is set with it, because the table has to be symmetric. The JSON tab is still
 * there for anyone who would rather type it, and both write the same object.
 */

interface Props {
  draft: RawCase;
  onChange: (draft: RawCase) => void;
}

export function CaseBuilder({ draft, onChange }: Props) {
  const [newArea, setNewArea] = useState('');
  const skills = skillsInDraft(draft);
  const gaps = draftGaps(draft);

  return (
    <div className="space-y-5">
      {/* Identity */}
      <section className="flex flex-wrap items-end gap-3">
        <Field label="Name this day">
          <input
            value={draft.case_id}
            onChange={(e) => onChange({ ...draft, case_id: e.target.value })}
            placeholder="MY-DAY-01"
            className="num w-44 rounded-md border border-input bg-panel-2 px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={draft.today}
            onChange={(e) => onChange({ ...draft, today: e.target.value })}
            className="num rounded-md border border-input bg-panel-2 px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-ring"
          />
        </Field>
        <p className="ml-auto text-[12px] text-muted-foreground">{draftSummary(draft)}</p>
      </section>

      {/* Areas */}
      <section>
        <Heading n={draft.areas.length} label="Areas" hint="Where work happens. At least two." />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {draft.areas.map((area) => (
            <span
              key={area}
              className="flex items-center gap-1 rounded-full border border-hairline bg-panel-2 py-0.5 pl-2 pr-1"
            >
              <input
                value={area}
                onChange={(e) => onChange(renameArea(draft, area, e.target.value))}
                size={Math.max(6, area.length)}
                className="bg-transparent text-[12px] text-foreground outline-none"
                aria-label={`Rename ${area}`}
              />
              <button
                type="button"
                onClick={() => onChange(removeArea(draft, area))}
                className="rounded-full px-1 text-[13px] leading-none text-muted-foreground hover:text-[var(--alarm)]"
                aria-label={`Remove ${area}`}
              >
                ×
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onChange(addArea(draft, newArea));
              setNewArea('');
            }}
            className="flex items-center gap-1"
          >
            <input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              placeholder="Add an area…"
              className="w-32 rounded-md border border-input bg-panel-2 px-2 py-1 text-[12px] text-foreground outline-none focus:border-ring"
            />
            <button
              type="submit"
              className="rounded-md border border-hairline px-2 py-1 text-[12px] text-foreground hover:border-ring"
            >
              Add
            </button>
          </form>
        </div>
      </section>

      {/* Travel table */}
      {draft.areas.length >= 2 && (
        <section>
          <Heading
            label="Travel between areas"
            hint="Minutes. Typing one side sets the other — the table must be symmetric."
          />
          <div className="scroll-thin mt-2 overflow-x-auto">
            <table className="border-collapse text-[11.5px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-panel px-2 py-1 text-left text-muted-foreground">
                    from ↓ to →
                  </th>
                  {draft.areas.map((a) => (
                    <th key={a} className="px-1 py-1 text-muted-foreground">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.areas.map((from) => (
                  <tr key={from}>
                    <th className="sticky left-0 bg-panel px-2 py-1 text-left font-medium text-foreground">
                      {from}
                    </th>
                    {draft.areas.map((to) => (
                      <td key={to} className="p-0.5">
                        {from === to ? (
                          <span className="num block w-14 rounded bg-panel-2/50 py-1 text-center text-muted-foreground">
                            0
                          </span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            value={draft.travel_minutes[from]?.[to] ?? 0}
                            onChange={(e) =>
                              onChange(setTravel(draft, from, to, Number(e.target.value)))
                            }
                            className="num w-14 rounded border border-input bg-panel-2 py-1 text-center text-foreground outline-none focus:border-ring"
                            aria-label={`${from} to ${to} in minutes`}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => onChange(normaliseTravel(draft))}
            className="mt-1.5 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Fill any gaps and force the diagonal to zero
          </button>
        </section>
      )}

      {/* Technicians */}
      <section>
        <Heading n={draft.technicians.length} label="Technicians" hint="Who is on shift today." />
        <div className="mt-2 space-y-2">
          {draft.technicians.map((t) => (
            <div key={t.id} className="flex flex-wrap items-end gap-2 rounded-md border border-hairline bg-panel-2 p-2">
              <span className="num self-center text-[11px] text-muted-foreground">{t.id}</span>
              <Field label="Name">
                <input
                  value={t.name}
                  onChange={(e) => onChange(updateTechnician(draft, t.id, { name: e.target.value }))}
                  className="w-28 rounded border border-input bg-panel px-2 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                />
              </Field>
              <Field label="Shift">
                <span className="flex items-center gap-1">
                  <input
                    type="time"
                    value={t.shift_start}
                    onChange={(e) => onChange(updateTechnician(draft, t.id, { shift_start: e.target.value }))}
                    className="num rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                  />
                  <input
                    type="time"
                    value={t.shift_end}
                    onChange={(e) => onChange(updateTechnician(draft, t.id, { shift_end: e.target.value }))}
                    className="num rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                  />
                </span>
              </Field>
              <Field label="Home area">
                <select
                  value={t.home_area}
                  onChange={(e) => onChange(updateTechnician(draft, t.id, { home_area: e.target.value }))}
                  className="rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                >
                  {draft.areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Skills">
                <span className="flex flex-wrap gap-1">
                  {skills.map((s) => {
                    const on = t.skills.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          onChange(
                            updateTechnician(draft, t.id, {
                              skills: on ? t.skills.filter((x) => x !== s) : [...t.skills, s],
                            }),
                          )
                        }
                        className="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                        style={
                          on
                            ? { borderColor: 'var(--skill-1)', color: 'var(--skill-1)' }
                            : { borderColor: 'var(--hairline)', color: 'var(--muted-foreground)' }
                        }
                      >
                        {skillLabel(s)}
                      </button>
                    );
                  })}
                </span>
              </Field>
              <button
                type="button"
                onClick={() => onChange(removeTechnician(draft, t.id))}
                className="ml-auto self-center rounded border border-hairline px-2 py-1 text-[11px] text-muted-foreground hover:border-[var(--alarm)] hover:text-[var(--alarm)]"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(addTechnician(draft, skills))}
          disabled={draft.areas.length === 0}
          className="mt-2 rounded-md border border-hairline px-3 py-1.5 text-[12.5px] text-foreground hover:border-ring disabled:opacity-50"
        >
          Add a technician
        </button>
      </section>

      {/* Jobs */}
      <section>
        <Heading n={draft.jobs.length} label="Jobs" hint="What the customers booked." />
        <div className="mt-2 space-y-2">
          {draft.jobs.map((j) => (
            <div key={j.id} className="flex flex-wrap items-end gap-2 rounded-md border border-hairline bg-panel-2 p-2">
              <span className="num self-center text-[11px] text-muted-foreground">{j.id}</span>
              <Field label="Area">
                <select
                  value={j.area}
                  onChange={(e) => onChange(updateJob(draft, j.id, { area: e.target.value }))}
                  className="rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                >
                  {draft.areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Skill needed">
                <select
                  value={j.skill}
                  onChange={(e) => onChange(updateJob(draft, j.id, { skill: e.target.value }))}
                  className="rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                >
                  {skills.map((s) => <option key={s} value={s}>{skillLabel(s)}</option>)}
                </select>
              </Field>
              <Field label="Minutes">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={j.duration_minutes}
                  onChange={(e) => onChange(updateJob(draft, j.id, { duration_minutes: Number(e.target.value) }))}
                  className="num w-20 rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                />
              </Field>
              <Field label="Customer window">
                <span className="flex items-center gap-1">
                  <input
                    type="time"
                    value={j.window_start}
                    onChange={(e) => onChange(updateJob(draft, j.id, { window_start: e.target.value }))}
                    className="num rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                  />
                  <input
                    type="time"
                    value={j.window_end}
                    onChange={(e) => onChange(updateJob(draft, j.id, { window_end: e.target.value }))}
                    className="num rounded border border-input bg-panel px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring"
                  />
                </span>
              </Field>
              <button
                type="button"
                onClick={() => onChange(removeJob(draft, j.id))}
                className="ml-auto self-center rounded border border-hairline px-2 py-1 text-[11px] text-muted-foreground hover:border-[var(--alarm)] hover:text-[var(--alarm)]"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(addJob(draft, skills))}
          disabled={draft.areas.length === 0}
          className="mt-2 rounded-md border border-hairline px-3 py-1.5 text-[12.5px] text-foreground hover:border-ring disabled:opacity-50"
        >
          Add a job
        </button>
      </section>

      {gaps.length > 0 && (
        <ul className="space-y-1 rounded-md border border-hairline bg-panel-2 px-3 py-2">
          {gaps.map((g) => (
            <li key={g} className="text-[11.5px] leading-snug text-muted-foreground">
              {g}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Heading({ label, hint, n }: { label: string; hint: string; n?: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-hairline pb-1">
      <h3 className="text-[13px] font-semibold text-foreground">{label}</h3>
      {n !== undefined && <span className="num text-[11.5px] text-muted-foreground">{n}</span>}
      <span className="text-[11.5px] text-muted-foreground">{hint}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
