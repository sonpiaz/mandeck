import { useCallback, useEffect, useRef, useState } from "react";

export type WorkspaceSummary = {
  id: string;
  title: string;
  autoNamed: boolean;
};

type Props = {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
};

// Overlay scrollbar fades about 1.3s after the pointer leaves (A3).
const SCROLLBAR_FADE_MS = 1300;

export function WorkspaceBar({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onClose,
  onRename,
  onNew,
  onReorder,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const chipRefs = useRef(new Map<string, HTMLDivElement | null>());
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Overlay scrollbar state: present only while the strip overflows
  // (shrink-then-scroll, A3); no scrollbar flash while the strip fits.
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const [thumbVisible, setThumbVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragScroll = useRef<{ startX: number; startLeft: number } | null>(null);

  const stripScrollable = () => {
    const el = stripRef.current;
    return !!el && el.scrollWidth > el.clientWidth + 1;
  };

  const updateThumb = useCallback(() => {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) {
      setThumb(null);
      return false;
    }
    setThumb({
      left: (el.scrollLeft / el.scrollWidth) * el.clientWidth,
      width: (el.clientWidth / el.scrollWidth) * el.clientWidth,
    });
    return true;
  }, []);

  const showThumb = useCallback(() => {
    if (!updateThumb()) return;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setThumbVisible(true);
  }, [updateThumb]);

  const scheduleHideThumb = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setThumbVisible(false), SCROLLBAR_FADE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateThumb]);

  useEffect(() => {
    updateThumb();
  }, [workspaces.length, updateThumb]);

  // Reveal the active chip when it changes (covers B2's create auto-scroll);
  // motion-smooth, collapsing to instant under reduced motion (A1).
  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    chipRefs.current.get(activeWorkspaceId)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeWorkspaceId, workspaces.length]);

  return (
    <>
      <div className="ws-strip-wrap">
        <div
          className="ws-strip"
          ref={stripRef}
          onScroll={() => updateThumb()}
          onMouseEnter={showThumb}
          onMouseLeave={scheduleHideThumb}
          onWheel={(e) => {
            const el = stripRef.current;
            // No-op while the strip fits (A3 §7).
            if (!el || !stripScrollable()) return;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              el.scrollLeft += e.deltaY;
            }
          }}
          onPointerDown={(e) => {
            // Drag-to-scroll on blank strip area; chips keep their own
            // HTML5 reorder drag.
            const el = stripRef.current;
            if (!el || !stripScrollable()) return;
            if ((e.target as HTMLElement).closest(".ws-chip, button, input")) return;
            dragScroll.current = { startX: e.clientX, startLeft: el.scrollLeft };
            el.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const el = stripRef.current;
            const ds = dragScroll.current;
            if (!el || !ds) return;
            el.scrollLeft = ds.startLeft - (e.clientX - ds.startX);
          }}
          onPointerUp={() => {
            dragScroll.current = null;
          }}
          onPointerCancel={() => {
            dragScroll.current = null;
          }}
        >
          {workspaces.map((ws) => {
            const active = ws.id === activeWorkspaceId;
            const editing = editingId === ws.id;
            return (
              <div
                key={ws.id}
                ref={(el) => {
                  chipRefs.current.set(ws.id, el);
                }}
                className={`ws-chip${active ? " active" : ""}`}
                title={editing ? undefined : ws.title || "untitled"}
                onClick={() => onSelect(ws.id)}
                onDoubleClick={() => setEditingId(ws.id)}
                draggable={!editing}
                onDragStart={() => {
                  // A drag starting while another chip's rename editor is open
                  // blurs the editor first, committing its draft (SPEC B2).
                  const el = document.activeElement;
                  if (el instanceof HTMLElement && el.classList.contains("ws-chip-input")) {
                    el.blur();
                  }
                  dragId.current = ws.id;
                }}
                onDragEnd={() => {
                  dragId.current = null;
                }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId.current && dragId.current !== ws.id) {
                    onReorder(dragId.current, ws.id);
                  }
                  dragId.current = null;
                }}
              >
                {editing ? (
                  <ChipRename
                    initial={ws.autoNamed ? "" : ws.title}
                    placeholder={ws.title}
                    onCommit={(value) => {
                      onRename(ws.id, value);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <span className="ws-chip-title">
                      {ws.title || "untitled"}
                    </span>
                    {workspaces.length > 1 && (
                      <button
                        className="ws-chip-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose(ws.id);
                        }}
                        aria-label="Close workspace"
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {thumb && (
          <div
            className={`ws-strip-scrollbar${thumbVisible ? " visible" : ""}`}
            style={{ left: thumb.left, width: thumb.width }}
            aria-hidden
          />
        )}
      </div>
      <button className="ws-add" onClick={onNew} aria-label="New workspace">
        +
      </button>
    </>
  );
}

function ChipRename({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="ws-chip-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(value.trim())}
    />
  );
}
