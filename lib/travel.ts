import { AREAS, type Area } from './types';

/**
 * Area-to-area travel time in minutes. Symmetric, mocked to match how Dhaka
 * actually moves at dispatch hours (Uttara to Motijheel is the length of the
 * city; Gulshan to Banani is a five-minute crawl on a bad day).
 *
 * Off-diagonal values are 15–70 minutes. The diagonal is 0: a technician
 * already inside the area does not travel.
 */
const M: Record<Area, Record<Area, number>> = {
  Mirpur:      { Mirpur: 0,  Uttara: 40, Gulshan: 35, Banani: 30, Dhanmondi: 35, Mohammadpur: 25, Bashundhara: 45, Motijheel: 60 },
  Uttara:      { Mirpur: 40, Uttara: 0,  Gulshan: 30, Banani: 28, Dhanmondi: 55, Mohammadpur: 50, Bashundhara: 25, Motijheel: 70 },
  Gulshan:     { Mirpur: 35, Uttara: 30, Gulshan: 0,  Banani: 15, Dhanmondi: 35, Mohammadpur: 40, Bashundhara: 20, Motijheel: 45 },
  Banani:      { Mirpur: 30, Uttara: 28, Gulshan: 15, Banani: 0,  Dhanmondi: 33, Mohammadpur: 35, Bashundhara: 25, Motijheel: 48 },
  Dhanmondi:   { Mirpur: 35, Uttara: 55, Gulshan: 35, Banani: 33, Dhanmondi: 0,  Mohammadpur: 18, Bashundhara: 50, Motijheel: 40 },
  Mohammadpur: { Mirpur: 25, Uttara: 50, Gulshan: 40, Banani: 35, Dhanmondi: 18, Mohammadpur: 0,  Bashundhara: 55, Motijheel: 45 },
  Bashundhara: { Mirpur: 45, Uttara: 25, Gulshan: 20, Banani: 25, Dhanmondi: 50, Mohammadpur: 55, Bashundhara: 0,  Motijheel: 55 },
  Motijheel:   { Mirpur: 60, Uttara: 70, Gulshan: 45, Banani: 48, Dhanmondi: 40, Mohammadpur: 45, Bashundhara: 55, Motijheel: 0  },
};

export const TRAVEL_MATRIX = M;

export function travelMinutes(from: Area, to: Area): number {
  return M[from][to];
}

/** Guard against a hand-edited matrix drifting out of shape. Used by the tests. */
export function assertMatrixIsSane(): void {
  for (const a of AREAS) {
    if (M[a][a] !== 0) throw new Error(`travel ${a}->${a} must be 0`);
    for (const b of AREAS) {
      if (M[a][b] !== M[b][a]) throw new Error(`travel matrix not symmetric: ${a}/${b}`);
      if (a !== b && (M[a][b] < 15 || M[a][b] > 70)) {
        throw new Error(`travel ${a}->${b} = ${M[a][b]} outside 15..70`);
      }
    }
  }
}
