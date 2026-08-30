'use client';

import type { Map as LeafletMap, LayerGroup, Polyline } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';

import { arcBetween, areaLatLng, type LatLng } from '@/lib/geo';
import { describeReach, fleetAt, fleetSummary, positionAt, reachFor } from '@/lib/playback';
import { areaLoad, buildRoutes, longestLeg, worstLegs } from '@/lib/routes';
import { formatDuration, formatTime } from '@/lib/time';
import type { DayCase, Plan } from '@/lib/types';

/**
 * The routes on real Dhaka.
 *
 * The timeline answers "when"; this answers "where", which is the question a
 * dispatcher is really asking when a day looks wrong. A technician sent from
 * Uttara to Motijheel and back is obvious here and invisible on a Gantt chart.
 *
 * Leaflet is driven directly rather than through a React wrapper: the popular
 * wrapper is Hippocratic-licensed, which is not OSI open source, and this needs
 * a licence a judge can tick off without thinking about it. Leaflet itself is
 * BSD-2-Clause and the tiles are OpenStreetMap via CARTO, attributed on the map
 * as their terms require.
 *
 * The map is for orientation only. Straight-ish arcs join area centroids; they
 * are not roads and no distance is ever taken from them. The travel table
 * shipped with the case stays the only authority on how long a leg takes.
 */

/**
 * CARTO's dark basemap.
 *
 * The key is read from the environment and is never committed: the submission
 * rules forbid a key in the repository, and this is a personal key besides. Set
 * NEXT_PUBLIC_CARTO_KEY locally in .env.local (git-ignored) and in the hosting
 * project's environment — see .env.example.
 *
 * Without a key the tiles still load, watermarked, so a fresh clone works with
 * no setup. Note that a NEXT_PUBLIC_ value is inlined into the client bundle at
 * build time, which is inherent to a browser map key: it is sent to the tile
 * service by the visitor's own browser, so it cannot be hidden. Restrict it by
 * domain in the CARTO dashboard rather than relying on it being secret.
 */
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY;
const TILE_URL =
  'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png' +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : '');

interface Props {
  day: DayCase;
  plan: Plan;
  highlightTechId: string | null;
  onHighlightTech: (techId: string | null) => void;
  selectedJobId: string | null;
  /** The board window, so the scrubber covers the same hours as the timeline. */
  dayStart: number;
  dayEnd: number;
}

