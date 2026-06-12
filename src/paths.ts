// B1/D1 basename rule: "/" stays "/", the home directory yields the user's
// directory name — no special-casing. Shared by the workspace auto-rename
// rule (B1) and the pane-header title chain (D1).
export function basenameOf(p: string): string {
  if (p === "/") return "/";
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf("/");
  const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return base || "/";
}

// Pane-header display path (D1): home prefix as ~; when the result exceeds
// maxLen, middle segments shorten to their first letter while the last
// segment stays full (e.g. ~/A/affiliate-cms). The full path lives in the
// native title tooltip. Workspace auto-naming stays on basenameOf.
export function abbreviatePath(p: string, home: string, maxLen = 34): string {
  let display = p;
  if (home && (p === home || p.startsWith(`${home}/`))) {
    display = `~${p.slice(home.length)}`;
  }
  if (display.length <= maxLen) return display;
  const parts = display.split("/");
  for (let i = 1; i < parts.length - 1; i++) {
    parts[i] = parts[i].slice(0, 1);
  }
  return parts.join("/");
}
