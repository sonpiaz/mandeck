import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { getOverlayHost } from "./overlay";
import { abbreviatePath } from "./paths";

type Props = {
  accent: string;
  position: { right: number; top: number };
  anchorRef: RefObject<HTMLButtonElement | null>;
  focusedCwd?: string;
  recentDirs: string[];
  onNewPaneAt: (cwd?: string) => void;
  onChooseFolder: () => void;
  onClose: () => void;
};

const IconFinder = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1.5 4a1.5 1.5 0 011.5-1.5h2.2L6.8 4H11a1.5 1.5 0 011.5 1.5V10A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V4z" />
    <path d="M5.5 9.5l3-3M8.5 9V6.5H6" />
  </svg>
);

const IconTerminal = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="1" y="1.5" width="12" height="11" rx="2.5" />
    <path d="M4 5.5l2.2 1.7L4 8.9" />
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1.5 4a1.5 1.5 0 011.5-1.5h2.2L6.8 4H11a1.5 1.5 0 011.5 1.5V10A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V4z" />
  </svg>
);

// Anchored glass-2 popover for the rail's "files" item: focused-pane cwd
// header (reveals in Finder), "New pane here", recent folders from paneCwds,
// and the same Choose Folder… picker flow as ⌘O. Pure chrome — every row
// fans into the existing cwd-threaded add-pane path; no pane view types.
// Renders through the body-level overlay host at z 1050 (D3 layer table).
export function FilesPopover({
  accent,
  position,
  anchorRef,
  focusedCwd,
  recentDirs,
  onNewPaneAt,
  onChooseFolder,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Esc and outside-click dismissal; the anchor button is excluded so its
  // own click handler keeps toggle semantics (same recipe as C3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose, anchorRef]);

  const home = window.mandeck.homeDir;
  const headerDir = focusedCwd ?? home;

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  // The portal root sits outside the .app subtree, so the active workspace
  // accent is re-declared here for the focus rings.
  const style = {
    right: position.right,
    top: position.top,
    "--accent": accent,
  } as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      className="files-popover"
      role="dialog"
      aria-label="Files"
      style={style}
    >
      <button
        type="button"
        className="files-row files-header"
        title={headerDir}
        onClick={() => run(() => { void window.mandeck.openDirInFinder(headerDir); })}
      >
        <span className="files-row-icon"><IconFinder /></span>
        <span className="files-row-body">
          <span className="files-row-title files-row-path">
            {abbreviatePath(headerDir, home)}
          </span>
          <span className="files-row-sub">Reveal in Finder</span>
        </span>
      </button>
      <div className="files-body">
        <button
          type="button"
          className="files-row"
          onClick={() => run(() => onNewPaneAt(focusedCwd))}
        >
          <span className="files-row-icon"><IconTerminal /></span>
          <span className="files-row-body">
            <span className="files-row-title">New pane here</span>
            <span className="files-row-sub">{abbreviatePath(headerDir, home)}</span>
          </span>
        </button>
        {recentDirs.length > 0 && (
          <>
            <div className="files-section-label">Recent folders</div>
            {recentDirs.map((dir) => (
              <button
                key={dir}
                type="button"
                className="files-row"
                title={dir}
                onClick={() => run(() => onNewPaneAt(dir))}
              >
                <span className="files-row-icon"><IconFolder /></span>
                <span className="files-row-body">
                  <span className="files-row-title files-row-path">
                    {abbreviatePath(dir, home)}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="files-footer">
        <button
          type="button"
          className="files-row"
          onClick={() => run(onChooseFolder)}
        >
          <span className="files-row-body">
            <span className="files-row-title">Choose Folder…</span>
          </span>
          <span className="cmd-kbd">⌘O</span>
        </button>
      </div>
    </div>,
    getOverlayHost()
  );
}
