import { useEffect, useState } from "react";
import { TabBar } from "./TabBar";
import { Workspace } from "./Workspace";
import type { AppState, Col, Tab } from "./types";

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
  return { tabs: [tab], activeTabId: tab.tid };
};

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
  const [state, setState] = useState<AppState>(initialState);

  const updateActiveTab = (updater: (tab: Tab) => Tab) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.tid === s.activeTabId ? updater(t) : t)),
    }));
  };

  const addPane = () => updateActiveTab(addPaneToTab);

  const addTab = () => {
    const tab = makeTab();
    setState((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.tid }));
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
      return { tabs: nextTabs, activeTabId: nextActive };
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

  return (
    <div className="app">
      <div className="titlebar" />
      <TabBar
        tabs={tabSummaries}
        activeTabId={state.activeTabId}
        onSelect={switchTab}
        onClose={closeTab}
        onRename={renameTab}
        onNew={addTab}
        onReorder={reorderTab}
      />
      <div className="workspaces">
        {state.tabs.map((tab) => (
          <Workspace
            key={tab.tid}
            tid={tab.tid}
            cols={tab.cols}
            focusedPaneId={tab.focusedPaneId}
            maximizedPaneId={tab.maximizedPaneId}
            active={tab.tid === state.activeTabId}
            onFocusPane={focusPane}
            onClosePane={closePaneById}
            onToggleMaximize={toggleMaximize}
          />
        ))}
      </div>
    </div>
  );
}
