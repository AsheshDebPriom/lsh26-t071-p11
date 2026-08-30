import type { Area } from './types';

/**
 * Where the areas actually are.
 *
 * Approximate centroids of each area of Dhaka, in degrees. They are good enough
 * to put a route over the right part of the city and no better — they are not
 * survey data and no distance is ever derived from them. The travel table
 * supplied with each case remains the only authority on how long a leg takes,
 * and the map never contradicts it: a straight line drawn here is "these two
 * areas", not "this road".
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const AREA_LATLNG: Record<Area, LatLng> = {
  Uttara: { lat: 23.8759, lng: 90.3795 },
  Bashundhara: { lat: 23.8203, lng: 90.4254 },
  Mirpur: { lat: 23.8223, lng: 90.3654 },
  Banani: { lat: 23.7937, lng: 90.4037 },
  Gulshan: { lat: 23.7806, lng: 90.4171 },
  Badda: { lat: 23.7806, lng: 90.4290 },
  Tejgaon: { lat: 23.7639, lng: 90.3937 },
  Mohammadpur: { lat: 23.7590, lng: 90.3590 },
  Dhanmondi: { lat: 23.7461, lng: 90.3742 },
  Khilgaon: { lat: 23.7500, lng: 90.4250 },
  Motijheel: { lat: 23.7330, lng: 90.4172 },
  'Old Dhaka': { lat: 23.7104, lng: 90.4074 },
};

/** The middle of Dhaka, used when a case names an area the map has never seen. */
export const DHAKA_CENTRE: LatLng = { lat: 23.7806, lng: 90.4000 };

export function areaLatLng(area: Area, fallbackIndex = 0, total = 1): LatLng {
  const known = AREA_LATLNG[area];
  if (known) return known;
  // Park anything unknown on a small ring around the city centre so it is
  // visible and obviously not placed, rather than silently dropped.
  const angle = (fallbackIndex / Math.max(1, total)) * Math.PI * 2;
  return {
    lat: DHAKA_CENTRE.lat + Math.sin(angle) * 0.05,
    lng: DHAKA_CENTRE.lng + Math.cos(angle) * 0.05,
  };
}

export function hasAreaLatLng(area: Area): boolean {
  return Boolean(AREA_LATLNG[area]);
}

/**
 * A gentle arc between two areas, sampled into points a polyline can draw.
 *
 * Two technicians running the same leg would otherwise be one line on top of
 * another. Bowing each leg slightly, always to the same side, keeps them
 * separable and makes the direction of travel readable.
 */
export function arcBetween(a: LatLng, b: LatLng, bow = 0.14, steps = 24): [number, number][] {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  // Perpendicular offset, scaled by the length of the leg.
  const control = {
    lat: mid.lat - dLng * bow,
    lng: mid.lng + dLat * bow,
  };

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * a.lat + 2 * u * t * control.lat + t * t * b.lat,
      u * u * a.lng + 2 * u * t * control.lng + t * t * b.lng,
    ]);
  }
  return points;
}

/**
 * One hue per technician, evenly spaced and kept clear of the alarm red so a
 * route can never be mistaken for a rule violation.
 */
export function technicianColour(index: number, total: number): string {
  // Runs from gold at 70 through green, teal and blue to violet at 330,
  // deliberately stopping short of the reds. The alarm colour lives at hue 25,
  // and a route that could be mistaken for a rule violation is a bug — a
  // sixteen-technician fleet used to wrap right into it.
  const offset = 70;
  const span = 260;
  const hue = offset + (index / Math.max(1, total)) * span;
  return `oklch(0.74 0.14 ${hue.toFixed(1)})`;
}
