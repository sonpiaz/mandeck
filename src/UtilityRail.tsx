import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsPopover } from "./SettingsPopover";
import type { Settings } from "../electron/settings-schema.mjs";

type Props = {
  accent: string;
  dragActive: boolean;
  settings: Settings;
  onNewTerminal: () => void;
  onCommitSettings: (next: Settings) => void;
};

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
// workspace area below the 44px titlebar. Exactly two items in v1 — the
// terminal launcher (top) and the settings gear (bottom-pinned).
export function UtilityRail({
  accent,
  dragActive,
  settings,
  onNewTerminal,
  onCommitSettings,
}: Props) {
  const gearRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{
    right: number;
    bottom: number;
  } | null>(null);

  const closePopover = useCallback(() => setPopoverPos(null), []);

  const togglePopover = () => {
    if (popoverPos) {
      setPopoverPos(null);
      return;
    }
    const rect = gearRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Anchored to the gear, opening up-and-left from the bottom-right corner
    // (C3). The gear is bottom-pinned, so the offsets stay valid across
    // window resizes.
    setPopoverPos({
      right: Math.max(8, Math.round(window.innerWidth - rect.right + 4)),
      bottom: Math.round(window.innerHeight - rect.top + 8),
    });
  };

  // A pane drag starting dismisses the popover (C3 dismissal list); the rail
  // itself goes pointer-inert via CSS for the drag's duration (C1). Hiding
  // the rail unmounts this component, taking the popover with its anchor.
  useEffect(() => {
    if (dragActive) setPopoverPos(null);
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
      <div className="rail-stretch" />
      <button
        type="button"
        ref={gearRef}
        className="rail-item"
        title="Settings"
        aria-expanded={popoverPos !== null}
        onClick={togglePopover}
      >
        <IconGear />
        <span className="rail-item-label">settings</span>
      </button>
      {popoverPos && (
        <SettingsPopover
          accent={accent}
          position={popoverPos}
          settings={settings}
          anchorRef={gearRef}
          onCommit={onCommitSettings}
          onClose={closePopover}
        />
      )}
    </aside>
  );
}
