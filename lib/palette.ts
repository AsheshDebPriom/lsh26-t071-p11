import type { DayCase, Skill } from './types';

/**
 * Skill colours are assigned per case, not hard-coded, because each published
 * case names its own trades. Four muted, clearly separated hues; a fifth trade
 * would fall back to neutral rather than borrow a colour that already means
 * something else on the board.
 */
const SKILL_VARS = ['var(--skill-1)', 'var(--skill-2)', 'var(--skill-3)', 'var(--skill-4)'];

export type SkillColours = Record<Skill, string>;

export function skillColours(day: DayCase): SkillColours {
  const seen = new Set<Skill>();
  for (const t of day.technicians) for (const s of t.skills) seen.add(s);
  for (const j of day.jobs) seen.add(j.skill);

  const out: SkillColours = {};
  [...seen].sort().forEach((skill, i) => {
    out[skill] = SKILL_VARS[i] ?? 'var(--skill-fallback)';
  });
  return out;
}

export function colourFor(colours: SkillColours, skill: Skill): string {
  return colours[skill] ?? 'var(--skill-fallback)';
}
