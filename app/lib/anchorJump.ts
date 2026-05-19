import type { MouseEvent } from "react";

export function anchorJump(
  event: MouseEvent<HTMLAnchorElement>,
  target: string,
  params?: Record<string, string>
) {
  event.preventDefault();
  const id = target.replace(/^#/, "");
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  history.replaceState(null, "", "#" + id + qs);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  const el = document.getElementById(id);
  if (el) {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: "smooth" });
  }
}
