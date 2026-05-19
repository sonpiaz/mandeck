import { useEffect, useRef, useState } from "react";
import { DndProvider, useDragLayer } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TabBar } from "./TabBar";
import { Workspace } from "./Workspace";
import { PaneDragLayer } from "./PaneDragLayer";
import {
  PANE_DND_TYPE,
  PERSIST_VERSION,
  type AppState,
  type Col,
  type Edge,
  type PersistedState,
  type Tab,
} from "./types";

let _pid = 0;
let _cid = 0;
let _tid = 0;
const newPid = () => `p${++_pid}`;
const newCid = () => `c${++_cid}`;
const newTid = () => `t${++_tid}`;
const paneAge = (id: string) => Number(id.slice(1)) || 0;

const MAX_COLS = 5;

const makeTab = (): Tab => {
  const pid = newPid();
  return {
    tid: newTid(),
    title: "shell",
    autoNamed: true,
    cols: [{ cid: newCid(), panes: [pid] }],
    focusedPaneId: pid,
    maximizedPaneId: null,
  };
};

const initialState = (): AppState => {
  const tab = makeTab();
  return { tabs: [tab], activeTabId: tab.tid, paneCwds: {} };
};

function maxNumericSuffix(ids: string[]): number {
  let m = 0;
  for (const id of ids) {
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > m) m = n;
  }
  return m;
}

function restoreCounters(state: AppState) {
  const pids: string[] = [];
  const cids: string[] = [];
  const tids: string[] = [];
  for (const t of state.tabs) {
    tids.push(t.tid);
    for (const c of t.cols) {
      cids.push(c.cid);
      for (const p of c.panes) pids.push(p);
    }
  }
  _pid = maxNumericSuffix(pids);
  _cid = maxNumericSuffix(cids);
  _tid = maxNumericSuffix(tids);
}

function hydrate(saved: unknown): AppState | null {
  if (!saved || typeof saved !== "object") return null;
  const s = saved as Partial<PersistedState>;
  if (s.version !== PERSIST_VERSION) return null;
  if (!Array.isArray(s.tabs) || s.tabs.length === 0) return null;
  if (typeof s.activeTabId !== "string") return null;
  // Sanity-check structure; if anything's malformed, fall back to default.
  for (const t of s.tabs) {
    if (
      !t ||
      typeof t.tid !== "string" ||
      !Array.isArray(t.cols) ||
      typeof t.focusedPaneId !== "string"
    ) return null;
    for (const c of t.cols) {
      if (!c || typeof c.cid !== "string" || !Array.isArray(c.panes)) return null;
      if (c.panes.some((p) => typeof p !== "string")) return null;
    }
  }
  return {
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    paneCwds: (s.paneCwds && typeof s.paneCwds === "object") ? s.paneCwds : {},
  };
}

function addPaneToTab(tab: Tab): Tab {
  const pid = newPid();
  let nextCols: Col[];
  if (tab.cols.length < MAX_COLS) {
    nextCols = [...tab.cols, { cid: newCid(), panes: [pid] }];
  } else {
    let targetIdx = tab.cols.length - 1;
    let minCount = tab.cols[targetIdx].panes.length;
    for (let i = tab.cols.length - 2; i >= 0; i--) {
      if (tab.cols[i].panes.length < minCount) {
        minCount = tab.cols[i].panes.length;
        targetIdx = i;
      }
    }
    nextCols = tab.cols.map((c, i) =>
      i === targetIdx ? { ...c, panes: [...c.panes, pid] } : c
    );
  }
  return { ...tab, cols: nextCols, focusedPaneId: pid, maximizedPaneId: null };
}

function movePaneInTab(tab: Tab, srcPid: string, targetPid: string, edge: Edge): Tab {
  if (srcPid === targetPid) return tab;

  // Remove src from its current column.
  let cols: Col[] = tab.cols
    .map((c) => ({ ...c, panes: c.panes.filter((p) => p !== srcPid) }))
    .filter((c) => c.panes.length > 0);

  const targetColIdx = cols.findIndex((c) => c.panes.includes(targetPid));
  if (targetColIdx === -1) return tab; // target vanished (src was alone with target somehow)

  const targetPaneIdx = cols[targetColIdx].panes.indexOf(targetPid);

  if (edge === "top" || edge === "bottom") {
    const insertAt = edge === "top" ? targetPaneIdx : targetPaneIdx + 1;
    cols = cols.map((c, i) =>
      i === targetColIdx
        ? {
            ...c,
            panes: [...c.panes.slice(0, insertAt), srcPid, ...c.panes.slice(insertAt)],
          }
        : c
    );
  } else {
    // left or right: create a new column when there is room, otherwise fall
    // back to inserting at the top/bottom of the target column so the user's
    // drop still lands somewhere reasonable.
    if (cols.length < MAX_COLS) {
      const insertColIdx = edge === "left" ? targetColIdx : targetColIdx + 1;
      const newCol: Col = { cid: newCid(), panes: [srcPid] };
      cols = [...cols.slice(0, insertColIdx), newCol, ...cols.slice(insertColIdx)];
    } else {
      const insertAt = edge === "left" ? targetPaneIdx : targetPaneIdx + 1;
      cols = cols.map((c, i) =>
        i === targetColIdx
          ? {
              ...c,
              panes: [...c.panes.slice(0, insertAt), srcPid, ...c.panes.slice(insertAt)],
            }
          : c
      );
    }
  }

  return {
    ...tab,
    cols,
    focusedPaneId: srcPid,
    maximizedPaneId: null,
  };
}

