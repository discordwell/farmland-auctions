"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Listing, ListingStatus } from "../data";

type LeafletMapProps = {
  listings: Listing[];
  lotNumberFor: (id: string) => number;
};

const STATUS_COLOR: Record<ListingStatus, string> = {
  "For Sale": "#1c3a2b",
  Pending: "#b9893a",
  Sold: "#8a8771",
  Wanted: "#6b4d2c",
  Lease: "#4a6a3a"
};

function formatLotNumber(index: number) {
  return String(index + 1).padStart(3, "0");
}

export function LeafletMap({ listings, lotNumberFor }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerLayerRef = useRef<unknown>(null);

  const points = useMemo(
    () =>
      listings
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) => ({
          id: l.id,
          slug: l.slug,
          lat: l.latitude as number,
          lon: l.longitude as number,
          title: l.title,
          rm: l.rm,
          status: l.status as ListingStatus,
          acres: l.acres,
          lotNo: formatLotNumber(lotNumberFor(l.id))
        })),
    [listings, lotNumberFor]
  );

  useEffect(() => {
    let cancelled = false;
    let map: unknown = null;
    let layer: unknown = null;

    async function init() {
      if (!containerRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      await import("leaflet/dist/leaflet.css");

      if (mapRef.current) {
        map = mapRef.current;
      } else {
        map = L.map(containerRef.current, {
          center: [52, -106],
          zoom: 6,
          minZoom: 5,
          maxZoom: 17,
          scrollWheelZoom: false,
          zoomControl: true,
          attributionControl: true
        });
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye",
            maxZoom: 17
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ).addTo(map as any);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Labels &copy; Esri",
            maxZoom: 17,
            opacity: 0.85
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ).addTo(map as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setMaxBounds([
          [48, -112],
          [61, -100]
        ]);
        mapRef.current = map;
        // Invalidate size after a layout settle in case the container resized after mount
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (map as any).invalidateSize();
        }, 100);
      }

      // Clear existing markers
      if (markerLayerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (markerLayerRef.current as any).remove();
      }
      layer = L.layerGroup();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any).addTo(map);
      markerLayerRef.current = layer;

      points.forEach((p) => {
        const color = STATUS_COLOR[p.status] ?? "#1c3a2b";
        const icon = L.divIcon({
          className: "lot-marker",
          html: `
            <span class="lot-marker-dot" style="background:${color}"></span>
            <span class="lot-marker-label">
              <span class="lot-marker-num">${p.lotNo}</span>
              <span class="lot-marker-rm">${p.rm.replace(/^RM\s*/i, "").replace(/\s+No\.\s*\d+/i, "")}</span>
            </span>
          `,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });
        const marker = L.marker([p.lat, p.lon], { icon }).bindPopup(
          `<div class="lot-popup">
            <strong>Lot ${p.lotNo}</strong>
            <span>${p.title}</span>
            <span class="meta">${p.rm} · ${p.acres.toLocaleString()} ac · ${p.status}</span>
            ${
              p.slug
                ? `<a href="/listings/${encodeURIComponent(p.slug)}/">View lot →</a>`
                : ""
            }
          </div>`
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        marker.addTo(layer as any);
      });

      if (points.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bounds = (L as any).latLngBounds(points.map((p) => [p.lat, p.lon]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).fitBounds(bounds.pad(0.25), { maxZoom: 8 });
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [points]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className="leaflet-host" aria-label="Saskatchewan listings map" />;
}
