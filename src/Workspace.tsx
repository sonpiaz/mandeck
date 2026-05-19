import { useEffect, useRef } from "react";
import { Allotment, type AllotmentHandle } from "allotment";
import { Terminal } from "./Terminal";
import type { Col, Edge } from "./types";

type Props = {
  tid: string;
  cols: Col[];
  focusedPaneId: string;
  maximizedPaneId: string | null;
  paneCwds: Record<string, string>;
  active: boolean;
  onFocusPane: (pid: string) => void;
  onClosePane: (pid: string) => void;
  onToggleMaximize: (pid: string) => void;
  onMovePane: (src: string, target: string, edge: Edge) => void;
  onPaneCwd: (pid: string, cwd: string) => void;
};

export function Workspace({
  tid,
  cols,
  focusedPaneId,
  maximizedPaneId,
  paneCwds,
  active,
  onFocusPane,
  onClosePane,
  onToggleMaximize,
  onMovePane,
  onPaneCwd,
}: Props) {
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
  // dragged into place survive ⌘D.
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
      data-tid={tid}
      style={{ display: active ? "block" : "none" }}
    >
      {active && maximizedPaneId && <div className="pane-maximize-backdrop" />}
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
                  <Terminal
                    id={pid}
                    initialCwd={paneCwds[pid]}
                    focused={active && pid === focusedPaneId}
                    maximized={pid === maximizedPaneId}
                    onFocus={() => onFocusPane(pid)}
                    onClose={() => onClosePane(pid)}
                    onToggleMaximize={() => onToggleMaximize(pid)}
                    onMovePane={onMovePane}
                    onCwdChange={onPaneCwd}
                  />
                </Allotment.Pane>
              ))}
            </Allotment>
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
