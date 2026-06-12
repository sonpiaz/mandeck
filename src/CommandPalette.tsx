import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { getOverlayHost } from "./overlay";

export type PaletteIcon =
  | "terminal"
  | "workspace"
  | "folder"
  | "finder"
  | "gear"
  | "rail"
  | "keyboard"
  | "maximize"
  | "restore";

export type PaletteAction = {
  id: string;
  section: "Actions" | "Folders" | "Workspaces";
  icon?: PaletteIcon;
  // Workspace rows show their accentHue as a small dot instead of a glyph.
  dot?: string;
  title: string;
  subtitle?: string;
  chip?: string;
  run: () => void;
};

type Props = {
  actions: PaletteAction[];
  onClose: () => void;
};

// Simple subsequence fuzzy match (no scoring, no deps): every query char
// must appear in the haystack in order. Both sides arrive lowercased.
function fuzzyMatch(query: string, text: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i++;
    if (i === query.length) return true;
  }
  return query.length === 0;
}

const GLYPHS: Record<PaletteIcon, ReactElement> = {
  terminal: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1.5" width="12" height="11" rx="2.5" />
      <path d="M4 5.5l2.2 1.7L4 8.9" />
    </svg>
  ),
  workspace: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="10" rx="2" />
      <path d="M1 5h12" />
      <path d="M5.5 3.5h3" />
    </svg>
  ),
  folder: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4a1.5 1.5 0 011.5-1.5h2.2L6.8 4H11a1.5 1.5 0 011.5 1.5V10A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V4z" />
    </svg>
  ),
  finder: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4a1.5 1.5 0 011.5-1.5h2.2L6.8 4H11a1.5 1.5 0 011.5 1.5V10A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V4z" />
      <path d="M5.5 9.5l3-3M8.5 9V6.5H6" />
    </svg>
  ),
  gear: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2.2v2M10 15.8v2M17.8 10h-2M4.2 10h-2M15.6 4.4l-1.5 1.5M5.9 14.1l-1.5 1.5M15.6 15.6l-1.5-1.5M5.9 5.9L4.4 4.4" />
    </svg>
  ),
  rail: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="10" rx="2" />
      <path d="M9.5 2v10" />
    </svg>
  ),
  keyboard: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3.5" width="12" height="7.5" rx="1.5" />
      <path d="M3.4 6h.01M5.8 6h.01M8.2 6h.01M10.6 6h.01M4.5 8.75h5" />
    </svg>
  ),
  maximize: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 2 H 12 V 5.5" />
      <path d="M12 2 L 8 6" />
      <path d="M5.5 12 H 2 V 8.5" />
      <path d="M2 12 L 6 8" />
    </svg>
  ),
  restore: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5.5 H 8.5 V 2" />
      <path d="M12 2 L 8 6" />
      <path d="M2 8.5 H 5.5 V 12" />
      <path d="M2 12 L 6 8" />
    </svg>
  ),
};

const IconSearch = () => (
  <svg className="cmd-search-icon" width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
    <circle cx="6" cy="6" r="4.5" />
    <path d="M9.5 9.5l3.5 3.5" />
  </svg>
);

// ⌘K command palette (glass-2, popover layer z 1050): rendered through the
// body-level overlay host, upper-center over the workspace area. The action
// list is rebuilt from live app state by the caller; closing returns focus
// to the focused pane's terminal (App owns that, via onClose).
export function CommandPalette({ actions, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      fuzzyMatch(q, `${a.title} ${a.subtitle ?? ""}`.toLowerCase())
    );
  }, [actions, query]);

  // Clamp instead of resetting on action-list churn (e.g. a chip retitling
  // while the palette is open); typing resets to the top match below.
  const sel = Math.min(selected, Math.max(0, filtered.length - 1));

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filtered.length) setSelected((sel + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length) setSelected((sel - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const action = filtered[sel];
        if (action) {
          action.run();
          onClose();
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [filtered, sel, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [sel, filtered]);

  const rows: ReactElement[] = [];
  let lastSection: string | null = null;
  filtered.forEach((a, i) => {
    if (a.section !== lastSection) {
      lastSection = a.section;
      rows.push(
        <div key={`label-${a.section}`} className="cmd-section-label">
          {a.section}
        </div>
      );
    }
    rows.push(
      <div
        key={a.id}
        className={`cmd-item${i === sel ? " selected" : ""}`}
        data-selected={i === sel || undefined}
        onMouseEnter={() => setSelected(i)}
        onClick={() => {
          a.run();
          onClose();
        }}
      >
        <div className="cmd-item-icon" aria-hidden>
          {a.dot ? (
            <span className="cmd-item-dot" style={{ background: a.dot }} />
          ) : (
            a.icon && GLYPHS[a.icon]
          )}
        </div>
        <div className="cmd-item-body">
          <div className="cmd-item-title">{a.title}</div>
          {a.subtitle && <div className="cmd-item-sub">{a.subtitle}</div>}
        </div>
        {a.chip && <span className="cmd-kbd">{a.chip}</span>}
      </div>
    );
  });

  return createPortal(
    <div
      ref={rootRef}
      className="cmd-palette"
      role="dialog"
      aria-label="Command palette"
    >
      <div className="cmd-search-row">
        <IconSearch />
        <input
          ref={inputRef}
          className="cmd-input"
          value={query}
          placeholder="Type a command…"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="cmd-kbd">esc</span>
      </div>
      <div className="cmd-results" ref={listRef}>
        {rows.length > 0 ? rows : <div className="cmd-empty">No matching actions</div>}
      </div>
      <div className="cmd-footer">
        <div className="cmd-footer-hints">
          <span className="cmd-kbd">↑↓</span> navigate
          <span className="cmd-footer-sep">·</span>
          <span className="cmd-kbd">↵</span> open
          <span className="cmd-footer-sep">·</span>
          <span className="cmd-kbd">esc</span>
        </div>
        <span>
          {filtered.length} {filtered.length === 1 ? "result" : "results"}
        </span>
      </div>
    </div>,
    getOverlayHost()
  );
}
