'use client';

import type { Map as LeafletMap, LayerGroup, Polyline } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';

import { arcBetween, areaLatLng } from '@/lib/geo';
import { areaLoad, buildRoutes } from '@/lib/routes';
import { formatDuration } from '@/lib/time';
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
  onSelectJob: (jobId: string | null) => void;
}

export function CityMap({
  day, plan, highlightTechId, onHighlightTech, selectedJobId, onSelectJob,
}: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const routeLayers = useRef<Map<string, Polyline[]>>(new Map());
  const [tilesFailed, setTilesFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const routes = useMemo(() => buildRoutes(day, plan), [day, plan]);

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

      // Routes first, so the area markers sit on top of them.
      routes.forEach((route, ri) => {
        const legs: Polyline[] = [];
        for (let i = 0; i < route.stops.length - 1; i++) {
          const from = point(route.stops[i].area);
          const to = point(route.stops[i + 1].area);
          if (from.lat === to.lat && from.lng === to.lng) continue; // same area, no leg

          const line = L.polyline(arcBetween(from, to), {
            color: route.colour,
            weight: 3,
            opacity: 0.8,
            lineCap: 'round',
            className: 'route-leg',
          });
          line.bindTooltip(
            `<b>${route.name}</b><br>${route.stops[i].area} → ${route.stops[i + 1].area}<br>${route.stops[i + 1].label}`,
            { sticky: true },
          );
          line.on('mouseover', () => onHighlightTech(route.techId));
          line.on('mouseout', () => onHighlightTech(null));
          // Stagger the draw so the fleet appears route by route.
          line.on('add', () => {
            const el = line.getElement() as SVGPathElement | null;
            if (el) el.style.animationDelay = `${ri * 70}ms`;
          });
          line.addTo(group);
          legs.push(line);
        }
        routeLayers.current.set(route.techId, legs);
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
  }, [ready, day, plan, routes, selectedJobId, onHighlightTech]);

  // ---- Highlight without redrawing. ------------------------------------
  useEffect(() => {
    if (!ready) return;
    for (const [techId, legs] of routeLayers.current) {
      const active = highlightTechId === techId;
      const dimmed = highlightTechId !== null && !active;
      for (const leg of legs) {
        leg.setStyle({ weight: active ? 6 : 3, opacity: dimmed ? 0.12 : 0.85 });
      }
    }
  }, [highlightTechId, ready, plan]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={holder} className="min-h-0 flex-1" style={{ background: 'var(--lane)' }} />

      {tilesFailed && (
        <p className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-md border border-hairline bg-panel px-3 py-1.5 text-[12px] text-muted-foreground">
          Map tiles could not load — the routes and areas are still drawn.
        </p>
      )}

      {/* Which line is whose. */}
      <div className="scroll-thin max-h-[8.5rem] shrink-0 overflow-y-auto border-t border-hairline bg-panel px-4 py-2.5">
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
                onClick={() => onSelectJob(null)}
                className={`flex items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-[12.5px] transition-colors ${
                  active ? 'bg-panel-2 text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span
                  className="inline-block h-1 w-6 rounded-full"
                  style={{ background: route.colour }}
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
