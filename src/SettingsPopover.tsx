import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_FONT_FAMILY,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  normalizeSettings,
  type Settings,
} from "../electron/settings-schema.mjs";
import { ACCENT_HUES } from "../electron/state-schema.mjs";
import { basenameOf } from "./paths";
import { getOverlayHost } from "./overlay";

type Props = {
  accent: string;
  position: { right: number; bottom: number };
  settings: Settings;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onCommit: (next: Settings) => void;
  onSetAccent: (hue: string) => void;
  onShowShortcuts: () => void;
  onClose: () => void;
};

// Curated monospace candidates for the font picker; only families the OS
// actually has (document.fonts.check) are offered.
const FONT_CANDIDATES = [
  "SF Mono",
  "Menlo",
  "Monaco",
  "JetBrains Mono",
  "Fira Code",
  "Hack",
  "Source Code Pro",
  "IBM Plex Mono",
  "Cascadia Code",
];

// Picked names commit as a stack so fallback survives a missing font.
const fontStackFor = (name: string) => `'${name}', ${DEFAULT_FONT_FAMILY}`;

const firstFamilyOf = (stack: string) =>
  stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");

// A1 rotation order, for the swatch aria labels.
const HUE_NAMES = ["Green", "Teal", "Blue", "Purple", "Red", "Orange", "Yellow"];

// Anchored glass-2 popover (SPEC C3): a popover, not a modal — no scrim,
// terminals keep running behind it. Renders through the body-level overlay
// host at z 1050 so it sits above the maximize spotlight (D3 layer table).
// Each control commits on interaction; there is no Save/Cancel. Font changes
// live-apply by option mutation in Terminal (never a remount); shell applies
// to new panes only. The accent swatches show and retint the ACTIVE
// workspace's accentHue — instantly visible, persisted with app state;
// settings.defaultAccent stays file-only as the new-workspace rotation seed.
export function SettingsPopover({
  accent,
  position,
  settings,
  anchorRef,
  onCommit,
  onSetAccent,
  onShowShortcuts,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shells, setShells] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.mandeck.listShells().then((list) => {
      if (!cancelled) setShells(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const fontOptions = useMemo(() => {
    const opts = [{ value: DEFAULT_FONT_FAMILY, label: "Default (SF Mono)" }];
    for (const name of FONT_CANDIDATES) {
      let installed = false;
      try {
        installed = document.fonts.check(`12px "${name}"`);
      } catch {
        /* FontFaceSet unavailable — offer the default only */
      }
      if (installed) opts.push({ value: fontStackFor(name), label: name });
    }
    return opts;
  }, []);
  // A hand-edited settings.json may carry a stack no option produces; it is
  // surfaced as-is so the select always shows the current effective value.
  const fontKnown = fontOptions.some((o) => o.value === settings.fontFamily);

  // Current default pinned on top; duplicate basenames keep the full path.
  const shellOptions = useMemo(() => {
    const paths = [settings.shell, ...shells.filter((s) => s !== settings.shell)];
    const counts = new Map<string, number>();
    for (const p of paths) {
      const b = basenameOf(p);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return paths.map((p) => {
      const b = basenameOf(p);
      return { value: p, label: (counts.get(b) ?? 0) > 1 ? `${b} — ${p}` : b };
    });
  }, [settings.shell, shells]);

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
      <div className="settings-section-label">Appearance</div>
      <div className="settings-row">
        <label className="settings-row-label" htmlFor="settings-font-family">
          Font family
        </label>
        <select
          id="settings-font-family"
          className="settings-select"
          value={settings.fontFamily}
          onChange={(e) => commit({ fontFamily: e.target.value })}
        >
          {!fontKnown && (
            <option value={settings.fontFamily}>
              {firstFamilyOf(settings.fontFamily)}
            </option>
          )}
          {fontOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <span className="settings-row-label" id="settings-font-size-label">
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
      <div className="settings-row">
        <span className="settings-row-label" id="settings-accent-label">
          Accent
        </span>
        <div
          className="settings-swatch-row"
          role="radiogroup"
          aria-labelledby="settings-accent-label"
        >
          {ACCENT_HUES.map((hue, i) => (
            <button
              key={hue}
              type="button"
              role="radio"
              aria-checked={accent === hue}
              aria-label={HUE_NAMES[i]}
              title={HUE_NAMES[i]}
              className={`settings-swatch${accent === hue ? " selected" : ""}`}
              style={{ background: hue }}
              onClick={() => onSetAccent(hue)}
            />
          ))}
        </div>
      </div>
      <div className="settings-row-note">accent of this workspace</div>
      <div className="settings-section-label">Terminal</div>
      <div className="settings-row">
        <label className="settings-row-label" htmlFor="settings-shell">
          Shell
        </label>
        <select
          id="settings-shell"
          className="settings-select"
          value={settings.shell}
          onChange={(e) => commit({ shell: e.target.value })}
        >
          {shellOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row-note">applies to new panes</div>
      <button
        type="button"
        className="settings-footer-btn"
        onClick={() => {
          // The panel renders at the same overlay layer; the popover closes
          // so the two never stack.
          onShowShortcuts();
          onClose();
        }}
      >
        Keyboard Shortcuts
      </button>
      <button
        type="button"
        className="settings-footer-btn"
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
