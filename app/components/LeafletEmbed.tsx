"use client";

import { useEffect, useRef } from "react";

type LeafletEmbedProps = {
  latitude: number;
  longitude: number;
  label: string;
};

export function LeafletEmbed({ latitude, longitude, label }: LeafletEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [latitude, longitude],
        zoom: 13,
        scrollWheelZoom: false,
        attributionControl: true
      });
      mapRef.current = map;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
          maxZoom: 18
        }
      ).addTo(map);

      const icon = L.divIcon({
        className: "lot-marker",
        html: '<span class="lot-marker-dot" style="background:#a93826"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      L.marker([latitude, longitude], { icon }).bindPopup(label).addTo(map);
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).remove();
        mapRef.current = null;
      }
    };
  }, [latitude, longitude, label]);

  return <div ref={containerRef} className="leaflet-host leaflet-embed" />;
}
