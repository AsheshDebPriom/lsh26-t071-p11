import { technicianColour } from './geo';
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
export interface MapRoute {
  techId: string;
  name: string;
  colour: string;
  stops: { area: Area; label: string; jobId: string | null }[];
  /** Legs actually driven — stops in the same area are not a journey. */
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

      let legCount = 0;
      for (let i = 0; i < stops.length - 1; i++) {
        if (stops[i].area !== stops[i + 1].area) legCount++;
      }

      return {
        techId: tech.id,
        name: tech.name,
        colour: technicianColour(index, day.technicians.length),
        stops,
        legCount,
        travelMin: assignments.reduce((n, a) => n + a.travelMin, 0),
      };
    })
    .filter((r): r is MapRoute => r !== null);
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
