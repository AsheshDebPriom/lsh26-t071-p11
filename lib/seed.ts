import { hm } from './time';
import type { Area, DayCase, Job, Technician, TravelMatrix } from './types';

export const CRAFTED_AREAS: Area[] = [
  'Mirpur', 'Uttara', 'Gulshan', 'Banani',
  'Dhanmondi', 'Mohammadpur', 'Bashundhara', 'Motijheel',
];

/**
 * Travel table for the crafted day, mocked to match how Dhaka actually moves at
 * dispatch hours: Uttara to Motijheel is the length of the city, Gulshan to
 * Banani is a five-minute crawl. Symmetric, 15-70 minutes off the diagonal,
 * zero on it.
 */
export const CRAFTED_TRAVEL: TravelMatrix = {
  Mirpur:      { Mirpur: 0,  Uttara: 40, Gulshan: 35, Banani: 30, Dhanmondi: 35, Mohammadpur: 25, Bashundhara: 45, Motijheel: 60 },
  Uttara:      { Mirpur: 40, Uttara: 0,  Gulshan: 30, Banani: 28, Dhanmondi: 55, Mohammadpur: 50, Bashundhara: 25, Motijheel: 70 },
  Gulshan:     { Mirpur: 35, Uttara: 30, Gulshan: 0,  Banani: 15, Dhanmondi: 35, Mohammadpur: 40, Bashundhara: 20, Motijheel: 45 },
  Banani:      { Mirpur: 30, Uttara: 28, Gulshan: 15, Banani: 0,  Dhanmondi: 33, Mohammadpur: 35, Bashundhara: 25, Motijheel: 48 },
  Dhanmondi:   { Mirpur: 35, Uttara: 55, Gulshan: 35, Banani: 33, Dhanmondi: 0,  Mohammadpur: 18, Bashundhara: 50, Motijheel: 40 },
  Mohammadpur: { Mirpur: 25, Uttara: 50, Gulshan: 40, Banani: 35, Dhanmondi: 18, Mohammadpur: 0,  Bashundhara: 55, Motijheel: 45 },
  Bashundhara: { Mirpur: 45, Uttara: 25, Gulshan: 20, Banani: 25, Dhanmondi: 50, Mohammadpur: 55, Bashundhara: 0,  Motijheel: 55 },
  Motijheel:   { Mirpur: 60, Uttara: 70, Gulshan: 45, Banani: 48, Dhanmondi: 40, Mohammadpur: 45, Bashundhara: 55, Motijheel: 0  },
};

/**
 * Mocked day for a Dhaka home-service company: 12 technicians, 37 jobs.
 * Typed TypeScript rather than JSON so the compiler checks every area name,
 * skill and window against the model in lib/types.ts.
 *
 * Roster note, deliberate and load-bearing: no electrician is rostered today.
 * ELECTRICAL is a skill the company dispatches, but nobody on shift holds it —
 * which is exactly the case the blocked-jobs list exists to make visible.
 */
export const TECHNICIANS: Technician[] = [
  { id: 'T01', name: 'Rafiq',    skills: ['AC_SERVICE', 'PLUMBING'],               homeArea: 'Mirpur',      shiftStart: hm(8),  shiftEnd: hm(16) },
  { id: 'T02', name: 'Nasrin',   skills: ['AC_SERVICE', 'AC_INSTALL'],             homeArea: 'Uttara',      shiftStart: hm(8),  shiftEnd: hm(16) },
  { id: 'T03', name: 'Kamal',    skills: ['PLUMBING'],                             homeArea: 'Motijheel',   shiftStart: hm(8),  shiftEnd: hm(16) },
  { id: 'T04', name: 'Shirin',   skills: ['AC_SERVICE'],                           homeArea: 'Dhanmondi',   shiftStart: hm(10), shiftEnd: hm(18) },
  { id: 'T05', name: 'Jahangir', skills: ['AC_SERVICE', 'AC_INSTALL', 'PLUMBING'], homeArea: 'Gulshan',     shiftStart: hm(10), shiftEnd: hm(18) },
  { id: 'T06', name: 'Mizanur',  skills: ['PLUMBING'],                             homeArea: 'Mohammadpur', shiftStart: hm(8),  shiftEnd: hm(16) },
  { id: 'T07', name: 'Farhana',  skills: ['AC_SERVICE'],                           homeArea: 'Banani',      shiftStart: hm(10), shiftEnd: hm(18) },
  { id: 'T08', name: 'Tanvir',   skills: ['AC_SERVICE', 'AC_INSTALL'],             homeArea: 'Bashundhara', shiftStart: hm(9),  shiftEnd: hm(17) },
  { id: 'T09', name: 'Sabina',   skills: ['AC_SERVICE', 'PLUMBING'],               homeArea: 'Mirpur',      shiftStart: hm(9),  shiftEnd: hm(17) },
  { id: 'T10', name: 'Habibur',  skills: ['AC_SERVICE'],                           homeArea: 'Motijheel',   shiftStart: hm(10), shiftEnd: hm(18) },
  // Part-timer: five hours in the middle of the day.
  { id: 'T11', name: 'Rumana',   skills: ['PLUMBING'],                             homeArea: 'Dhanmondi',   shiftStart: hm(12), shiftEnd: hm(17) },
  { id: 'T12', name: 'Anisul',   skills: ['AC_SERVICE', 'AC_INSTALL'],             homeArea: 'Banani',      shiftStart: hm(8),  shiftEnd: hm(16) },
];

