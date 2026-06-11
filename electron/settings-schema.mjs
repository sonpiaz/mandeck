// Pure settings logic shared by the main process and the renderer (SPEC C3).
// Must stay free of electron and node:fs imports, like state-schema.mjs.

import { ACCENT_HUES, DEFAULT_ACCENT } from "./state-schema.mjs";

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 18;
export const DEFAULT_FONT_SIZE = 13;
export const DEFAULT_LINE_HEIGHT = 1.4;
export const DEFAULT_FONT_FAMILY = "ui-monospace, 'SF Mono', Menlo, monospace";

export function clampFontSize(n) {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

// Defaults mirror the previously hardcoded values (C3 inputs table). The
// shell default is environment-dependent, so callers pass it in.
export function defaultSettings(defaultShell) {
  return {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    defaultAccent: DEFAULT_ACCENT,
    shell: defaultShell,
  };
}

// All fields are optional in settings.json. Out-of-range values are clamped
// on load, never rejected; anything unusable falls back to its default —
// a corrupt document yields defaults in memory with the file untouched (C3).
export function normalizeSettings(raw, defaultShell) {
  const out = defaultSettings(defaultShell);
  if (!raw || typeof raw !== "object") return out;
  if (typeof raw.fontFamily === "string" && raw.fontFamily.trim() !== "") {
    out.fontFamily = raw.fontFamily.trim();
  }
  if (typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize)) {
    out.fontSize = clampFontSize(raw.fontSize);
  }
  if (
    typeof raw.lineHeight === "number" &&
    Number.isFinite(raw.lineHeight) &&
    raw.lineHeight >= 1
  ) {
    out.lineHeight = raw.lineHeight;
  }
  if (ACCENT_HUES.includes(raw.defaultAccent)) {
    out.defaultAccent = raw.defaultAccent;
  }
  if (typeof raw.shell === "string" && raw.shell.trim() !== "") {
    out.shell = raw.shell.trim();
  }
  return out;
}
