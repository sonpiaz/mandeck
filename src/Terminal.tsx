import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { MandeckApi } from "../electron/preload";

declare global {
  interface Window { mandeck: MandeckApi }
}

type Props = {
  id: string;
  focused: boolean;
  maximized: boolean;
  onFocus: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
};

const HOST_LABEL = (() => {
  const { user, host } = window.mandeck.hostInfo;
  return `${user}@${host}`;
})();

const IconMaximize = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4.5 V 2.5 H 4.5 M7.5 2.5 H 9.5 V 4.5 M9.5 7.5 V 9.5 H 7.5 M4.5 9.5 H 2.5 V 7.5" />
  </svg>
);
const IconRestore = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4.5 H 4.5 V 2.5 M9.5 4.5 H 7.5 V 2.5 M2.5 7.5 H 4.5 V 9.5 M9.5 7.5 H 7.5 V 9.5" />
  </svg>
);
const IconClose = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
    <path d="M3 3 L 9 9 M9 3 L 3 9" />
  </svg>
);

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

export function Terminal({
  id,
  focused,
  maximized,
  onFocus,
  onClose,
  onToggleMaximize,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const hoveredUrlRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState(HOST_LABEL);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: "#0e1116",
        foreground: "#e6edf3",
        cursor: "#2f81f7",
        black: "#0e1116",
        red: "#f85149",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ff7b72",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try { fit.fit(); } catch { /* noop */ }

    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;
    let offData = () => {};
    let offExit = () => {};

    const { cols, rows } = term;
    window.mandeck
      .createPty({ id, cols, rows })
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
      if (trimmed) setTitle(trimmed);
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
            activate: (_e, url) => {
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

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget && host.contains(e.relatedTarget as Node)) return;
      setDragOver(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      const sourcePaths = files
        .map((f) => {
          const legacy = (f as File & { path?: string }).path;
          if (typeof legacy === "string" && legacy.length > 0) return legacy;
          return window.mandeck.getPathForFile(f);
        })
        .filter((p): p is string => typeof p === "string" && p.length > 0);
      if (sourcePaths.length === 0) {
        console.warn("[mandeck] drop: no filesystem path for", files.map((f) => f.name));
        return;
      }
      const staged = await Promise.all(
        sourcePaths.map((src) => window.mandeck.stageDroppedFile(src))
      );
      const finalPaths = staged
        .map((p, i) => p || sourcePaths[i])
        .filter((p) => p.length > 0);
      onFocus();
      term.focus();
      const text = finalPaths.join(" ");
      window.mandeck.write(id, text);
    };
    host.addEventListener("dragover", onDragOver);
    host.addEventListener("dragleave", onDragLeave);
    host.addEventListener("drop", onDrop);

    return () => {
      disposed = true;
      ro.disconnect();
      host.removeEventListener("mousedown", mouseDown);
      host.removeEventListener("contextmenu", onContextMenu);
      host.removeEventListener("dragover", onDragOver);
      host.removeEventListener("dragleave", onDragLeave);
      host.removeEventListener("drop", onDrop);
      titleDisp.dispose();
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

  useEffect(() => {
    if (focused) {
      termRef.current?.focus();
      try { fitRef.current?.fit(); } catch { /* noop */ }
    }
  }, [focused]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try { fitRef.current?.fit(); } catch { /* noop */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [maximized]);

  const classes = ["pane"];
  if (focused) classes.push("focused");
  if (dragOver) classes.push("drag-over");
  if (maximized) classes.push("maximized");

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".pane-btn")) return;
    onFocus();
  };

  return (
    <div className={classes.join(" ")}>
      <div className="pane-header" onMouseDown={handleHeaderMouseDown}>
        <span className="pane-header-icon" aria-hidden>▢</span>
        <span className="pane-header-title" title={title}>{title}</span>
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
      <div className="pane-body">
        <div ref={hostRef} className="xterm-container" />
      </div>
    </div>
  );
}