function closePaneInTab(tab: Tab, targetPid?: string): Tab | null {
  const victim = targetPid ?? tab.focusedPaneId;
  const nextCols: Col[] = [];
  for (const c of tab.cols) {
    const remaining = c.panes.filter((p) => p !== victim);
    if (remaining.length > 0) nextCols.push({ ...c, panes: remaining });
  }
  const flat = nextCols.flatMap((c) => c.panes);
  if (flat.length === 0) return null; // tab becomes empty
  const newest = flat.reduce((a, b) => (paneAge(b) > paneAge(a) ? b : a));
  return {
    ...tab,
    cols: nextCols,
    focusedPaneId: tab.focusedPaneId === victim ? newest : tab.focusedPaneId,
    maximizedPaneId: tab.maximizedPaneId === victim ? null : tab.maximizedPaneId,
  };
}

export function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <AppBody />
      <PaneDragLayer />
    </DndProvider>
  );
}

function AppBody() {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);
  const [quitToast, setQuitToast] = useState<{ until: number } | null>(null);
  const draggingPane = useDragLayer(
    (m) => m.isDragging() && m.getItemType() === PANE_DND_TYPE
  );

  // ---- Persisted state: load once on mount, debounced save on change. -----
  useEffect(() => {
    let cancelled = false;
    window.mandeck.loadState().then((raw) => {
      if (cancelled) return;
      const hydrated = hydrate(raw);
      if (hydrated) {
        restoreCounters(hydrated);
        setState(hydrated);
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const payload: PersistedState = {
        version: PERSIST_VERSION,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        paneCwds: state.paneCwds,
      };
      window.mandeck.saveState(payload);
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [ready, state]);

  // ---- ⌘Q double-press confirm: main fires app:quit-prompt; show toast. ---
  useEffect(() => {
    const off = window.mandeck.onQuitPrompt((windowMs) => {
      setQuitToast({ until: Date.now() + windowMs });
    });
    return () => {
      off();
    };
  }, []);
  useEffect(() => {
    if (!quitToast) return;
    const remaining = quitToast.until - Date.now();
    if (remaining <= 0) {
      setQuitToast(null);
      return;
    }
    const t = setTimeout(() => setQuitToast(null), remaining);
    return () => clearTimeout(t);
  }, [quitToast]);

  const updateActiveTab = (updater: (tab: Tab) => Tab) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.tid === s.activeTabId ? updater(t) : t)),
    }));
  };

  const addPane = () => updateActiveTab(addPaneToTab);

  const addTab = () => {
    const tab = makeTab();
    setState((s) => ({ ...s, tabs: [...s.tabs, tab], activeTabId: tab.tid }));
  };

  const closeTab = (tid?: string) => {
    setState((s) => {
      const targetTid = tid ?? s.activeTabId;
      if (s.tabs.length === 1) {
        window.mandeck.closeWindow();
        return s;
      }
      const idx = s.tabs.findIndex((t) => t.tid === targetTid);
      if (idx === -1) return s;
      const nextTabs = s.tabs.filter((t) => t.tid !== targetTid);
      const nextActive =
        s.activeTabId === targetTid
          ? nextTabs[Math.min(idx, nextTabs.length - 1)].tid
          : s.activeTabId;
      return { ...s, tabs: nextTabs, activeTabId: nextActive };
    });
  };

  const closePaneById = (targetPid?: string) => {
    setState((s) => {
      const tab = s.tabs.find((t) => t.tid === s.activeTabId);
      if (!tab) return s;
      const next = closePaneInTab(tab, targetPid);
      if (next === null) {
        // tab empty → cascade close
        if (s.tabs.length === 1) {
          window.mandeck.closeWindow();
          return s;
        }
        const idx = s.tabs.findIndex((t) => t.tid === s.activeTabId);
        const nextTabs = s.tabs.filter((t) => t.tid !== s.activeTabId);
        return {
          ...s,
          tabs: nextTabs,
          activeTabId: nextTabs[Math.min(idx, nextTabs.length - 1)].tid,
        };
      }
      return {
        ...s,
        tabs: s.tabs.map((t) => (t.tid === s.activeTabId ? next : t)),
      };
    });
  };

  const closePane = () => closePaneById();

  const toggleMaximize = (pid: string) => {
    updateActiveTab((t) => ({
      ...t,
      maximizedPaneId: t.maximizedPaneId === pid ? null : pid,
      focusedPaneId: pid,
    }));
  };

  const movePane = (srcPid: string, targetPid: string, edge: Edge) => {
    updateActiveTab((t) => movePaneInTab(t, srcPid, targetPid, edge));
  };

  const setPaneCwd = (pid: string, cwd: string) => {
    setState((s) => {
      if (s.paneCwds[pid] === cwd) return s;
      return { ...s, paneCwds: { ...s.paneCwds, [pid]: cwd } };
    });
  };

  const switchTab = (tid: string) =>
    setState((s) => (s.activeTabId === tid ? s : { ...s, activeTabId: tid }));

  const cycleTab = (delta: number) => {
    setState((s) => {
      const idx = s.tabs.findIndex((t) => t.tid === s.activeTabId);
      if (idx === -1) return s;
      const next = (idx + delta + s.tabs.length) % s.tabs.length;
      return { ...s, activeTabId: s.tabs[next].tid };
    });
  };

  const jumpToTab = (index: number) => {
    setState((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      return { ...s, activeTabId: s.tabs[index].tid };
    });
  };

  const renameTab = (tid: string, title: string) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.tid !== tid
          ? t
          : title === ""
            ? { ...t, autoNamed: true, title: t.title }
            : { ...t, autoNamed: false, title }
      ),
    }));
  };

  const reorderTab = (fromTid: string, toTid: string) => {
    setState((s) => {
      const fromIdx = s.tabs.findIndex((t) => t.tid === fromTid);
      const toIdx = s.tabs.findIndex((t) => t.tid === toTid);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return s;
      const next = [...s.tabs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...s, tabs: next };
    });
  };

  const focusPane = (pid: string) => {
    updateActiveTab((t) => ({ ...t, focusedPaneId: pid }));
  };

  // Menu IPC listeners (subscribe once; actions use setState functional updates)
  useEffect(() => {
    const offs = [
      window.mandeck.onMenu("menu:new-pane", addPane),
      window.mandeck.onMenu("menu:new-tab", addTab),
      window.mandeck.onMenu("menu:close-pane", closePane),
      window.mandeck.onMenu("menu:close-tab", () => closeTab()),
      window.mandeck.onMenu("menu:prev-tab", () => cycleTab(-1)),
      window.mandeck.onMenu("menu:next-tab", () => cycleTab(1)),
    ];
    return () => {
      offs.forEach((off) => off());
    };
  }, []);

  // ⌘1..⌘9 local shortcuts (not in main-process menu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        e.preventDefault();
        jumpToTab(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tabSummaries = state.tabs.map((t) => ({
    tid: t.tid,
    title: t.title,
    autoNamed: t.autoNamed,
  }));

  if (!ready) {
    // Avoid spawning PTYs before we know whether to restore a saved layout.
    return <div className="app app-loading" />;
  }

  return (
    <div className={`app${draggingPane ? " app-dragging-pane" : ""}`}>
      <div className="titlebar">
        <div className="titlebar-traffic-spacer" />
        <TabBar
          tabs={tabSummaries}
          activeTabId={state.activeTabId}
          onSelect={switchTab}
          onClose={closeTab}
          onRename={renameTab}
          onNew={addTab}
          onReorder={reorderTab}
        />
      </div>
      <div className="workspaces">
        {state.tabs.map((tab) => (
          <Workspace
            key={tab.tid}
            tid={tab.tid}
            cols={tab.cols}
            focusedPaneId={tab.focusedPaneId}
            maximizedPaneId={tab.maximizedPaneId}
            paneCwds={state.paneCwds}
            active={tab.tid === state.activeTabId}
            onFocusPane={focusPane}
            onClosePane={closePaneById}
            onToggleMaximize={toggleMaximize}
            onMovePane={movePane}
            onPaneCwd={setPaneCwd}
          />
        ))}
      </div>
      {quitToast && (
        <div className="quit-toast" role="status" aria-live="polite">
          Press ⌘Q again to quit Mandeck
        </div>
      )}
    </div>
  );
}
