"use client";

import { useEffect, useState } from "react";

function secondsUntil(value?: string) {
  if (!value) return 0;
  return Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
}

type Variant = "block" | "inline";

export function Countdown({
  closesAt,
  variant = "block"
}: {
  closesAt?: string;
  variant?: Variant;
}) {
  const [seconds, setSeconds] = useState(() => secondsUntil(closesAt));

  useEffect(() => {
    setSeconds(secondsUntil(closesAt));
    const id = window.setInterval(() => {
      setSeconds(secondsUntil(closesAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [closesAt]);

  const hrs = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  if (variant === "inline") {
    return (
      <span className="countdown-inline" aria-label="Time remaining">
        {hrs}:{mins}:{secs}
      </span>
    );
  }

  return (
    <div className="countdown" aria-label="Time remaining">
      <div className="lbl">Time to bell</div>
      <div className="clock">
        <span>
          {hrs}
          <span className="unit">hr</span>
        </span>
        <span className="sep">:</span>
        <span>
          {mins}
          <span className="unit">min</span>
        </span>
        <span className="sep">:</span>
        <span>
          {secs}
          <span className="unit">sec</span>
        </span>
      </div>
    </div>
  );
}

export function secondsUntilDate(value?: string) {
  return secondsUntil(value);
}
