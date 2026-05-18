"use client";

import { useEffect, useState } from "react";

export function LegacySlugRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    if (slug) {
      const dest = `/listings/${encodeURIComponent(slug)}/`;
      setTarget(dest);
      window.location.replace(dest);
      return;
    }
    setTarget("/#inventory");
    window.location.replace("/#inventory");
  }, []);

  return (
    <main className="health-page">
      <p>Redirecting{target ? ` to ${target}` : ""}…</p>
    </main>
  );
}