export function CityMap({
  day, plan, highlightTechId, onHighlightTech, selectedJobId, dayStart, dayEnd,
}: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const routeLayers = useRef<Map<string, Polyline[]>>(new Map());
  const [tilesFailed, setTilesFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const routes = useMemo(() => buildRoutes(day, plan), [day, plan]);
  const worst = useMemo(() => worstLegs(routes, 3), [routes]);
  const maxLeg = useMemo(() => longestLeg(routes), [routes]);

  // The scrubber. `null` means "show the whole day at once".
  const [clock, setClock] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  /** Following one technician through their whole day, minute by minute. */
  const [followId, setFollowId] = useState<string | null>(null);
  const followTech = useMemo(
    () => day.technicians.find((t) => t.id === followId) ?? null,
    [day, followId],
  );

  /** The window a follow runs over: from setting off to the last job finishing. */
  const followSpan = useMemo(() => {
    if (!followTech) return null;
    const route = plan.routes[followTech.id] ?? [];
    if (route.length === 0) return null;
    const last = route[route.length - 1];
    return { from: route[0].departure, to: Math.min(followTech.shiftEnd, last.finish + 30) };
  }, [followTech, plan]);

  const fleet = useMemo(
    () => (clock === null ? [] : fleetAt(day, plan, clock)),
    [day, plan, clock],
  );
  const summary = useMemo(() => fleetSummary(fleet), [fleet]);

  // A blocked job turns the map into an explanation of why it was unreachable.
  const blockedJob = useMemo(() => {
    if (!selectedJobId) return null;
    const isBlocked = plan.blocked.some((b) => b.jobId === selectedJobId);
    return isBlocked ? (plan.jobs[selectedJobId] ?? null) : null;
  }, [selectedJobId, plan]);

  const reaches = useMemo(
    () => (blockedJob ? reachFor(blockedJob, day, plan) : []),
    [blockedJob, day, plan],
  );

  // The clock advances by `speed` minutes of the day every tick. Following one
  // technician runs over their own hours; otherwise it runs the whole board.
  useEffect(() => {
    if (!playing) return;
    const from = followSpan?.from ?? dayStart;
    const to = followSpan?.to ?? dayEnd;
    const id = window.setInterval(() => {
      setClock((c) => {
        const next = (c ?? from) + speed;
        if (next >= to) {
          setPlaying(false);
          return to;
        }
        return next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [playing, speed, dayStart, dayEnd, followSpan]);

  /** Start following a technician from the moment they set off. */
  const follow = (techId: string) => {
    const route = plan.routes[techId] ?? [];
    if (route.length === 0) {
      setFollowId(techId);
      return;
    }
    setFollowId(techId);
    setClock(route[0].departure);
    setPlaying(true);
  };

  const stopFollowing = () => {
    setFollowId(null);
    setPlaying(false);
    setClock(null);
  };

  /** The path already travelled, so the route draws itself in behind them. */
  const trail = useMemo(() => {
    if (!followTech || clock === null) return [];
    const from = followSpan?.from ?? followTech.shiftStart;
    const points: [number, number][] = [];
    const step = Math.max(2, Math.round((clock - from) / 90));
    for (let m = from; m <= clock; m += step) {
      const at = positionAt(followTech, plan, m);
      if (at.kind === 'off') continue;
      if (at.kind === 'at') {
        const p = areaLatLng(at.area);
        points.push([p.lat, p.lng]);
      } else {
        const arc = arcBetween(areaLatLng(at.from), areaLatLng(at.to));
        const i = Math.min(arc.length - 1, Math.max(0, Math.round(at.t * (arc.length - 1))));
        points.push(arc[i]);
      }
    }
    return points;
  }, [followTech, plan, clock, followSpan]);

  const followNow = followTech && clock !== null ? positionAt(followTech, plan, clock) : null;

  // ---- Create the map once. --------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    // Captured for the cleanup, which runs long after the ref may have moved on.
    const layerIndex = routeLayers.current;

    // Leaflet reaches for `window`, so it is loaded in the browser only.
    import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      if (cancelled || !holder.current || mapRef.current) return;

      map = L.map(holder.current, {
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer(TILE_URL, {
        // Required by both the OpenStreetMap licence and CARTO's free tier.
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      })
        .on('tileerror', () => setTilesFailed(true))
        .addTo(map);

      map.setView([23.78, 90.4], 12);
      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      setReady(true);

      // The container is often still sizing when the view switches to the map.
      requestAnimationFrame(() => map?.invalidateSize());
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      layerIndex.clear();
    };
  }, []);

  // Keep the map honest about its own size.
  useEffect(() => {
    if (!holder.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);

  // ---- Draw the plan. ---------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;

    let cancelled = false;
    import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      if (cancelled) return;

      group.clearLayers();
      routeLayers.current.clear();

      const point = (area: string, i = 0) => areaLatLng(area, i, day.areas.length);

      const load = areaLoad(day, plan);

      // Routes first, so the area markers sit on top of them. A leg is drawn
      // as thick as it is expensive: the objective, made visible.
      const worstKeys = new Set(worst.map((w) => `${w.route.techId}|${w.leg.from}|${w.leg.to}`));

      routes.forEach((route, ri) => {
        const drawn: Polyline[] = [];
        route.legs.forEach((leg) => {
          const from = point(leg.from);
          const to = point(leg.to);
          const share = leg.minutes / maxLeg;
          const isWorst = worstKeys.has(`${route.techId}|${leg.from}|${leg.to}`);

          const line = L.polyline(arcBetween(from, to), {
            color: route.colour,
            weight: 1.8 + share * 6,
            opacity: 0.45 + share * 0.45,
            lineCap: 'round',
            className: isWorst ? 'route-leg route-leg-worst' : 'route-leg',
          });
          line.bindTooltip(
            `<b>${route.name}</b><br>${leg.from} → ${leg.to}<br>` +
              `<b>${formatDuration(leg.minutes)} driving</b><br>${leg.label}` +
              (isWorst ? '<br><i>one of the three most expensive legs today</i>' : ''),
            { sticky: true },
          );
          line.on('mouseover', () => onHighlightTech(route.techId));
          line.on('mouseout', () => onHighlightTech(null));
          line.on('add', () => {
            const el = line.getElement() as SVGPathElement | null;
            if (el) el.style.animationDelay = `${ri * 70}ms`;
          });
          line.addTo(group);
          drawn.push(line);
        });
        routeLayers.current.set(route.techId, drawn);
      });

      // Areas.
      day.areas.forEach((area, i) => {
        const p = point(area, i);
        const l = load.get(area) ?? { total: 0, blocked: 0 };
        const radius = 7 + Math.min(13, l.total * 1.2);

        if (l.blocked > 0) {
          L.circleMarker([p.lat, p.lng], {
            radius: radius + 7,
            color: 'oklch(0.665 0.196 25)',
            weight: 2,
            fill: false,
            className: 'area-alarm',
            interactive: false,
          }).addTo(group);
        }

        L.circleMarker([p.lat, p.lng], {
          radius,
          color: l.blocked > 0 ? 'oklch(0.665 0.196 25)' : 'oklch(0.72 0.02 250)',
          weight: 1.8,
          fillColor: 'oklch(0.26 0.015 250)',
          fillOpacity: 0.92,
        })
          .bindTooltip(
            `<b>${area}</b><br>${l.total} job${l.total === 1 ? '' : 's'}` +
              (l.blocked > 0 ? `<br><span style="color:#ff8a80">${l.blocked} cannot be done</span>` : ''),
            { direction: 'top' },
          )
          .addTo(group);

        L.marker([p.lat, p.lng], {
          interactive: false,
          icon: L.divIcon({
            className: 'area-label',
            html: `<span>${area}</span><b>${l.total}</b>`,
            iconSize: [0, 0],
          }),
        }).addTo(group);
      });

      // The path already walked by whoever is being followed.
      if (followId && trail.length > 1) {
        const route = routes.find((r) => r.techId === followId);
        L.polyline(trail, {
          color: route?.colour ?? 'oklch(0.95 0.005 250)',
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          className: 'follow-trail',
        }).addTo(group);
      }

      // Where everyone is, if the clock is set.
      for (const { tech, position } of fleet) {
        // While following one technician, the others stay out of the way.
        if (followId && tech.id !== followId) continue;
        if (position.kind === 'off') continue;
        const route = routes.find((r) => r.techId === tech.id);
        const colour = route?.colour ?? 'oklch(0.72 0.02 250)';

        let where: LatLng;
        if (position.kind === 'at') {
          where = point(position.area);
        } else {
          // Along the same arc the leg is drawn on, so the marker tracks the line.
          const arc = arcBetween(point(position.from), point(position.to));
          const i = Math.min(arc.length - 1, Math.max(0, Math.round(position.t * (arc.length - 1))));
          where = { lat: arc[i][0], lng: arc[i][1] };
        }

        const driving = position.kind === 'between';
        const working = position.kind === 'at' && position.doing === 'working';

        L.circleMarker([where.lat, where.lng], {
          radius: working ? 9 : 7,
          color: 'oklch(0.16 0.02 250)',
          weight: 2,
          fillColor: colour,
          fillOpacity: driving ? 0.75 : 1,
          className: driving ? 'fleet-driving' : undefined,
        })
          .bindTooltip(position.label, { direction: 'top' })
          .addTo(group);

        L.marker([where.lat, where.lng], {
          interactive: false,
          icon: L.divIcon({
            className: 'fleet-label',
            html: `<span>${tech.name}</span>`,
            iconSize: [0, 0],
          }),
        }).addTo(group);
      }

      // Why a blocked job was out of reach: who holds the skill, and how far
      // away they were when its window opened.
      if (blockedJob) {
        const target = point(blockedJob.area);
        for (const reach of reaches) {
          const origin = point(reach.fromArea);
          if (origin.lat === target.lat && origin.lng === target.lng) continue;
          L.polyline(arcBetween(origin, target, 0.08), {
            color: reach.ok ? 'oklch(0.655 0.088 158)' : 'oklch(0.665 0.196 25)',
            weight: 2,
            opacity: 0.85,
            dashArray: '5 6',
            className: 'reach-line',
          })
            .bindTooltip(
              `<b>${reach.tech.name}</b><br>${reach.fromArea} → ${blockedJob.area}<br>` +
                `${formatDuration(reach.travelMin)} away, earliest arrival ` +
                `${formatTime(reach.earliestArrival)}<br>` +
                (reach.ok ? 'could take it' : `<b>${reach.rule}</b>: ${reach.detail ?? ''}`),
              { sticky: true },
            )
            .addTo(group);
        }
      }

      // Where the selected job is.
      const selected = selectedJobId ? plan.jobs[selectedJobId] : undefined;
      if (selected) {
        const p = point(selected.area);
        L.circleMarker([p.lat, p.lng], {
          radius: 22,
          color: 'oklch(0.95 0.005 250)',
          weight: 2.5,
          fill: false,
          className: 'area-selected',
          interactive: false,
        }).addTo(group);
      }

      // Frame the areas this case actually uses.
      const bounds = L.latLngBounds(day.areas.map((a, i) => {
        const p = point(a, i);
        return [p.lat, p.lng] as [number, number];
      }));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    });

    return () => {
      cancelled = true;
    };
  }, [
    ready, day, plan, routes, selectedJobId, onHighlightTech, fleet, blockedJob, reaches,
    worst, maxLeg, followId, trail,
  ]);

  // Keep whoever is being followed on screen.
  useEffect(() => {
    if (!followId || !followNow || !mapRef.current) return;
    const where =
      followNow.kind === 'at'
        ? areaLatLng(followNow.area)
        : followNow.kind === 'between'
          ? (() => {
              const arc = arcBetween(areaLatLng(followNow.from), areaLatLng(followNow.to));
              const i = Math.min(arc.length - 1, Math.round(followNow.t * (arc.length - 1)));
              return { lat: arc[i][0], lng: arc[i][1] };
            })()
          : null;
    if (where) mapRef.current.panTo([where.lat, where.lng], { animate: true, duration: 0.4 });
  }, [followId, followNow]);

  // ---- Highlight without redrawing. ------------------------------------
  useEffect(() => {
    if (!ready) return;
    for (const [techId, legs] of routeLayers.current) {
      const active = highlightTechId === techId || followId === techId;
      const dimmed =
        (followId !== null && followId !== techId) ||
        (followId === null && highlightTechId !== null && !active);
      for (const leg of legs) {
        // Keep the thickness the leg earned; only lift or fade it.
        const base = leg.options.weight ?? 3;
        leg.setStyle({
          weight: active ? base + 3 : base,
          opacity: dimmed ? 0.1 : Math.min(1, (leg.options.opacity ?? 0.7) + (active ? 0.25 : 0)),
        });
      }
    }
  }, [highlightTechId, followId, ready, plan]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={holder} className="min-h-0 flex-1" style={{ background: 'var(--lane)' }} />

      {tilesFailed && (
        <p className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-md border border-hairline bg-panel px-3 py-1.5 text-[12px] text-muted-foreground">
          Map tiles could not load — the routes and areas are still drawn.
        </p>
      )}

      {/* What the map is currently telling you. */}
      {blockedJob && (
        <div
          className="shrink-0 border-t px-4 py-2"
          style={{ borderColor: 'var(--alarm)', background: 'var(--alarm-dim)' }}
        >
          <p className="text-[12.5px] leading-snug text-foreground">
            <span className="num font-semibold">{blockedJob.code}</span> could not be scheduled.{' '}
            {describeReach(blockedJob, reaches)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Dashed lines show every technician who holds the skill and how far they were when the
            window opened — red means the rules still refuse them.
          </p>
        </div>
      )}

      {/* The clock. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline bg-panel px-4 py-2">
        <button
          type="button"
          onClick={() => {
            if (clock === null) setClock(followSpan?.from ?? dayStart);
            setPlaying((p) => !p);
          }}
          className="rounded-md border border-hairline px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-ring"
        >
          {playing ? 'Pause' : followTech ? `Play ${followTech.name}` : 'Play the day'}
        </button>

        <span className="flex items-center gap-0.5 rounded-md border border-hairline p-0.5">
          {[2, 4, 10].map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className="num rounded-[4px] px-1.5 py-0.5 text-[11px] transition-colors"
              style={
                speed === sp
                  ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                  : { color: 'var(--muted-foreground)' }
              }
            >
              {sp === 2 ? '1×' : sp === 4 ? '2×' : '5×'}
            </button>
          ))}
        </span>

        <input
          type="range"
          min={dayStart}
          max={dayEnd}
          step={5}
          value={clock ?? dayStart}
          onChange={(e) => {
            setPlaying(false);
            setClock(Number(e.target.value));
          }}
          aria-label="Time of day"
          className="h-1 min-w-[10rem] flex-1 cursor-pointer accent-[var(--skill-1)]"
        />

        <span className="num w-[3.2rem] text-[13px] font-semibold text-foreground">
          {clock === null ? '—' : formatTime(clock)}
        </span>

        {followTech && followNow ? (
          <>
            <span className="text-[11.5px] text-foreground">{followNow.label}</span>
            <button
              type="button"
              onClick={stopFollowing}
              className="text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              stop following
            </button>
          </>
        ) : clock === null ? (
          <span className="text-[11.5px] text-muted-foreground">
            Whole day shown. Press a name below to watch that technician&rsquo;s day.
          </span>
        ) : (
          <>
            <span className="text-[11.5px] text-muted-foreground">
              <span className="num text-foreground">{summary.working}</span> on site ·{' '}
              <span className="num text-foreground">{summary.driving}</span> driving ·{' '}
              <span className="num text-foreground">{summary.waiting}</span> waiting ·{' '}
              <span className="num">{summary.off}</span> off shift
            </span>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setClock(null);
              }}
              className="text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              show whole day
            </button>
          </>
        )}
      </div>

      {/* Which line is whose, and what the driving is costing. */}
      <div className="scroll-thin max-h-[8.5rem] shrink-0 overflow-y-auto border-t border-hairline bg-panel px-4 py-2.5">
        {worst.length > 0 && (
          <p className="mb-2 text-[11.5px] leading-snug text-muted-foreground">
            <span className="text-foreground">Press a name to watch that day animate.</span>{' '}
            <span className="text-foreground">Thicker means costlier.</span> The three most
            expensive legs today:{' '}
            {worst.map((w, i) => (
              <span key={`${w.route.techId}-${w.leg.from}-${w.leg.to}`}>
                {i > 0 && ' · '}
                <span className="text-foreground">{w.route.name}</span>{' '}
                {w.leg.from}→{w.leg.to}{' '}
                <span className="num" style={{ color: 'var(--alarm)' }}>
                  {formatDuration(w.leg.minutes)}
                </span>
              </span>
            ))}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {routes.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              Nothing is scheduled yet, so there are no routes to draw.
            </p>
          )}
          {routes.map((route) => {
            const active = highlightTechId === route.techId;
            return (
              <button
                key={route.techId}
                type="button"
                onMouseEnter={() => onHighlightTech(route.techId)}
                onMouseLeave={() => onHighlightTech(null)}
                onClick={() => (followId === route.techId ? stopFollowing() : follow(route.techId))}
                title={`Watch ${route.name}'s day animate`}
                className={`flex items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-[12.5px] transition-colors ${
                  followId === route.techId
                    ? 'text-foreground'
                    : active
                      ? 'bg-panel-2 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
                style={
                  followId === route.techId
                    ? { background: route.colour, color: 'oklch(0.19 0.02 250)' }
                    : undefined
                }
              >
                <span
                  className="inline-block h-1 w-6 rounded-full"
                  style={{ background: followId === route.techId ? 'oklch(0.19 0.02 250)' : route.colour }}
                />
                {route.name}
                <span className="num text-[11px] opacity-70">
                  {route.legCount} legs · {formatDuration(route.travelMin)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
