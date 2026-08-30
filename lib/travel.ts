import type { Area, TravelMatrix } from './types';

/**
 * Travel lookups against whichever table the current case supplies. The
 * published format note calls the table authoritative and symmetric, so the
 * app never estimates a leg it was not given.
 */
export function travelMinutes(matrix: TravelMatrix, from: Area, to: Area): number {
  const row = matrix[from];
  if (!row) return 0;
  const v = row[to];
  return typeof v === 'number' ? v : 0;
}

/** Guard against a hand-edited or malformed table. Used by the tests. */
export function assertMatrixIsSane(matrix: TravelMatrix, areas: Area[]): void {
  for (const a of areas) {
    if (!matrix[a]) throw new Error(`travel table has no row for ${a}`);
    if (matrix[a][a] !== 0) throw new Error(`travel ${a}->${a} must be 0`);
    for (const b of areas) {
      const ab = matrix[a][b];
      const ba = matrix[b]?.[a];
      if (typeof ab !== 'number') throw new Error(`travel ${a}->${b} missing`);
      if (ab !== ba) throw new Error(`travel table not symmetric: ${a}/${b} (${ab} vs ${ba})`);
      if (ab < 0) throw new Error(`travel ${a}->${b} is negative`);
    }
  }
}
