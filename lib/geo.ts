import type { Area } from './types';

/**
 * A schematic map of Dhaka.
 *
 * These are not survey coordinates and nothing here is used for arithmetic —
 * the travel table supplied with each case stays the only authority on how long
 * a leg takes. This is purely for drawing: the areas are laid out in roughly
 * their real relative positions so a dispatcher can see at a glance that a route
 * is crossing the city instead of working a neighbourhood.
 *
 * Coordinates are fractions of the viewport, north at the top.
 */
export interface AreaPoint {
  x: number;
  y: number;
}

const POINTS: Record<Area, AreaPoint> = {
  Uttara: { x: 0.545, y: 0.055 },
  Bashundhara: { x: 0.715, y: 0.245 },
  Mirpur: { x: 0.205, y: 0.265 },
  Banani: { x: 0.500, y: 0.320 },
  Gulshan: { x: 0.625, y: 0.365 },
  Badda: { x: 0.775, y: 0.440 },
  Tejgaon: { x: 0.450, y: 0.495 },
  Mohammadpur: { x: 0.185, y: 0.510 },
  Dhanmondi: { x: 0.300, y: 0.605 },
  Khilgaon: { x: 0.600, y: 0.635 },
  Motijheel: { x: 0.470, y: 0.760 },
  'Old Dhaka': { x: 0.325, y: 0.865 },
};

/** Anything the map has never heard of is parked on a ring so it still draws. */
export function areaPoint(area: Area, fallbackIndex = 0, total = 1): AreaPoint {
  const known = POINTS[area];
  if (known) return known;
  const angle = (fallbackIndex / Math.max(1, total)) * Math.PI * 2;
  return { x: 0.5 + Math.cos(angle) * 0.42, y: 0.5 + Math.sin(angle) * 0.42 };
}

export function hasAreaPoint(area: Area): boolean {
  return Boolean(POINTS[area]);
}

/**
 * The Buriganga, drawn as one soft curve along the south-west. It carries no
 * data — it is there because a map of Dhaka without the river reads as a
 * scatter plot, and a dispatcher recognises the shape.
 */
export const RIVER_PATH =
  'M -0.06 0.72 C 0.10 0.78, 0.16 0.90, 0.30 0.96 C 0.44 1.02, 0.62 1.00, 0.78 1.06';

/**
 * One hue per technician, evenly spaced and kept clear of the alarm red so a
 * route can never be mistaken for a rule violation.
 */
export function technicianColour(index: number, total: number): string {
  const span = 300; // degrees of hue to spread across
  const offset = 150; // start in the teals, run through blue/violet to gold
  const hue = (offset + (index / Math.max(1, total)) * span) % 360;
  return `oklch(0.72 0.13 ${hue.toFixed(1)})`;
}
