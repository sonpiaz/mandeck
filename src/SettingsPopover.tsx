import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  normalizeSettings,
  type Settings,
} from "../electron/settings-schema.mjs";
import { getOverlayHost } from "./overlay";

type Props = {
  accent: string;
  position: { right: number; bottom: number };
  settings: Settings;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onCommit: (next: Settings) => void;
  onClose: () => void;
};

// Anchored glass-2 popover (SPEC C3): a popover, not a modal — no scrim,
// terminals keep running behind it. Renders through the body-level overlay
// host at z 1050 so it sits above the maximize spotlight (D3 layer table).
// Each control commits on interaction; there is no Save/Cancel.
export function SettingsPopover({
  accent,
  position,
  settings,
  anchorRef,
  onCommit,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fontFamilyDraft, setFontFamilyDraft] = useState(settings.fontFamily);
  const [shellDraft, setShellDraft] = useState(settings.shell);

  useEffect(() => setFontFamilyDraft(settings.fontFamily), [settings.fontFamily]);
  useEffect(() => setShellDraft(settings.shell), [settings.shell]);

  // Esc and outside-click dismissal (C3). The gear is excluded so its own
  // click handler keeps toggle semantics.
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

  // Commit = save to settings.json + apply (font live to all terminals,
  // shell to new panes only). Normalization clamps out-of-range values.
  const commit = (patch: Partial<Settings>) => {
    onCommit(
      normalizeSettings({ ...settings, ...patch }, window.mandeck.defaultShell)
    );
  };

  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  // The portal root sits outside the .app subtree, so the active workspace
  // accent is re-declared here for the focus rings.
  const style = {
    right: position.right,
    bottom: position.bottom,
    "--accent": accent,
  } as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      className="settings-popover"
      role="dialog"
      aria-label="Settings"
      style={style}
    >
      <div className="settings-title-row">
        <span className="settings-title">Settings</span>
        <span className="settings-version">v{window.mandeck.appVersion}</span>
      </div>
      <div className="settings-field">
        <span className="settings-label" id="settings-font-size-label">
          Font size
        </span>
        <div
          className="settings-stepper"
          role="group"
          aria-labelledby="settings-font-size-label"
        >
          <button
            type="button"
            aria-label="Decrease font size"
            disabled={settings.fontSize <= FONT_SIZE_MIN}
            onClick={() => commit({ fontSize: settings.fontSize - 1 })}
          >
            −
          </button>
          <span className="settings-stepper-value">{settings.fontSize}</span>
          <button
            type="button"
            aria-label="Increase font size"
            disabled={settings.fontSize >= FONT_SIZE_MAX}
            onClick={() => commit({ fontSize: settings.fontSize + 1 })}
          >
            +
          </button>
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-label" htmlFor="settings-font-family">
          Font family
        </label>
        <input
          id="settings-font-family"
          className="settings-input"
          value={fontFamilyDraft}
          spellCheck={false}
          onChange={(e) => setFontFamilyDraft(e.target.value)}
          onBlur={() => commit({ fontFamily: fontFamilyDraft })}
          onKeyDown={commitOnEnter}
        />
      </div>
      <div className="settings-field">
        <label className="settings-label" htmlFor="settings-shell">
          Shell
        </label>
        <input
          id="settings-shell"
          className="settings-input"
          value={shellDraft}
          spellCheck={false}
          onChange={(e) => setShellDraft(e.target.value)}
          onBlur={() => commit({ shell: shellDraft })}
          onKeyDown={commitOnEnter}
        />
        <span className="settings-note">applies to new panes</span>
      </div>
      <button
        type="button"
        className="settings-edit-config"
        onClick={() => {
          void window.mandeck.openSettingsFile();
        }}
      >
        Edit config file…
      </button>
    </div>,
    getOverlayHost()
  );
}
