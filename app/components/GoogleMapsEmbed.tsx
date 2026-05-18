"use client";

type GoogleMapsEmbedProps = {
  latitude: number;
  longitude: number;
  label?: string;
  zoom?: number;
};

/**
 * Per-lot satellite embed.
 *
 * Uses the unkeyed Google Maps iframe (`maps.google.com/maps?...&output=embed&t=k`).
 * This is the long-standing key-free approach — works today, no API setup, may break someday.
 * If it ever does, swap to the keyed Embed API: this component is the only place to change.
 */
export function GoogleMapsEmbed({ latitude, longitude, label, zoom = 14 }: GoogleMapsEmbedProps) {
  const coords = `${latitude},${longitude}`;
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&z=${zoom}&t=k&output=embed`;
  return (
    <div className="gmaps-host" aria-label={label ? `Satellite view of ${label}` : "Satellite view"}>
      <iframe
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={label ? `${label} — satellite` : "Satellite view"}
        allowFullScreen
      />
      <div className="gmaps-foot">
        <span className="lbl">Google satellite</span>
        <a
          className="open"
          href={`https://www.google.com/maps/@${coords},${zoom}z/data=!3m1!1e3`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps ↗
        </a>
      </div>
    </div>
  );
}