export const JOBS: Job[] = [
  // ---- The ordinary day. ------------------------------------------------
  { id: 'J01', code: 'J-01', customer: 'Shahed Karim',         area: 'Gulshan',     skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(9),      windowEnd: hm(11) },
  { id: 'J02', code: 'J-02', customer: 'Nusrat Jahan',         area: 'Banani',      skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(8, 30),  windowEnd: hm(10, 30) },
  { id: 'J03', code: 'J-03', customer: 'Imran Chowdhury',      area: 'Dhanmondi',   skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(9),      windowEnd: hm(12) },
  { id: 'J04', code: 'J-04', customer: 'Ruhul Amin',           area: 'Mirpur',      skill: 'PLUMBING',   durationMin: 90,  windowStart: hm(9),      windowEnd: hm(11, 30) },
  { id: 'J05', code: 'J-05', customer: 'Farida Yeasmin',       area: 'Uttara',      skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(10),     windowEnd: hm(13) },
  { id: 'J06', code: 'J-06', customer: 'Meghna Traders',       area: 'Motijheel',   skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(9, 30),  windowEnd: hm(12) },
  { id: 'J07', code: 'J-07', customer: 'Selina Parvin',        area: 'Mohammadpur', skill: 'PLUMBING',   durationMin: 60,  windowStart: hm(8, 30),  windowEnd: hm(11) },
  { id: 'J08', code: 'J-08', customer: 'Arif Mahmud',          area: 'Bashundhara', skill: 'AC_INSTALL', durationMin: 120, windowStart: hm(10),     windowEnd: hm(13) },
  { id: 'J09', code: 'J-09', customer: 'Tahmina Rashid',       area: 'Gulshan',     skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(11),     windowEnd: hm(14) },
  { id: 'J10', code: 'J-10', customer: 'Blue Orchid Cafe',     area: 'Banani',      skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(11, 30), windowEnd: hm(14, 30) },
  { id: 'J11', code: 'J-11', customer: 'Kazi Nazrul',          area: 'Dhanmondi',   skill: 'PLUMBING',   durationMin: 75,  windowStart: hm(10),     windowEnd: hm(13) },
  { id: 'J12', code: 'J-12', customer: 'Shamima Nasrin',       area: 'Mirpur',      skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(12),     windowEnd: hm(15) },
  { id: 'J13', code: 'J-13', customer: 'Sajid Hasan',          area: 'Uttara',      skill: 'AC_INSTALL', durationMin: 105, windowStart: hm(9),      windowEnd: hm(12) },
  { id: 'J14', code: 'J-14', customer: 'Padma Chambers',       area: 'Motijheel',   skill: 'PLUMBING',   durationMin: 60,  windowStart: hm(13),     windowEnd: hm(16) },
  { id: 'J15', code: 'J-15', customer: 'Hasibul Karim',        area: 'Mohammadpur', skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(13, 30), windowEnd: hm(16) },
  { id: 'J16', code: 'J-16', customer: 'Rownak Jahan',         area: 'Bashundhara', skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(12),     windowEnd: hm(15) },
  { id: 'J17', code: 'J-17', customer: 'Ayesha Siddiqua',      area: 'Gulshan',     skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(14),     windowEnd: hm(16, 30) },
  { id: 'J18', code: 'J-18', customer: 'Tropical Suites',      area: 'Banani',      skill: 'PLUMBING',   durationMin: 90,  windowStart: hm(12, 30), windowEnd: hm(15) },
  { id: 'J19', code: 'J-19', customer: 'Mahbub Alam',          area: 'Dhanmondi',   skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(15),     windowEnd: hm(17) },
  { id: 'J20', code: 'J-20', customer: 'Rehana Begum',         area: 'Mirpur',      skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(14),     windowEnd: hm(16, 30) },
  { id: 'J21', code: 'J-21', customer: 'Noor Mohammad',        area: 'Uttara',      skill: 'PLUMBING',   durationMin: 60,  windowStart: hm(13),     windowEnd: hm(15, 30) },
  { id: 'J22', code: 'J-22', customer: 'Sonali Tower',         area: 'Motijheel',   skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(15),     windowEnd: hm(17) },
  { id: 'J23', code: 'J-23', customer: 'Jamil Ahsan',          area: 'Mohammadpur', skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(15, 30), windowEnd: hm(17, 30) },
  { id: 'J24', code: 'J-24', customer: 'Sadia Afrin',          area: 'Bashundhara', skill: 'PLUMBING',   durationMin: 60,  windowStart: hm(9),      windowEnd: hm(11, 30) },
  { id: 'J25', code: 'J-25', customer: 'Zarif Enterprises',    area: 'Gulshan',     skill: 'AC_INSTALL', durationMin: 120, windowStart: hm(11),     windowEnd: hm(14) },
  { id: 'J26', code: 'J-26', customer: 'Rafi Newaz',           area: 'Banani',      skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(16),     windowEnd: hm(17, 45) },
  { id: 'J27', code: 'J-27', customer: 'Lubna Haque',          area: 'Dhanmondi',   skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(11),     windowEnd: hm(13, 30) },
  { id: 'J28', code: 'J-28', customer: 'Delwar Hossain',       area: 'Mirpur',      skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(9, 30),  windowEnd: hm(12, 30) },
  { id: 'J29', code: 'J-29', customer: 'Ideal Bank Motijheel', area: 'Motijheel',   skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(10),     windowEnd: hm(12, 30) },
  { id: 'J30', code: 'J-30', customer: 'Shanta Islam',         area: 'Mohammadpur', skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(10, 30), windowEnd: hm(13) },
  { id: 'J31', code: 'J-31', customer: 'Kamrul Islam',         area: 'Uttara',      skill: 'AC_SERVICE', durationMin: 60,  windowStart: hm(15, 30), windowEnd: hm(17, 30) },

  // Midday AC install squeeze: five installs, four qualified technicians, all
  // wanting the same two hours in areas that are an hour apart. Somebody loses.
  { id: 'J32', code: 'J-32', customer: 'Rupali Plaza',         area: 'Motijheel',   skill: 'AC_INSTALL', durationMin: 120, windowStart: hm(11),     windowEnd: hm(13) },
  { id: 'J33', code: 'J-33', customer: 'Anwara Khatun',        area: 'Mirpur',      skill: 'AC_INSTALL', durationMin: 110, windowStart: hm(11),     windowEnd: hm(13) },

  // Motijheel is an hour from every installer's home area and this customer is
  // only in at 11:00 sharp. Structurally each of them could do it — but not on
  // top of the day they already have.                            -> OVERLAPS_JOB
  { id: 'J38', code: 'J-38', customer: 'Dilkusha Tower',       area: 'Motijheel',   skill: 'AC_INSTALL', durationMin: 120, windowStart: hm(11),     windowEnd: hm(11, 10) },
  // Motijheel at the end of the day is where the plan runs out of road: it is
  // the far corner of the city, so a late call there only works for a plumber
  // on the latest shift with a home area close enough to get back to. Exactly
  // one technician clears that bar, and these two calls want the same slot.
  { id: 'J39', code: 'J-39', customer: 'Karnaphuli Insurance', area: 'Motijheel',   skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(16, 15), windowEnd: hm(16, 20) },
  { id: 'J40', code: 'J-40', customer: 'Shapla Chattar Clinic',area: 'Motijheel',   skill: 'PLUMBING',   durationMin: 45,  windowStart: hm(16, 15), windowEnd: hm(16, 20) },

  // ---- Deliberately unassignable, one per hard rule. --------------------
  // Nobody can reach Bashundhara before 08:20: the 08:00 starters are 25+ min
  // away and the technician who lives there starts at 09:00.  -> WINDOW_MISSED
  { id: 'J34', code: 'J-34', customer: 'Early Bird Cafe',      area: 'Bashundhara', skill: 'AC_SERVICE', durationMin: 45,  windowStart: hm(8),      windowEnd: hm(8, 20) },
  // Over three hours of work that cannot start before 15:20. Every shift ends
  // first, whichever installer takes it.                       -> OUTSIDE_SHIFT
  { id: 'J35', code: 'J-35', customer: 'Ashulia Textiles',     area: 'Uttara',      skill: 'AC_INSTALL', durationMin: 190, windowStart: hm(15, 20), windowEnd: hm(16, 20) },
  // Reachable, and the work itself fits inside a shift, but Motijheel is far
  // from every plumber's home area and the leg back lands late.
  //                                                            -> NO_RETURN_TIME
  { id: 'J36', code: 'J-36', customer: 'Dilkusha Chambers',    area: 'Motijheel',   skill: 'PLUMBING',   durationMin: 55,  windowStart: hm(16, 30), windowEnd: hm(17) },
  // No electrician is rostered today.                          -> SKILL_MISMATCH
  { id: 'J37', code: 'J-37', customer: 'Proshanti Residence',  area: 'Dhanmondi',   skill: 'ELECTRICAL', durationMin: 60,  windowStart: hm(10),     windowEnd: hm(13) },
];

/**
 * The crafted day, kept alongside the published cases because it walks through
 * every hard rule on purpose: five jobs are unassignable, one per rule, so the
 * blocked list can never be empty in a demo. It is authored against the
 * return-home rule being IN force, which is what makes J-36 a NO_RETURN_TIME
 * case rather than an ordinary one.
 */
export const CRAFTED_DAY: DayCase = {
  id: 'CRAFTED-DHAKA',
  label: 'Crafted demo day',
  today: '2026-08-30',
  areas: CRAFTED_AREAS,
  travel: CRAFTED_TRAVEL,
  technicians: TECHNICIANS,
  jobs: JOBS,
  source: 'crafted',
  defaultRules: { requireReturnHome: true },
  note: 'Hand-built so that exactly one job is blocked by each of the five hard rules.',
};
