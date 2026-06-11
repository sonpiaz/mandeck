import type { ITheme } from "@xterm/xterm";

// Terminal content-layer palette (SPEC D1 xterm table). These are the only
// sanctioned color literals outside the src/styles.css token sheet — the
// terminal buffer is content, not chrome, and consumes hex values via JS so
// it stays in lockstep with the IPC reduced-transparency boolean (A1).

// At ~92% the eye already reads "transparent terminal"; fixed, no slider in v1.
const BG_GLASS = "rgba(14, 14, 20, 0.92)";
// Reduced transparency and Opaque mode both snap to solid --bg-terminal.
const BG_SOLID = "#0E0E14";

export function buildTerminalTheme(accent: string, solid: boolean): ITheme {
  return {
    background: solid ? BG_SOLID : BG_GLASS,
    // --text-primary; always 100% opacity — never vibrant, never blended.
    foreground: "#ECECF1",
    // Workspace accent — one of the four sanctioned accent elements (A1).
    cursor: accent,
    cursorAccent: "#0E0E14",
    // Neutral selection; selection is NOT accent-tinted (D1).
    selectionBackground: "rgba(236, 236, 241, 0.18)",
    // ANSI ramp retained from the audited baseline; the 8 normal colors were
    // audited at 4.5:1 against --bg-terminal (#0E0E14) — black was the only
    // failure and is lightened one step. Bright variants unchanged (D1).
    black: "#768390",
    red: "#F85149",
    green: "#3FB950",
    yellow: "#D29922",
    blue: "#58A6FF",
    magenta: "#BC8CFF",
    cyan: "#39C5CF",
    white: "#B1BAC4",
    brightBlack: "#6E7681",
    brightRed: "#FF7B72",
    brightGreen: "#56D364",
    brightYellow: "#E3B341",
    brightBlue: "#79C0FF",
    brightMagenta: "#D2A8FF",
    brightCyan: "#56D4DD",
    brightWhite: "#F0F6FC",
  };
}
