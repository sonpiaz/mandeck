import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsPopover } from "./SettingsPopover";
import type { Settings } from "../electron/settings-schema.mjs";

type Props = {
  accent: string;
  dragActive: boolean;
  settings: Settings;
  focusedCwd?: string;
  // Bumped by the ⌘K palette's Settings action; each bump opens the popover.
  openSettingsSignal: number;
  onNewTerminal: () => void;
  // Opens a file-browser pane directly (no intermediate popover).
  onOpenFilesAt: (dir?: string) => void;
  onCommitSettings: (next: Settings) => void;
  onSetAccent: (hue: string) => void;
  onShowShortcuts: () => void;
};

type RailPopover = { kind: "settings"; right: number; bottom: number };

const IconTerminal = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="3.25" width="16" height="13.5" rx="2.5" />
    <path d="M5.5 8l2.8 2-2.8 2" />
    <path d="M10.5 12h4" />
  </svg>
);

const IconFolder = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M2.1 5.7a2.1 2.1 0 012.1-2.1h3.2l2.3 2.1H15.8a2.1 2.1 0 012.1 2.1v6.4a2.1 2.1 0 01-2.1 2.1H4.2a2.1 2.1 0 01-2.1-2.1V5.7z" />
  </svg>
);

const IconGear = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="10" cy="10" r="3" />
    <path d="M10 2.2v2M10 15.8v2M17.8 10h-2M4.2 10h-2M15.6 4.4l-1.5 1.5M5.9 14.1l-1.5 1.5M15.6 15.6l-1.5-1.5M5.9 5.9L4.4 4.4" />
  </svg>
);

// 56px utility rail (SPEC C1): glass-1 chrome, a flex sibling of the
// workspace area below the 44px titlebar. Launchers at top (terminal,
// files), the settings gear bottom-pinned. The files item opens a
// file-browser pane at the focused pane's cwd in one click; recents and
// Choose Folder… live in the ⌘K palette.
export function UtilityRail({
  accent,
  dragActive,
  settings,
  focusedCwd,
  openSettingsSignal,
  onNewTerminal,
  onOpenFilesAt,
  onCommitSettings,
  onSetAccent,
  onShowShortcuts,
}: Props) {
  const gearRef = useRef<HTMLButtonElement>(null);
  const [popover, setPopover] = useState<RailPopover | null>(null);

  const closePopover = useCallback(() => setPopover(null), []);

  const openSettingsPopover = useCallback(() => {
    const rect = gearRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Anchored to the gear, opening up-and-left from the bottom-right corner
    // (C3). The gear is bottom-pinned, so the offsets stay valid across
    // window resizes.
    setPopover({
      kind: "settings",
      right: Math.max(8, Math.round(window.innerWidth - rect.right + 4)),
      bottom: Math.round(window.innerHeight - rect.top + 8),
    });
  }, []);

  const toggleSettings = () => {
    if (popover?.kind === "settings") {
      setPopover(null);
      return;
    }
    openSettingsPopover();
  };

  // The mount-time signal value is skipped so re-showing the rail never
  // re-opens the popover; only a fresh bump from the palette does.
  const lastSignalRef = useRef(openSettingsSignal);
  useEffect(() => {
    if (openSettingsSignal === lastSignalRef.current) return;
    lastSignalRef.current = openSettingsSignal;
    openSettingsPopover();
  }, [openSettingsSignal, openSettingsPopover]);

  // A pane drag starting dismisses the popover (C3 dismissal list); the rail
  // itself goes pointer-inert via CSS for the drag's duration (C1). Hiding
  // the rail unmounts this component, taking the popover with its anchor.
  useEffect(() => {
    if (dragActive) setPopover(null);
  }, [dragActive]);

  return (
    <aside className="utility-rail" aria-label="Utility rail">
      <button
        type="button"
        className="rail-item"
        title="New terminal (⌘N)"
        onClick={onNewTerminal}
      >
        <IconTerminal />
        <span className="rail-item-label">terminal</span>
      </button>
      <button
        type="button"
        className="rail-item"
        title="Browse files here"
        onClick={() => onOpenFilesAt(focusedCwd)}
      >
        <IconFolder />
        <span className="rail-item-label">files</span>
      </button>
      <div className="rail-stretch" />
      <button
        type="button"
        ref={gearRef}
        className="rail-item"
        title="Settings"
        aria-expanded={popover?.kind === "settings"}
        onClick={toggleSettings}
      >
        <IconGear />
        <span className="rail-item-label">settings</span>
      </button>
      {popover?.kind === "settings" && (
        <SettingsPopover
          accent={accent}
          position={popover}
          settings={settings}
          anchorRef={gearRef}
          onCommit={onCommitSettings}
          onSetAccent={onSetAccent}
          onShowShortcuts={onShowShortcuts}
          onClose={closePopover}
        />
      )}
    </aside>
  );
}
