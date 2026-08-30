import { technicianColour } from './geo';
import { travelMinutes } from './travel';
import { formatTime } from './time';
import type { Area, DayCase, Plan } from './types';

/**
 * A plan expressed as journeys rather than as a schedule — one ordered list of
 * stops per technician, which is what the map draws.
 *
 * Kept out of the map component so it can be tested without a browser: the map
 * itself is Leaflet driven imperatively, and there is nothing to assert on in
 * its markup until it has run in a real DOM.
 */
export interface MapLeg {
  from: Area;
  to: Area;
  minutes: number;
  /** What the technician is going to do when they arrive. */
  label: string;
}

export interface MapRoute {
  techId: string;
  name: string;
  colour: string;
  stops: { area: Area; label: string; jobId: string | null }[];
  /** Legs actually driven — stops in the same area are not a journey. */
  legs: MapLeg[];
  legCount: number;
  travelMin: number;
}

export function buildRoutes(day: DayCase, plan: Plan): MapRoute[] {
  return day.technicians
    .map((tech, index): MapRoute | null => {
      const assignments = plan.routes[tech.id] ?? [];
      if (assignments.length === 0) return null;

      const stops: MapRoute['stops'] = [
        {
          area: tech.homeArea,
          label: `${tech.name} starts ${formatTime(tech.shiftStart)}`,
          jobId: null,
        },
        ...assignments.map((a) => {
          const job = plan.jobs[a.jobId];
          return {
            area: job?.area ?? tech.homeArea,
            label: `${job?.code ?? a.jobId} · ${formatTime(a.start)}–${formatTime(a.finish)}`,
            jobId: a.jobId,
          };
        }),
      ];

      // The leg home is only part of the journey when the rules require it.
      if (plan.rules.requireReturnHome) {
        stops.push({ area: tech.homeArea, label: `${tech.name} home`, jobId: null });
      }

      // Leg i joins stop i to stop i+1. The minutes come from the plan, never
      // from the map's coordinates — the travel table is the only authority.
      const legs: MapLeg[] = [];
      for (let i = 0; i < stops.length - 1; i++) {
        if (stops[i].area === stops[i + 1].area) continue;
        const minutes =
          i < assignments.length
            ? assignments[i].travelMin
            : travelMinutes(plan.travel, stops[i].area, stops[i + 1].area);
        legs.push({
          from: stops[i].area,
          to: stops[i + 1].area,
          minutes,
          label: stops[i + 1].label,
        });
      }

      return {
        techId: tech.id,
        name: tech.name,
        colour: technicianColour(index, day.technicians.length),
        stops,
        legs,
        legCount: legs.length,
        travelMin: assignments.reduce((n, a) => n + a.travelMin, 0),
      };
    })
    .filter((r): r is MapRoute => r !== null);
}

/**
 * The legs costing the most driving, worst first.
 *
 * This is the objective made visible: the header says total travel, and these
 * are the individual trips that total is mostly made of. A dispatcher looking
 * to save an hour starts here.
 */
export function worstLegs(
  routes: MapRoute[],
  limit = 3,
): { route: MapRoute; leg: MapLeg }[] {
  return routes
    .flatMap((route) => route.legs.map((leg) => ({ route, leg })))
    .sort((a, b) => b.leg.minutes - a.leg.minutes)
    .slice(0, limit);
}

/** The longest single leg on the board, used to scale how legs are drawn. */
export function longestLeg(routes: MapRoute[]): number {
  return routes.reduce(
    (max, r) => r.legs.reduce((m, l) => Math.max(m, l.minutes), max),
    1,
  );
}

/** Jobs sitting in each area, and how many of them nobody can take. */
export function areaLoad(day: DayCase, plan: Plan): Map<Area, { total: number; blocked: number }> {
  const load = new Map<Area, { total: number; blocked: number }>();
  for (const area of day.areas) load.set(area, { total: 0, blocked: 0 });

  for (const job of Object.values(plan.jobs)) {
    const entry = load.get(job.area) ?? { total: 0, blocked: 0 };
    entry.total += 1;
    load.set(job.area, entry);
  }
  for (const b of plan.blocked) {
    const job = plan.jobs[b.jobId];
    if (!job) continue;
    const entry = load.get(job.area) ?? { total: 0, blocked: 0 };
    entry.blocked += 1;
    load.set(job.area, entry);
  }
  return load;
}
