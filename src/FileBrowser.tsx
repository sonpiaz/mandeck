import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";
import { PANE_DND_TYPE, type Edge, type PaneDragItem } from "./types";
import { getOverlayHost } from "./overlay";
import { usePaneDropTarget } from "./pane-dnd";
import { getPaneSlot, subscribePaneSlot } from "./pane-slots";
import { abbreviatePath } from "./paths";
import type { FsEntry } from "../electron/preload";

type Props = {
  id: string;
  initialDir: string;
  active: boolean;
  focused: boolean;
  maximized: boolean;
  onFocus: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  onHeaderContextMenu: () => void;
  onMovePane: (src: string, target: string, edge: Edge) => void;
  // The browser's current dir lives in paneCwds[pid] like a terminal's cwd —
  // it persists/restores through the same map and feeds New Terminal Here.
  onDirChange: (pid: string, dir: string) => void;
  resolveDropEdge: (srcPid: string, edge: Edge) => Edge;
};

function parentOf(dir: string): string | null {
  if (dir === "/") return null;
  const trimmed = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

function joinDir(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let v = bytes;
  for (const unit of ["KB", "MB", "GB", "TB"]) {
    v /= 1024;
    if (v < 1024) {
      return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${unit}`;
    }
  }
  return `${Math.round(v)} PB`;
}

function formatMtime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

// Clickable breadcrumb segments: home collapses to "~" like the abbreviated
// header path; every crumb navigates to its prefix.
function crumbsFor(dir: string, home: string): { label: string; path: string }[] {
  let rest = dir;
  const crumbs: { label: string; path: string }[] = [];
  if (home && (dir === home || dir.startsWith(`${home}/`))) {
    crumbs.push({ label: "~", path: home });
    rest = dir.slice(home.length);
  } else {
    crumbs.push({ label: "/", path: "/" });
  }
  let acc = crumbs[0].path;
  for (const seg of rest.split("/")) {
    if (seg === "") continue;
    acc = joinDir(acc, seg);
    crumbs.push({ label: seg, path: acc });
  }
  return crumbs;
}

const IconFolderHeader = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 4a1.5 1.5 0 011.5-1.5h2.2L6.8 4H11a1.5 1.5 0 011.5 1.5V10A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V4z" />
  </svg>
);

const IconMaximize = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 2 H 12 V 5.5" />
    <path d="M12 2 L 8 6" />
    <path d="M5.5 12 H 2 V 8.5" />
    <path d="M2 12 L 6 8" />
  </svg>
);
const IconRestore = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5.5 H 8.5 V 2" />
    <path d="M12 2 L 8 6" />
    <path d="M2 8.5 H 5.5 V 12" />
    <path d="M2 12 L 6 8" />
  </svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M3.5 3.5 L 10.5 10.5 M10.5 3.5 L 3.5 10.5" />
  </svg>
);

const IconUp = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 11.5V2.5" />
    <path d="M3 6.5l4-4 4 4" />
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 7a5 5 0 11-1.5-3.6" />
    <path d="M12 1.5V4H9.5" />
  </svg>
);

const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7s-2 3.5-5.5 3.5S1.5 7 1.5 7z" />
    <circle cx="7" cy="7" r="1.6" />
  </svg>
);

const IconEyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7s-2 3.5-5.5 3.5S1.5 7 1.5 7z" />
    <circle cx="7" cy="7" r="1.6" />
    <path d="M2.5 11.5l9-9" />
  </svg>
);

const IconRowFolder = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 4a1.5 1.5 0 011.5-1.5h2.2L6.8 4H11a1.5 1.5 0 011.5 1.5V10A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V4z" />
  </svg>
);

const IconRowFile = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 1.5h5L11 4.5v8H3v-11z" />
    <path d="M8 1.5V4.5h3" />
  </svg>
);

// File-browser pane: a regular grid citizen rendered in App's flat keyed
// pane list, adopting its grid slot through the same stable-host pattern as
// terminals — so drag, move-to-workspace, maximize, and close all work, and
// a cross-workspace move preserves the component (and its listing) intact.
// No PTY exists behind it; the pane-slot registry machinery is untouched.
export function FileBrowser({
  id,
  initialDir,
  active,
  focused,
  maximized,
  onFocus,
  onClose,
  onToggleMaximize,
  onHeaderContextMenu,
  onMovePane,
  onDirChange,
  resolveDropEdge,
}: Props) {
  const home = window.mandeck.homeDir;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const crumbsRef = useRef<HTMLDivElement | null>(null);
  const [dir, setDir] = useState(initialDir);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState(0);
  const loadSeqRef = useRef(0);
  const onDirChangeRef = useRef(onDirChange);
  useEffect(() => { onDirChangeRef.current = onDirChange; }, [onDirChange]);

  // Manual refresh only in v1 — no watchers (fs:readDir is one level, on
  // demand). A deleted-while-open dir surfaces as the ENOENT error state.
  const load = useCallback(async (target: string) => {
    const seq = ++loadSeqRef.current;
    const res = await window.mandeck.readDir(target);
    if (seq !== loadSeqRef.current) return; // stale response — a newer load won
    if (res.ok) {
      setEntries(res.entries);
      setTotal(res.total);
      setError(null);
    } else {
      setEntries([]);
      setTotal(0);
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void load(dir);
  }, [dir, load]);

  const navigate = useCallback(
    (target: string) => {
      setSelected(0);
      setDir(target);
      // Tracked in paneCwds[pid] so the dir persists/restores like a
      // terminal cwd and New Terminal Here / the files flows reuse it.
      onDirChangeRef.current(id, target);
    },
    [id]
  );

  const goUp = useCallback(() => {
    const parent = parentOf(dir);
    if (parent) navigate(parent);
  }, [dir, navigate]);

  const goHome = useCallback(() => navigate(home), [home, navigate]);

  const visible = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.hidden)),
    [entries, showHidden]
  );
  const sel = Math.min(selected, Math.max(0, visible.length - 1));

  const openEntry = useCallback(
    (entry: FsEntry) => {
      const full = joinDir(dir, entry.name);
      if (entry.isDir) navigate(full);
      else void window.mandeck.openPath(full);
    },
    [dir, navigate]
  );

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (visible.length) setSelected(Math.min(sel + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visible.length) setSelected(Math.max(sel - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = visible[sel];
      if (entry) openEntry(entry);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      goUp();
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  // Long paths: keep the breadcrumb trail pinned to its tail.
  useEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [dir]);

  // Keyboard focus mirrors the terminal's focused effect: when this pane is
  // the active workspace's focused pane, the listing takes DOM focus so
  // ↑↓/Enter/Backspace work immediately.
  useEffect(() => {
    if (focused) listRef.current?.focus({ preventScroll: true });
  }, [focused]);

  // --- Stable per-pane host + slot adoption (the Terminal pattern minus the
  // xterm refit: DOM layout reflows on its own). Moving the pane to another
  // column or workspace re-parents this host — never a React remount — so
  // the listing, selection, and current dir survive the move.
  const paneHostRef = useRef<HTMLDivElement | null>(null);
  if (!paneHostRef.current) {
    const el = document.createElement("div");
    el.className = "pane-host";
    paneHostRef.current = el;
  }
  const spotlightSlotRef = useRef<HTMLDivElement | null>(null);
  const [slotVersion, bumpSlotVersion] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribePaneSlot(id, bumpSlotVersion), [id]);

  const spotlightOn = maximized && active;
  const [scrimExiting, setScrimExiting] = useState(false);
  const prevSpotlightRef = useRef(spotlightOn);
  useEffect(() => {
    const was = prevSpotlightRef.current;
    prevSpotlightRef.current = spotlightOn;
    if (spotlightOn) {
      setScrimExiting(false);
      return;
    }
    if (was && !maximized) {
      setScrimExiting(true);
      const t = setTimeout(() => setScrimExiting(false), 250);
      return () => clearTimeout(t);
    }
  }, [spotlightOn, maximized]);

  useEffect(() => {
    const host = paneHostRef.current;
    if (!host) return;
    const target = spotlightOn ? spotlightSlotRef.current : getPaneSlot(id);
    if (target && host.parentElement !== target) target.appendChild(host);
  }, [id, spotlightOn, active, slotVersion]);

  // --- Pane-as-draggable (header is the handle, like terminals) ------------
  const title = abbreviatePath(dir, home);
  const [{ isDragging }, dragRef, dragPreview] = useDrag<
    PaneDragItem,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: PANE_DND_TYPE,
      item: () => ({ pid: id, title }),
      collect: (m) => ({ isDragging: m.isDragging() }),
    }),
    [id, title]
  );
  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [dragPreview]);

  // Drop target shares the terminal hook; no file handler — a native file
  // drop over a browser pane is a quiet no-op (no wash, no staging).
  const { dropRef, isOver, hoverEdge, dropIsSelf } = usePaneDropTarget({
    id,
    bodyRef,
    resolveDropEdge,
    onMovePane,
  });

  const showIndicator = isOver && !dropIsSelf && hoverEdge !== null;

  const classes = ["pane", "pane-files"];
  if (focused) classes.push("focused");
  if (maximized) classes.push("maximized");
  if (isDragging) classes.push("pane-dragging");

  // Any press inside the pane focuses it (the list is the keyboard target);
  // the header's maximize/close buttons are exempt, matching terminals.
  const handlePaneMouseDown = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".pane-btn") && t.closest(".pane-header")) return;
    onFocus();
  };

  const headerDragRef = maximized
    ? undefined
    : (dragRef as unknown as React.Ref<HTMLDivElement>);

  const crumbs = crumbsFor(dir, home);
  const atRoot = dir === "/";

  // ENOENT = the open dir was deleted from under us (or a restored cwd is
  // gone); EACCES/EPERM = unreadable. Both are inline states, never a crash.
  const deletedDir = error === "ENOENT" || error === "ENOTDIR";
  const errorText = deletedDir
    ? "This folder no longer exists."
    : error === "EACCES" || error === "EPERM"
      ? "You don't have permission to view this folder."
      : error
        ? "This folder can't be read."
        : null;

  const pane = (
    <div className={classes.join(" ")} onMouseDown={handlePaneMouseDown}>
      <div
        className="pane-header"
        ref={headerDragRef}
        onContextMenu={(e) => {
          e.preventDefault();
          onHeaderContextMenu();
        }}
      >
        <span className="pane-header-icon" aria-hidden><IconFolderHeader /></span>
        <span className="pane-header-title" title={dir}>{title}</span>
        <button
          className="pane-btn"
          aria-label={maximized ? "Restore pane" : "Maximize pane"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={onToggleMaximize}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </button>
        <button
          className="pane-btn"
          aria-label="Close pane"
          title="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>
      </div>
      <div className="files-toolbar">
        <button
          className="pane-btn"
          aria-label="Up one folder"
          title="Up"
          disabled={atRoot}
          onClick={goUp}
        >
          <IconUp />
        </button>
        <div className="files-crumbs" ref={crumbsRef}>
          {crumbs.map((c, i) => (
            <span key={c.path} className="files-crumb-pair">
              {i > 0 && <span className="files-crumb-sep" aria-hidden>/</span>}
              {i === crumbs.length - 1 ? (
                <span className="files-crumb current" title={c.path}>
                  {c.label}
                </span>
              ) : (
                <button
                  className="files-crumb"
                  title={c.path}
                  onClick={() => navigate(c.path)}
                >
                  {c.label}
                </button>
              )}
            </span>
          ))}
        </div>
        <button
          className="pane-btn"
          aria-label={showHidden ? "Hide hidden files" : "Show hidden files"}
          aria-pressed={showHidden}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
          onClick={() => setShowHidden((v) => !v)}
        >
          {showHidden ? <IconEye /> : <IconEyeOff />}
        </button>
        <button
          className="pane-btn"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => void load(dir)}
        >
          <IconRefresh />
        </button>
      </div>
      <div
        className="pane-body files-body"
        ref={(el) => {
          bodyRef.current = el;
          dropRef(el);
        }}
      >
        {errorText ? (
          <div className="files-state" role="alert">
            <span>{errorText}</span>
            {deletedDir && (
              <button className="files-state-btn" onClick={goHome}>
                Go Home
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="files-cols" aria-hidden>
              <span className="files-col-name">Name</span>
              <span className="files-col-size">Size</span>
              <span className="files-col-mtime">Modified</span>
            </div>
            <div
              className="files-list"
              role="listbox"
              aria-label="Files"
              tabIndex={0}
              ref={listRef}
              onKeyDown={onListKeyDown}
            >
              {visible.length === 0 ? (
                <div className="files-state">
                  <span>
                    {entries.length > 0 ? "Only hidden items here" : "Empty folder"}
                  </span>
                </div>
              ) : (
                visible.map((entry, i) => (
                  <div
                    key={entry.name}
                    className={`files-entry${i === sel ? " selected" : ""}${entry.hidden ? " hidden-entry" : ""}`}
                    role="option"
                    aria-selected={i === sel}
                    data-selected={i === sel || undefined}
                    onClick={() => setSelected(i)}
                    onDoubleClick={() => openEntry(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(i);
                      window.mandeck.showFilesMenu({
                        path: joinDir(dir, entry.name),
                        isDir: entry.isDir,
                      });
                    }}
                  >
                    <span className="files-entry-icon" aria-hidden>
                      {entry.isDir ? <IconRowFolder /> : <IconRowFile />}
                    </span>
                    <span className="files-entry-name" title={entry.name}>
                      {entry.name}
                      {entry.symlink && (
                        <span className="files-entry-link" aria-label="symlink">
                          {" "}↗
                        </span>
                      )}
                    </span>
                    <span className="files-entry-size">
                      {entry.isDir ? "—" : formatSize(entry.size)}
                    </span>
                    <span className="files-entry-mtime">
                      {formatMtime(entry.mtime)}
                    </span>
                  </div>
                ))
              )}
            </div>
            {total > entries.length && (
              <div className="files-cap-note">
                Showing first {entries.length} of {total} items
              </div>
            )}
          </>
        )}
        {showIndicator && (
          <div className={`pane-drop-indicator edge-${hoverEdge}`} aria-hidden />
        )}
      </div>
    </div>
  );

  return (
    <>
      {(spotlightOn || scrimExiting) &&
        createPortal(
          <>
            <div
              className={`pane-maximize-scrim${scrimExiting ? " exiting" : ""}`}
              aria-hidden
            />
            {spotlightOn && (
              <div className="pane-spotlight" ref={spotlightSlotRef} />
            )}
          </>,
          getOverlayHost()
        )}
      {createPortal(pane, paneHostRef.current)}
    </>
  );
}
