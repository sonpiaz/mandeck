import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Terminal as XTerm, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage, NativeTypes } from "react-dnd-html5-backend";
import { PANE_DND_TYPE, type Edge, type PaneDragItem } from "./types";
import { buildTerminalTheme } from "./terminal-theme";
import { getOverlayHost } from "./overlay";
import { abbreviatePath } from "./paths";

function shellQuoteIfNeeded(p: string): string {
  if (!/[\s'"\\$`(){}[\]&;<>*?#!]/.test(p)) return p;
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

async function pathsForFiles(files: File[]): Promise<string[]> {
  return files
    .map((f) => {
      const legacy = (f as File & { path?: string }).path;
      if (typeof legacy === "string" && legacy.length > 0) return legacy;
      return window.mandeck.getPathForFile(f);
    })
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}
import type { MandeckApi } from "../electron/preload";

declare global {
  interface Window { mandeck: MandeckApi }
}

type Props = {
  id: string;
  initialCwd?: string;
  accent: string;
  solidBg: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  active: boolean;
  focused: boolean;
  maximized: boolean;
  onFocus: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  onMovePane: (src: string, target: string, edge: Edge) => void;
  onCwdChange: (pid: string, cwd: string) => void;
  resolveDropEdge: (srcPid: string, edge: Edge) => Edge;
};

function edgeFromOffset(
  x: number,
  y: number,
  w: number,
  h: number
): Edge {
  const nx = x / w - 0.5; // -0.5 .. 0.5
  const ny = y / h - 0.5;
  if (Math.abs(nx) > Math.abs(ny)) {
    return nx < 0 ? "left" : "right";
  }
  return ny < 0 ? "top" : "bottom";
}

const HOST_LABEL = (() => {
  const { user, host } = window.mandeck.hostInfo;
  return `${user}@${host}`;
})();

// D1 leading icon: 14×14 prompt-in-rounded-square terminal glyph.
const IconPane = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1.5" width="12" height="11" rx="2.5" />
    <path d="M4 5.5l2.2 1.7L4 8.9" />
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

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

export function Terminal({
  id,
  initialCwd,
  accent,
  solidBg,
  fontFamily,
  fontSize,
  lineHeight,
  active,
  focused,
  maximized,
  onFocus,
  onClose,
  onToggleMaximize,
  onMovePane,
  onCwdChange,
  resolveDropEdge,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const hoveredUrlRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [oscTitle, setOscTitle] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(initialCwd ?? null);
  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const onCwdChangeRef = useRef(onCwdChange);
  useEffect(() => { onCwdChangeRef.current = onCwdChange; }, [onCwdChange]);

  // D1 title fallback chain: abbreviated cwd path → OSC 0/2 title →
  // user@host. The native tooltip carries the full untruncated path.
  const title = cwd
    ? abbreviatePath(cwd, window.mandeck.homeDir)
    : oscTitle ?? HOST_LABEL;

  // D3 stable per-pane host element: the pane renders exactly once into this
  // manually-owned element (React only ever touches its children, via the
  // portal below); the grid slot and the spotlight frame are dumb slots that
  // adopt it imperatively. Toggling maximize therefore never changes the
  // React identity of the terminal — the no-remount rule (INV-8/INV-13).
  const paneHostRef = useRef<HTMLDivElement | null>(null);
  if (!paneHostRef.current) {
    const el = document.createElement("div");
    el.className = "pane-host";
    paneHostRef.current = el;
  }
  const gridSlotRef = useRef<HTMLDivElement | null>(null);
  const spotlightSlotRef = useRef<HTMLDivElement | null>(null);

  // The spotlight (scrim + frame) exists only while this pane is maximized
  // in the ACTIVE workspace — a dormant workspace's persisted maximize is
  // revealed with the workspace (B4), not painted over other workspaces.
  const spotlightOn = maximized && active;
  const [scrimExiting, setScrimExiting] = useState(false);
  const prevSpotlightRef = useRef(spotlightOn);
  useEffect(() => {
    const was = prevSpotlightRef.current;
    prevSpotlightRef.current = spotlightOn;
    // Re-maximizing during the fade cancels the exit immediately.
    if (spotlightOn) {
      setScrimExiting(false);
      return;
    }
    // Restore-by-toggle plays the 250ms scrim fade-out (D3); switching
    // workspaces away while still maximized stays instant (B4).
    if (was && !maximized) {
      setScrimExiting(true);
      const t = setTimeout(() => setScrimExiting(false), 250);
      return () => clearTimeout(t);
    }
  }, [spotlightOn, maximized]);

  // Slot adoption + refit. Declared BEFORE the xterm mount effect so the
  // host element is attached to the document by the time xterm opens.
  useEffect(() => {
    const host = paneHostRef.current;
    if (!host) return;
    const target = spotlightOn ? spotlightSlotRef.current : gridSlotRef.current;
    if (target && host.parentElement !== target) target.appendChild(host);
    // Activation/toggle is the resize-reconciliation point (B4/D3): fit in a
    // rAF once the container has real dimensions. Adopting the host element
    // may drop the WebGL context; the addon's DOM fallback engages and this
    // refit repaints.
    const raf = requestAnimationFrame(() => {
      try { fitRef.current?.fit(); } catch { /* hidden container */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [spotlightOn, active]);

  // --- Pane-as-draggable (header is the handle) -----------------------------
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
    // Hide the default HTML5 drag preview; PaneDragLayer renders our own.
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [dragPreview]);

  // --- Pane-as-drop-target (body computes which edge the cursor is over) ----
  const computeEdge = useCallback(
    (clientX: number, clientY: number): Edge | null => {
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return edgeFromOffset(
        clientX - rect.left,
        clientY - rect.top,
        rect.width,
        rect.height
      );
    },
    []
  );

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const sourcePaths = await pathsForFiles(files);
      if (sourcePaths.length === 0) {
        console.warn(
          "[mandeck] drop: no filesystem path for",
          files.map((f) => f.name)
        );
        return;
      }
      const staged = await Promise.all(
        sourcePaths.map((src) => window.mandeck.stageDroppedFile(src))
      );
      const finalPaths = staged
        .map((p, i) => p || sourcePaths[i])
        .filter((p) => p.length > 0);
      if (finalPaths.length === 0) return;
      onFocus();
      termRef.current?.focus();
      // Stage paths are space-free, but be defensive for the original-path
      // fallback case where staging failed.
      window.mandeck.write(id, finalPaths.map(shellQuoteIfNeeded).join(" "));
    },
    [id, onFocus]
  );

  const [{ isOver, draggedPid, hoveringType }, dropRef] = useDrop<
    PaneDragItem | { files: File[] },
    void,
    {
      isOver: boolean;
      draggedPid: string | null;
      hoveringType: string | symbol | null;
    }
  >(
    () => ({
      accept: [PANE_DND_TYPE, NativeTypes.FILE],
      hover: (_item, monitor) => {
        if (monitor.getItemType() !== PANE_DND_TYPE) {
          if (hoverEdge !== null) setHoverEdge(null);
          return;
        }
        const item = monitor.getItem() as PaneDragItem;
        if (item.pid === id) {
          setHoverEdge(null);
          return;
        }
        const offset = monitor.getClientOffset();
        if (!offset) return;
        // Resolve the cap fallback up front so the wash shows the half that
        // will actually be used (D2 §7).
        const raw = computeEdge(offset.x, offset.y);
        const edge = raw ? resolveDropEdge(item.pid, raw) : raw;
        if (edge !== hoverEdge) setHoverEdge(edge);
      },
      drop: (_item, monitor) => {
        const type = monitor.getItemType();
        if (type === NativeTypes.FILE) {
          const payload = monitor.getItem() as { files?: File[] };
          if (payload?.files?.length) void handleFileDrop(payload.files);
          return;
        }
        const paneItem = monitor.getItem() as PaneDragItem;
        if (paneItem.pid === id) return;
        const offset = monitor.getClientOffset();
        const raw = offset ? computeEdge(offset.x, offset.y) : hoverEdge;
        const edge = raw ? resolveDropEdge(paneItem.pid, raw) : raw;
        if (edge) onMovePane(paneItem.pid, id, edge);
        setHoverEdge(null);
      },
      collect: (m) => ({
        isOver: m.isOver({ shallow: true }),
        draggedPid:
          m.getItemType() === PANE_DND_TYPE
            ? ((m.getItem() as PaneDragItem | null)?.pid ?? null)
            : null,
        hoveringType: m.isOver({ shallow: true }) ? m.getItemType() : null,
      }),
    }),
    [id, computeEdge, hoverEdge, onMovePane, handleFileDrop, resolveDropEdge]
  );

  // Drive the existing drag-over visual state via react-dnd instead of the
  // native dragover listener we used to install on `host` — react-dnd's
  // backend now owns those events, so the old listener never fired.
  useEffect(() => {
    setDragOver(isOver && hoveringType === NativeTypes.FILE);
  }, [isOver, hoveringType]);

  useEffect(() => {
    if (!isOver) setHoverEdge(null);
  }, [isOver]);

  const dropIsSelf = draggedPid === id;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      // Font values come from settings (C3); the mount-time closure values
      // are current because terminals only mount after settings load. Later
      // changes arrive through the live-apply effect below.
      fontFamily,
      fontSize,
      lineHeight,
      cursorBlink: true,
      allowProposedApi: true,
      // Required for the 0.92 alpha background; must be set before open (A2).
      allowTransparency: true,
      theme: buildTerminalTheme(accent, solidBg),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    // A2/D1 canonical triple: WebGL + allowTransparency + 0.92 background.
    // On context loss the addon is disposed and xterm falls back to its DOM
    // renderer — the accepted degradation path.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch { /* WebGL unavailable — DOM renderer */ }
    try { fit.fit(); } catch { /* noop */ }

    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;
    let offData = () => {};
    let offExit = () => {};

    const { cols, rows } = term;
    window.mandeck
      .createPty({ id, cols, rows, cwd: initialCwd })
      .then(() => {
        if (disposed) {
          window.mandeck.kill(id);
          return;
        }
        offData = window.mandeck.onData(id, (data) => {
          if (!disposed) term.write(data);
        });
        offExit = window.mandeck.onExit(id, () => {
          if (!disposed) term.write("\r\n[process exited]\r\n");
        });
        term.focus();
      })
      .catch((err) => console.error("createPty failed", err));

    const inputDisp = term.onData((data) => {
      window.mandeck.write(id, data);
    });
    const resizeDisp = term.onResize(({ cols, rows }) => {
      window.mandeck.resize(id, cols, rows);
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* not ready */ }
    });
    ro.observe(host);

    const titleDisp = term.onTitleChange((t) => {
      const trimmed = t.trim();
      if (trimmed) setOscTitle(trimmed);
    });

    // OSC 7: shells report cwd as `file://host/path` on every prompt. The
    // local copy drives the D1 header title; the callback persists the map.
    const cwdOscDisp = term.parser.registerOscHandler(7, (data) => {
      const m = /^file:\/\/[^/]*(\/.*)$/.exec(data);
      if (m) {
        try {
          const reported = decodeURIComponent(m[1]);
          setCwd(reported);
          onCwdChangeRef.current(id, reported);
        } catch { /* malformed encoding — ignore */ }
      }
      return true;
    });

    const mouseDown = () => {
      onFocus();
      term.focus();
    };
    host.addEventListener("mousedown", mouseDown);

    const linkProvider = term.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const buffer = term.buffer.active;
        const startLine = buffer.getLine(lineNumber - 1);
        if (!startLine) return callback(undefined);
        let text = startLine.translateToString(true);
        for (let next = lineNumber; ; next++) {
          const ln = buffer.getLine(next);
          if (!ln || !ln.isWrapped) break;
          text += ln.translateToString(true);
        }
        const cols = term.cols;
        const links: ILink[] = [];
        URL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = URL_RE.exec(text)) !== null) {
          const start = m.index;
          const end = start + m[0].length - 1;
          const startCol = (start % cols) + 1;
          const startRow = lineNumber + Math.floor(start / cols);
          const endCol = (end % cols) + 1;
          const endRow = lineNumber + Math.floor(end / cols);
          links.push({
            range: {
              start: { x: startCol, y: startRow },
              end: { x: endCol, y: endRow },
            },
            text: m[0],
            activate: (e, url) => {
              // Match macOS terminal convention: only open on ⌘+click
              // (or Ctrl+click elsewhere). A plain click should not yank
              // the user out into a browser by accident.
              if (!e.metaKey && !e.ctrlKey) return;
              window.mandeck.openExternal(url).catch(() => {});
            },
            hover: (_e, url) => {
              hoveredUrlRef.current = url;
              host.style.cursor = "pointer";
            },
            leave: () => {
              hoveredUrlRef.current = null;
              host.style.cursor = "";
            },
          });
        }
        callback(links);
      },
    });

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const url = hoveredUrlRef.current ?? undefined;
      let selection: string | undefined = term.getSelection() || undefined;
      if (!url && selection && URL_RE.test(selection.trim())) {
        URL_RE.lastIndex = 0;
        const trimmed = selection.trim();
        if (/^https?:\/\/\S+$/.test(trimmed)) {
          window.mandeck.showCtxMenu({ url: trimmed, selection });
          return;
        }
      }
      URL_RE.lastIndex = 0;
      window.mandeck.showCtxMenu({ url, selection });
    };
    host.addEventListener("contextmenu", onContextMenu);

    const offPaste = window.mandeck.onCtxMenuPaste(() => {
      window.mandeck.readClipboardText().then((text) => {
        if (text) window.mandeck.write(id, text);
      });
    });

    // Note: file drop handling lives in the useDrop hook above. react-dnd
    // owns dragover/drop globally, so installing listeners on `host`
    // directly would never fire. The hook routes NativeTypes.FILE drops
    // through handleFileDrop and PANE_DND_TYPE drops through onMovePane.

    return () => {
      disposed = true;
      ro.disconnect();
      host.removeEventListener("mousedown", mouseDown);
      host.removeEventListener("contextmenu", onContextMenu);
      titleDisp.dispose();
      cwdOscDisp.dispose();
      linkProvider.dispose();
      offPaste();
      inputDisp.dispose();
      resizeDisp.dispose();
      offData();
      offExit();
      window.mandeck.kill(id);
      try { term.dispose(); } catch { /* noop */ }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id]);

  // Theme changes (workspace accent, reduced-transparency/Opaque mode)
  // mutate xterm options in place — never a remount (INV-10/INV-13).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = buildTerminalTheme(accent, solidBg);
  }, [accent, solidBg]);

  // C3 live-apply: font changes mutate xterm options in place and re-fit —
  // never a remount (a remounted terminal is a dead shell). Dormant
  // workspaces no-op the fit; B4's activation rAF reconciles them.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (
      term.options.fontFamily === fontFamily &&
      term.options.fontSize === fontSize &&
      term.options.lineHeight === lineHeight
    ) {
      return;
    }
    term.options.fontFamily = fontFamily;
    term.options.fontSize = fontSize;
    term.options.lineHeight = lineHeight;
    try { fitRef.current?.fit(); } catch { /* hidden container */ }
  }, [fontFamily, fontSize, lineHeight]);

  useEffect(() => {
    if (focused) {
      termRef.current?.focus();
      try { fitRef.current?.fit(); } catch { /* noop */ }
    }
  }, [focused]);

  // Workspace activation and maximize toggles share one reconciliation
  // point: the slot-adoption effect above refits in a rAF on every
  // (active, maximized) change (B4/D3).

  const classes = ["pane"];
  if (focused) classes.push("focused");
  if (dragOver) classes.push("drag-over");
  if (maximized) classes.push("maximized");
  if (isDragging) classes.push("pane-dragging");

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".pane-btn")) return;
    onFocus();
  };

  const showIndicator = isOver && !dropIsSelf && hoverEdge !== null;

  // While spotlighted, the header is NOT a drag handle (D1): the drag
  // connector is simply not attached, so the grab affordance and drag start
  // are both absent. Un-maximize first to move the pane.
  const headerDragRef = maximized
    ? undefined
    : (dragRef as unknown as React.Ref<HTMLDivElement>);

  const pane = (
    <div className={classes.join(" ")}>
      <div
        className="pane-header"
        ref={headerDragRef}
        onMouseDown={handleHeaderMouseDown}
      >
        <span className="pane-header-icon" aria-hidden><IconPane /></span>
        <span className="pane-header-title" title={cwd ?? title}>{title}</span>
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
      <div
        className="pane-body"
        ref={(el) => {
          bodyRef.current = el;
          dropRef(el);
        }}
      >
        <div ref={hostRef} className="xterm-container" />
        {showIndicator && (
          <div className={`pane-drop-indicator edge-${hoverEdge}`} aria-hidden />
        )}
      </div>
    </div>
  );

  // Grid cell slot + body-portal spotlight (scrim z 800, frame z 810 — D3
  // layer table) + the pane itself, portaled once into the stable host the
  // slots adopt. The scrim is inert: only the header button toggles.
  return (
    <>
      <div className="pane-grid-slot" ref={gridSlotRef} />
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
