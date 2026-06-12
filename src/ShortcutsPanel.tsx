import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getOverlayHost } from "./overlay";

type Props = {
  onClose: () => void;
};

type ShortcutRow = { keys: string[]; label: string };
type ShortcutGroup = { title: string; rows: ShortcutRow[] };

// The full binding map (INV-1 table plus the pointer gestures), grouped the
// way the muscle memory splits: the workspace strip, the pane grid, chrome
// tools. Chips reuse the palette's .cmd-kbd keycap recipe.
const GROUPS: ShortcutGroup[] = [
  {
    title: "Workspaces",
    rows: [
      { keys: ["⌘T"], label: "New workspace" },
      { keys: ["⌘1–9"], label: "Jump to workspace" },
      { keys: ["⌘[", "⌘]"], label: "Previous / next workspace" },
      { keys: ["⌘⇧W"], label: "Close workspace" },
      { keys: ["double-click"], label: "Rename a workspace chip" },
      { keys: ["drag"], label: "Reorder workspace chips" },
    ],
  },
  {
    title: "Panes",
    rows: [
      { keys: ["⌘N", "⌘D"], label: "New terminal pane" },
      { keys: ["⌘W"], label: "Close pane — cascades workspace, then window" },
      { keys: ["drag header"], label: "Move a pane onto another pane's edge" },
      { keys: ["right-click header"], label: "Pane menu — move, maximize, close" },
      { keys: ["⤢"], label: "Maximize or restore a pane (header button)" },
    ],
  },
  {
    title: "Tools",
    rows: [
      { keys: ["⌘K"], label: "Command palette" },
      { keys: ["⌘O"], label: "Open folder in a new pane" },
      { keys: ["⌘/"], label: "Keyboard shortcuts — this panel" },
      { keys: ["⌘Q", "⌘Q"], label: "Quit — press twice to confirm" },
    ],
  },
];

// Keyboard shortcuts viewer (⌘/): a glass-2 overlay through the body-level
// overlay host at the popover/palette layer z 1050 (D3 layer table). Static
// content — Esc, ⌘/ (App's global toggle), or an outside click closes it,
// and App returns keyboard focus to the focused pane's terminal.
export function ShortcutsPanel({ onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Take keyboard focus while open (the panel has no inputs) so Esc lands
  // here instead of in the focused terminal's PTY; onClose hands it back.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
  }, [onClose]);

  return createPortal(
    <div
      ref={rootRef}
      className="shortcuts-panel"
      role="dialog"
      aria-label="Keyboard shortcuts"
      tabIndex={-1}
    >
      <div className="shortcuts-title-row">
        <span className="shortcuts-title">Keyboard Shortcuts</span>
        <span className="cmd-kbd">esc</span>
      </div>
      <div className="shortcuts-body">
        {GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <div className="shortcuts-section-label">{group.title}</div>
            {group.rows.map((row) => (
              <div key={row.label} className="shortcuts-row">
                <div className="shortcuts-keys">
                  {/* Index keys: a chip can repeat within a chord (⌘Q ⌘Q). */}
                  {row.keys.map((k, i) => (
                    <span key={i} className="cmd-kbd">
                      {k}
                    </span>
                  ))}
                </div>
                <div className="shortcuts-desc">{row.label}</div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>,
    getOverlayHost()
  );
}
