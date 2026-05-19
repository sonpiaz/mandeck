import { useEffect, useRef } from "react";
import { Allotment, type AllotmentHandle } from "allotment";
import { Terminal } from "./Terminal";
import type { Col } from "./types";

type Props = {
  tid: string;
  cols: Col[];
  focusedPaneId: string;
  maximizedPaneId: string | null;
  active: boolean;
  onFocusPane: (pid: string) => void;
  onClosePane: (pid: string) => void;
  onToggleMaximize: (pid: string) => void;
};

export function Workspace({
  tid,
  cols,
  focusedPaneId,
  maximizedPaneId,
  active,
  onFocusPane,
  onClosePane,
  onToggleMaximize,
}: Props) {
  const outerRef = useRef<AllotmentHandle>(null);
  const innerRefs = useRef<Map<string, AllotmentHandle | null>>(new Map());
  const hasInitialResetRef = useRef(false);

  // Reset Allotment to even splits ONLY the first time this workspace
  // becomes active. Subsequent add/close/maximize operations preserve
  // whatever ratios the user dragged into place — new panes get the
  // freed space, not a full layout reset.
  useEffect(() => {
    if (!active || hasInitialResetRef.current) return;
    const raf = requestAnimationFrame(() => {
      outerRef.current?.reset();
      innerRefs.current.forEach((ref) => ref?.reset());
      hasInitialResetRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

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
                    focused={active && pid === focusedPaneId}
                    maximized={pid === maximizedPaneId}
                    onFocus={() => onFocusPane(pid)}
                    onClose={() => onClosePane(pid)}
                    onToggleMaximize={() => onToggleMaximize(pid)}
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
