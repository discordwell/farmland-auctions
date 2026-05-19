"use client";

import { useEffect } from "react";

import { useAuth } from "../lib/useAuth";

export default function AccountPage() {
  const { user, status } = useAuth();

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) {
      window.location.replace("/login/?next=/account/");
      return;
    }
    if (user.role === "admin") {
      window.location.replace("/admin/");
      return;
    }
    if (user.intent === "seller") {
      window.location.replace("/seller/");
      return;
    }
    window.location.replace("/buyer/");
  }, [status, user]);

  return (
    <main className="hub">
      <div className="hub-loading">Redirecting…</div>
    </main>
  );
}
