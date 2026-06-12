import { useCallback, useEffect, useRef } from "react";
import { Allotment, type AllotmentHandle } from "allotment";
import { clearPaneSlot, setPaneSlot } from "./pane-slots";
import type { Col } from "./types";

type Props = {
  workspaceId: string;
  cols: Col[];
  active: boolean;
};

// Dumb grid slot: registers itself in the pane-slot registry so the pane's
// hoisted Terminal (rendered at the App level) can adopt its stable host
// element here. The ref callback is stable per pid, so registration fires
// only on mount/unmount — never on plain re-renders.
function PaneSlot({ pid }: { pid: string }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        elRef.current = node;
        setPaneSlot(pid, node);
      } else if (elRef.current) {
        clearPaneSlot(pid, elRef.current);
        elRef.current = null;
      }
    },
    [pid]
  );
  return <div className="pane-grid-slot" ref={ref} />;
}

// The pane grid one workspace owns. Stays mounted while its workspace is
// dormant (display:none) — unmounting would tear down the slots mid-session
// (B4). Terminals themselves live above the grids (see App's flat pane
// list), so any structural change here only moves dumb slots around.
export function PaneGrid({ workspaceId, cols, active }: Props) {
  const totalPanes = cols.reduce((s, c) => s + c.panes.length, 0);

  const outerRef = useRef<AllotmentHandle>(null);
  const innerRefs = useRef<Map<string, AllotmentHandle | null>>(new Map());
  const hasInitialResetRef = useRef(false);
  const prevColsCountRef = useRef(cols.length);
  const prevTotalPanesRef = useRef(totalPanes);

  // Reset Allotment to even splits in three cases:
  //   1. First time this workspace becomes active (initial layout).
  //   2. A column was closed — the remaining columns should redistribute
  //      evenly instead of leaving an empty gap where the closed one was.
  //   3. A pane was closed — its sibling panes in the column should
  //      redistribute evenly for the same reason.
  // Adding a pane never triggers reset, so any custom ratios the user
  // dragged into place survive ⌘D. Subsequent activations never reset
  // splitters, so user-dragged ratios survive workspace switching (B4).
  useEffect(() => {
    if (!active) return;
    const isFirst = !hasInitialResetRef.current;
    const shrunk =
      cols.length < prevColsCountRef.current ||
      totalPanes < prevTotalPanesRef.current;
    prevColsCountRef.current = cols.length;
    prevTotalPanesRef.current = totalPanes;
    if (!isFirst && !shrunk) return;
    const raf = requestAnimationFrame(() => {
      outerRef.current?.reset();
      innerRefs.current.forEach((ref) => ref?.reset());
      hasInitialResetRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [active, cols.length, totalPanes]);

  return (
    <div
      className="workspace"
      data-workspace-id={workspaceId}
      style={{ display: active ? "block" : "none" }}
    >
      <Allotment ref={outerRef} separator={false}>
        {cols.map((col) => (
          <Allotment.Pane key={col.cid} minSize={140}>
            <Allotment
              vertical
              separator={false}
              ref={(r) => {
                innerRefs.current.set(col.cid, r);
              }}
            >
              {col.panes.map((pid) => (
                <Allotment.Pane key={pid} minSize={80}>
                  <PaneSlot pid={pid} />
                </Allotment.Pane>
              ))}
            </Allotment>
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
