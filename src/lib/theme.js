"use client";

// Theme toggle used by the Navbar profile dropdown. No external theme
// library — the DOM attribute (data-theme on <html>) is the single source of
// truth for which palette globals.css applies; this just reads/writes it
// plus localStorage. The matching no-flash script that sets the attribute
// before first paint lives in src/app/layout.js and must use the same
// storage key.
import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "codely-theme";
const DEFAULT_THEME = "dark";

// useSyncExternalStore listeners — notified whenever applyTheme runs, so
// every mounted useTheme() consumer (e.g. multiple tabs of the app open in
// one page, unlikely here but cheap to support) stays in sync.
const listeners = new Set();

export function getStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Non-fatal — the attribute is already set, the choice just won't persist.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Client snapshot reads the DOM attribute directly — by the time any React
// component mounts, the blocking script in layout.js has already set it.
function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
}

// Server snapshot must match what layout.js renders without the client-only
// script, i.e. no attribute yet — useSyncExternalStore reconciles the gap
// itself without a hydration-mismatch warning.
function getServerSnapshot() {
  return DEFAULT_THEME;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  };

  return { theme, toggleTheme };
}
