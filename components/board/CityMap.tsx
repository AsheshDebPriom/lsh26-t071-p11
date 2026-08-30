'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

import { areaPoint, RIVER_PATH, technicianColour } from '@/lib/geo';
import { formatDuration, formatTime } from '@/lib/time';
import type { Area, DayCase, Plan } from '@/lib/types';

/**
 * The city, drawn from the plan.
 *
 * The timeline answers "when"; this answers "where", which is the question a
 * dispatcher is really asking when a day looks wrong. A route that doubles back
 * across Dhaka is obvious here and invisible on a Gantt chart.
 *
 * Pure SVG on the schematic layout in lib/geo.ts. No tiles, no map library, no
 * network — the travel table remains the only authority on distance, and this
 * never pretends otherwise.
 */

const W = 760;
const H = 1000;

interface Props {
  day: DayCase;
  plan: Plan;
  /** Technician the pointer is over, or the one selected in the timeline. */
  highlightTechId: string | null;
  onHighlightTech: (techId: string | null) => void;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
}

export function CityMap({
  day, plan, highlightTechId, onHighlightTech, selectedJobId, onSelectJob,
}: Props) {
  const px = (a: Area, i = 0) => {
    const p = areaPoint(a, i, day.areas.length);
    return { x: p.x * W, y: p.y * H };
  };

  /** Jobs sitting in each area, so a node can be sized by how busy it is. */
  const areaLoad = useMemo(() => {
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
  }, [day, plan]);

  /** One polyline per technician, home → job → job → … */
  const routes = useMemo(() => {
    return day.technicians
      .map((tech, index) => {
        const assignments = plan.routes[tech.id] ?? [];
        if (assignments.length === 0) return null;

        const stops = [
          { area: tech.homeArea, label: `${tech.name} starts ${formatTime(tech.shiftStart)}`, jobId: null as string | null },
          ...assignments.map((a) => {
            const job = plan.jobs[a.jobId];
            return {
              area: job?.area ?? tech.homeArea,
              label: `${job?.code ?? a.jobId} · ${formatTime(a.start)}`,
              jobId: a.jobId,
            };
          }),
        ];
        if (plan.rules.requireReturnHome) {
          stops.push({ area: tech.homeArea, label: `${tech.name} home`, jobId: null });
        }

        return {
          tech,
          colour: technicianColour(index, day.technicians.length),
          stops,
          d: curveThrough(stops.map((s) => px(s.area))),
          travelMin: assignments.reduce((n, a) => n + a.travelMin, 0),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, plan]);

  const dimmed = highlightTechId !== null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto h-full max-h-[calc(100dvh-20rem)] w-auto"
          role="img"
          aria-label="Schematic map of Dhaka showing each technician's route"
        >
          <defs>
            <radialGradient id="cityGlow" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="oklch(0.30 0.03 250)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="oklch(0.18 0.012 250)" stopOpacity="0" />
            </radialGradient>
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="url(#cityGlow)" />

          {/* The river, for orientation only. */}
          <path
            d={scalePath(RIVER_PATH, W, H)}
            fill="none"
            stroke="oklch(0.42 0.05 235)"
            strokeOpacity="0.5"
            strokeWidth="22"
            strokeLinecap="round"
          />

          {/* Every leg the plan actually drives. */}
          <g>
            {routes.map((route, i) => {
              const active = highlightTechId === route.tech.id;
              return (
                <motion.path
                  key={route.tech.id}
                  d={route.d}
                  fill="none"
                  stroke={route.colour}
                  strokeWidth={active ? 5 : 2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={active ? 'url(#routeGlow)' : undefined}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: dimmed ? (active ? 1 : 0.12) : 0.75,
                  }}
                  transition={{
                    pathLength: { duration: 1.1, delay: 0.05 * i, ease: 'easeInOut' },
                    opacity: { duration: 0.25 },
                  }}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => onHighlightTech(route.tech.id)}
                  onMouseLeave={() => onHighlightTech(null)}
                />
              );
            })}
          </g>

          {/* Stops on the highlighted route, so the order is readable. */}
          {routes
            .filter((r) => r.tech.id === highlightTechId)
            .map((route) =>
              route.stops.map((stop, i) => {
                const p = px(stop.area);
                return (
                  <motion.g
                    key={`${route.tech.id}-${i}`}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.03 * i }}
                    style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                  >
                    <circle cx={p.x} cy={p.y} r={13} fill={route.colour} />
                    <text
                      x={p.x}
                      y={p.y + 4.5}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill="oklch(0.17 0.02 250)"
                    >
                      {i === 0 ? 'H' : i}
                    </text>
                  </motion.g>
                );
              }),
            )}

          {/* The areas themselves. */}
          {day.areas.map((area, i) => {
            const p = px(area, i);
            const load = areaLoad.get(area) ?? { total: 0, blocked: 0 };
            const r = 7 + Math.min(11, load.total * 1.1);
            return (
              <g key={area}>
                {load.blocked > 0 && (
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 8}
                    fill="none"
                    stroke="var(--alarm)"
                    strokeWidth="2"
                    initial={{ opacity: 0.7, scale: 0.85 }}
                    animate={{ opacity: [0.7, 0, 0.7], scale: [0.85, 1.25, 0.85] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="oklch(0.26 0.015 250)"
                  stroke={load.blocked > 0 ? 'var(--alarm)' : 'oklch(0.55 0.02 250)'}
                  strokeWidth="1.6"
                />
                <text
                  x={p.x}
                  y={p.y - r - 8}
                  textAnchor="middle"
                  fontSize="17"
                  fontWeight="600"
                  fill="oklch(0.93 0.005 250)"
                >
                  {area}
                </text>
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="700"
                  fill="oklch(0.88 0.005 250)"
                >
                  {load.total}
                </text>
              </g>
            );
          })}

          {/* Where the selected job is. */}
          {selectedJobId && plan.jobs[selectedJobId] && (
            <SelectedMarker point={px(plan.jobs[selectedJobId].area)} />
          )}
        </svg>
      </div>

      {/* Which line is whose. */}
      <div className="scroll-thin max-h-[8.5rem] shrink-0 overflow-y-auto border-t border-hairline bg-panel px-4 py-2.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {routes.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              Nothing is scheduled yet, so there are no routes to draw.
            </p>
          )}
          {routes.map((route) => {
            const active = highlightTechId === route.tech.id;
            return (
              <button
                key={route.tech.id}
                type="button"
                onMouseEnter={() => onHighlightTech(route.tech.id)}
                onMouseLeave={() => onHighlightTech(null)}
                onClick={() => onSelectJob(null)}
                className={`flex items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-[12.5px] transition-colors ${
                  active ? 'bg-panel-2 text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span
                  className="inline-block h-1 w-6 rounded-full"
                  style={{ background: route.colour }}
                />
                {route.tech.name}
                <span className="num text-[11px] opacity-70">
                  {route.stops.length - (plan.rules.requireReturnHome ? 2 : 1)} stops ·{' '}
                  {formatDuration(route.travelMin)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SelectedMarker({ point }: { point: { x: number; y: number } }) {
  return (
    <motion.circle
      cx={point.x}
      cy={point.y}
      r={22}
      fill="none"
      stroke="oklch(0.95 0.005 250)"
      strokeWidth="2.5"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: [0.9, 0.35, 0.9], scale: 1 }}
      transition={{ opacity: { duration: 1.6, repeat: Infinity }, scale: { duration: 0.25 } }}
      style={{ transformOrigin: `${point.x}px ${point.y}px` }}
    />
  );
}

/**
 * A gentle curve through the stops rather than straight segments: real vehicles
 * do not turn on a point, and the eye follows a curve through a crowded map far
 * more easily than a polyline.
 */
function curveThrough(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // Offset the control point perpendicular to the leg, so overlapping legs
    // between the same two areas stay separable.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(38, len * 0.16);
    const cx = mx + (-dy / len) * bow;
    const cy = my + (dx / len) * bow;
    d += ` Q ${cx} ${cy} ${b.x} ${b.y}`;
  }
  return d;
}

/** The river is authored in fractions; stretch it to the viewBox. */
function scalePath(path: string, w: number, h: number): string {
  let axis = 0;
  return path.replace(/-?\d*\.?\d+/g, (n) => {
    const scaled = parseFloat(n) * (axis % 2 === 0 ? w : h);
    axis += 1;
    return scaled.toFixed(1);
  });
}
