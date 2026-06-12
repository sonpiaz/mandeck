// Grid-slot registry generalizing the D3 slot-adoption pattern: each pane's
// Terminal renders once into a stable host element, and the workspace grids
// render dumb slot divs that register here by pane id. The Terminal
// subscribes and re-parents its host into whichever slot currently claims
// the id — so column moves and cross-workspace moves never change a
// terminal's React identity (INV-8/INV-13: a remounted terminal is a dead
// shell).
const slots = new Map<string, HTMLElement>();
const listeners = new Map<string, Set<() => void>>();

function notify(pid: string) {
  listeners.get(pid)?.forEach((fn) => fn());
}

export function setPaneSlot(pid: string, el: HTMLElement) {
  if (slots.get(pid) === el) return;
  slots.set(pid, el);
  notify(pid);
}

// Detach is element-checked: within one React commit a new grid's slot may
// register before (or after) the old grid's slot detaches — only the element
// that still owns the entry may clear it.
export function clearPaneSlot(pid: string, el: HTMLElement) {
  if (slots.get(pid) !== el) return;
  slots.delete(pid);
  notify(pid);
}

export function getPaneSlot(pid: string): HTMLElement | null {
  return slots.get(pid) ?? null;
}

export function subscribePaneSlot(pid: string, fn: () => void): () => void {
  let set = listeners.get(pid);
  if (!set) {
    set = new Set();
    listeners.set(pid, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(pid);
  };
}
