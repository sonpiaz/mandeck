import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DndProvider, useDragLayer } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { WorkspaceBar } from "./WorkspaceBar";
import { PaneGrid } from "./PaneGrid";
import { PaneDragLayer } from "./PaneDragLayer";
import { UtilityRail } from "./UtilityRail";
import { CommandPalette, type PaletteAction } from "./CommandPalette";
import { getOverlayHost } from "./overlay";
import { abbreviatePath, basenameOf } from "./paths";
import {
  MAX_COLS,
  PANE_DND_TYPE,
  PERSIST_VERSION,
  type AppState,
  type Col,
  type Edge,
  type PersistedState,
  type Workspace,
} from "./types";
import {
  DEFAULT_ACCENT,
  assignAccentHue,
  repairV2,
  validateV2,
} from "../electron/state-schema.mjs";
import {
  normalizeSettings,
  type Settings,
} from "../electron/settings-schema.mjs";

let _pid = 0;
let _cid = 0;
let _wid = 0;
const newPid = () => `p${++_pid}`;
const newCid = () => `c${++_cid}`;
// Workspace ids keep the legacy `t`-prefix convention (B1/B3) so v1 ids
// survive migration with zero rewriting.
const newWorkspaceId = () => `t${++_wid}`;
const paneAge = (id: string) => Number(id.slice(1)) || 0;

// The settings default accent seeds a fresh state's first workspace and sets
// the scan-start of the hue rotation for later workspaces (C3, B1).
const makeWorkspace = (
  ownedHues: string[],
  defaultAccent = DEFAULT_ACCENT
): Workspace => {
  const pid = newPid();
  return {
    id: newWorkspaceId(),
    title: "shell",
    autoNamed: true,
    accentHue: assignAccentHue(ownedHues, defaultAccent),
    cols: [{ cid: newCid(), panes: [pid] }],
    focusedPaneId: pid,
    maximizedPaneId: null,
  };
};

const initialState = (defaultAccent = DEFAULT_ACCENT): AppState => {
  const ws = makeWorkspace([], defaultAccent);
  return {
    workspaces: [ws],
    activeWorkspaceId: ws.id,
    paneCwds: {},
    sidebarVisible: true,
  };
};

function maxNumericSuffix(ids: string[]): number {
  let m = 0;
  for (const id of ids) {
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > m) m = n;
  }
  return m;
}

// Re-seed the three id counters from EVERY workspace, not just the active
// one — dormant workspaces keep live panes whose PTY-map entries are keyed
// by bare pane id; a colliding fresh id would hijack a hidden shell (B3).
function restoreCounters(state: Pick<AppState, "workspaces">) {
  const pids: string[] = [];
  const cids: string[] = [];
  const wids: string[] = [];
  for (const w of state.workspaces) {
    wids.push(w.id);
    for (const c of w.cols) {
      cids.push(c.cid);
      for (const p of c.panes) pids.push(p);
    }
  }
  _pid = maxNumericSuffix(pids);
  _cid = maxNumericSuffix(cids);
  _wid = maxNumericSuffix(wids);
}

function dropPaneCwds(
  map: Record<string, string>,
  pids: string[]
): Record<string, string> {
  if (!pids.some((p) => p in map)) return map;
  const next = { ...map };
  for (const p of pids) delete next[p];
  return next;
}

function addPaneToWorkspace(ws: Workspace, pid: string): Workspace {
  let nextCols: Col[];
  if (ws.cols.length < MAX_COLS) {
    nextCols = [...ws.cols, { cid: newCid(), panes: [pid] }];
  } else {
    let targetIdx = ws.cols.length - 1;
    let minCount = ws.cols[targetIdx].panes.length;
    for (let i = ws.cols.length - 2; i >= 0; i--) {
      if (ws.cols[i].panes.length < minCount) {
        minCount = ws.cols[i].panes.length;
        targetIdx = i;
      }
    }
    nextCols = ws.cols.map((c, i) =>
      i === targetIdx ? { ...c, panes: [...c.panes, pid] } : c
    );
  }
  return { ...ws, cols: nextCols, focusedPaneId: pid, maximizedPaneId: null };
}

function movePaneInWorkspace(
  ws: Workspace,
  srcPid: string,
  targetPid: string,
  edge: Edge
): Workspace {
  if (srcPid === targetPid) return ws;

  // Remove src from its current column.
  let cols: Col[] = ws.cols
    .map((c) => ({ ...c, panes: c.panes.filter((p) => p !== srcPid) }))
    .filter((c) => c.panes.length > 0);

  const targetColIdx = cols.findIndex((c) => c.panes.includes(targetPid));
  if (targetColIdx === -1) return ws; // target vanished (src was alone with target somehow)

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
    ...ws,
    cols,
    focusedPaneId: srcPid,
    maximizedPaneId: null,
  };
}

function closePaneInWorkspace(ws: Workspace, victim: string): Workspace | null {
  const nextCols: Col[] = [];
  for (const c of ws.cols) {
    const remaining = c.panes.filter((p) => p !== victim);
    if (remaining.length > 0) nextCols.push({ ...c, panes: remaining });
  }
  const flat = nextCols.flatMap((c) => c.panes);
  if (flat.length === 0) return null; // workspace becomes empty
  const newest = flat.reduce((a, b) => (paneAge(b) > paneAge(a) ? b : a));
  return {
    ...ws,
    cols: nextCols,
    focusedPaneId: ws.focusedPaneId === victim ? newest : ws.focusedPaneId,
    maximizedPaneId: ws.maximizedPaneId === victim ? null : ws.maximizedPaneId,
  };
}

const buildPayload = (s: AppState): PersistedState => ({
  version: PERSIST_VERSION,
  workspaces: s.workspaces,
  activeWorkspaceId: s.activeWorkspaceId,
  paneCwds: s.paneCwds,
  sidebarVisible: s.sidebarVisible,
});

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
  const [toastExiting, setToastExiting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsSignal, setSettingsSignal] = useState(0);
  const [reducedTransparency, setReducedTransparency] = useState(false);
  const [opaqueMode, setOpaqueMode] = useState(false);
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings(null, window.mandeck.defaultShell)
  );
  const draggingPane = useDragLayer(
    (m) => m.isDragging() && m.getItemType() === PANE_DND_TYPE
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const readyRef = useRef(false);

  // ---- Persisted state: load once on mount, debounced save on change. -----
  // The main process owns the load decision table (backup-then-migrate, B3);
  // the renderer receives either a valid v2 document or null. Settings load
  // alongside so the default accent can seed hydration and a fresh state
  // (C3), and so terminals mount with the configured font.
  useEffect(() => {
    let cancelled = false;
    Promise.all([window.mandeck.loadState(), window.mandeck.loadSettings()]).then(
      ([raw, rawSettings]) => {
        if (cancelled) return;
        const loaded = normalizeSettings(rawSettings, window.mandeck.defaultShell);
        setSettings(loaded);
        settingsRef.current = loaded;
        if (validateV2(raw)) {
          const repaired = repairV2(raw, loaded.defaultAccent);
          restoreCounters(repaired);
          setState({
            workspaces: repaired.workspaces,
            activeWorkspaceId: repaired.activeWorkspaceId,
            paneCwds: repaired.paneCwds,
            sidebarVisible: repaired.sidebarVisible,
          });
        } else if (loaded.defaultAccent !== DEFAULT_ACCENT) {
          setState(initialState(loaded.defaultAccent));
        }
        setReady(true);
        readyRef.current = true;
      }
    );
    return () => { cancelled = true; };
  }, []);

  // Commit model (C3): each control commits on interaction — save to
  // settings.json immediately + apply (font live via option mutation in
  // Terminal, shell to new panes via the main process).
  const commitSettings = (next: Settings) => {
    setSettings(next);
    settingsRef.current = next;
    window.mandeck.saveSettings(next);
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.mandeck.saveState(buildPayload(state));
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [ready, state]);

  // Quit-time force-flush (B3): the main process holds the quit until the
  // pending debounced save is flushed (or a short timeout passes).
  useEffect(() => {
    return window.mandeck.onQuitFlush(() => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (readyRef.current) {
        window.mandeck.saveState(buildPayload(stateRef.current));
      }
      window.mandeck.flushDone();
    });
  }, []);

  // ---- Glass fallbacks (A1/A2): CSS handles its own collapse via the media
  // query and the data-opaque attribute; the IPC boolean keeps the xterm
  // theme object (JS, not CSS) in lockstep.
  useEffect(() => {
    let cancelled = false;
    window.mandeck.getReducedTransparency().then((reduced) => {
      if (!cancelled) setReducedTransparency(reduced);
    });
    const off = window.mandeck.onReducedTransparencyChanged(setReducedTransparency);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => window.mandeck.onOpaqueMode(setOpaqueMode), []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-opaque", opaqueMode);
  }, [opaqueMode]);

  // ---- ⌘Q double-press confirm: main fires app:quit-prompt; show toast. ---
  // Re-arming while visible restarts the window without replaying the
  // entrance (the element stays mounted); expiry plays a 250ms fade-out
  // before unmounting (D4).
  useEffect(() => {
    const off = window.mandeck.onQuitPrompt((windowMs) => {
      setToastExiting(false);
      setQuitToast({ until: Date.now() + windowMs });
    });
    return () => {
      off();
    };
  }, []);
  useEffect(() => {
    if (!quitToast) return;
    const expire = () => {
      setQuitToast(null);
      setToastExiting(true);
    };
    const remaining = quitToast.until - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    const t = setTimeout(expire, remaining);
    return () => clearTimeout(t);
  }, [quitToast]);
  useEffect(() => {
    if (!toastExiting) return;
    const t = setTimeout(() => setToastExiting(false), 250);
    return () => clearTimeout(t);
  }, [toastExiting]);

  const updateActiveWorkspace = (updater: (ws: Workspace) => Workspace) => {
    setState((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId ? updater(w) : w
      ),
    }));
  };

  // The cwd variant backs Open Folder… (menu + palette): the chosen path is
  // registered in paneCwds BEFORE the pane mounts, so the PTY spawns there
  // and the header title / workspace auto-naming resolve without waiting for
  // the first OSC 7 report.
  const addPaneWithCwd = (cwd?: string) => {
    setState((s) => {
      const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
      if (!ws) return s;
      const pid = newPid();
      let next = addPaneToWorkspace(ws, pid);
      if (cwd && next.autoNamed) next = { ...next, title: basenameOf(cwd) };
      return {
        ...s,
        workspaces: s.workspaces.map((w) =>
          w.id === s.activeWorkspaceId ? next : w
        ),
        paneCwds: cwd ? { ...s.paneCwds, [pid]: cwd } : s.paneCwds,
      };
    });
  };

  const addPane = () => addPaneWithCwd();

  const openFolderInNewPane = () => {
    void window.mandeck.pickFolder().then((dir) => {
      if (dir) addPaneWithCwd(dir);
    });
  };

  const addWorkspace = () => {
    setState((s) => {
      const ws = makeWorkspace(
        s.workspaces.map((w) => w.accentHue),
        settingsRef.current.defaultAccent
      );
      return {
        ...s,
        workspaces: [...s.workspaces, ws],
        activeWorkspaceId: ws.id,
      };
    });
  };

  const toggleSidebar = () =>
    setState((s) => ({ ...s, sidebarVisible: !s.sidebarVisible }));

  const closeWorkspace = (id?: string) => {
    setState((s) => {
      const targetId = id ?? s.activeWorkspaceId;
      if (s.workspaces.length === 1) {
        window.mandeck.closeWindow();
        return s;
      }
      const idx = s.workspaces.findIndex((w) => w.id === targetId);
      if (idx === -1) return s;
      const victim = s.workspaces[idx];
      const nextWorkspaces = s.workspaces.filter((w) => w.id !== targetId);
      const nextActive =
        s.activeWorkspaceId === targetId
          ? nextWorkspaces[Math.min(idx, nextWorkspaces.length - 1)].id
          : s.activeWorkspaceId;
      return {
        ...s,
        workspaces: nextWorkspaces,
        activeWorkspaceId: nextActive,
        paneCwds: dropPaneCwds(s.paneCwds, victim.cols.flatMap((c) => c.panes)),
      };
    });
  };

  const closePaneById = (targetPid?: string) => {
    setState((s) => {
      const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
      if (!ws) return s;
      const victim = targetPid ?? ws.focusedPaneId;
      const next = closePaneInWorkspace(ws, victim);
      if (next === null) {
        // workspace empty → cascade close (pane → workspace → window, B2)
        if (s.workspaces.length === 1) {
          window.mandeck.closeWindow();
          return s;
        }
        const idx = s.workspaces.findIndex((w) => w.id === s.activeWorkspaceId);
        const rest = s.workspaces.filter((w) => w.id !== s.activeWorkspaceId);
        return {
          ...s,
          workspaces: rest,
          activeWorkspaceId: rest[Math.min(idx, rest.length - 1)].id,
          paneCwds: dropPaneCwds(s.paneCwds, [victim]),
        };
      }
      return {
        ...s,
        workspaces: s.workspaces.map((w) =>
          w.id === s.activeWorkspaceId ? next : w
        ),
        paneCwds: dropPaneCwds(s.paneCwds, [victim]),
      };
    });
  };

  const closePane = () => closePaneById();

  const toggleMaximize = (pid: string) => {
    updateActiveWorkspace((w) => ({
      ...w,
      maximizedPaneId: w.maximizedPaneId === pid ? null : pid,
      focusedPaneId: pid,
    }));
  };

  const movePane = (srcPid: string, targetPid: string, edge: Edge) => {
    updateActiveWorkspace((w) => movePaneInWorkspace(w, srcPid, targetPid, edge));
  };

  // OSC 7 cwd report. Beyond persisting the cwd, this drives B1's
  // auto-rename rule: an auto-named workspace whose FOCUSED pane reports a
  // cwd retitles to the cwd's basename — dormant workspaces included.
  const setPaneCwd = (pid: string, cwd: string) => {
    setState((s) => {
      const sameCwd = s.paneCwds[pid] === cwd;
      let retitled = false;
      const workspaces = s.workspaces.map((w) => {
        if (!w.autoNamed || w.focusedPaneId !== pid) return w;
        const title = basenameOf(cwd);
        if (w.title === title) return w;
        retitled = true;
        return { ...w, title };
      });
      if (sameCwd && !retitled) return s;
      return {
        ...s,
        workspaces: retitled ? workspaces : s.workspaces,
        paneCwds: sameCwd ? s.paneCwds : { ...s.paneCwds, [pid]: cwd },
      };
    });
  };

  const switchWorkspace = (id: string) =>
    setState((s) =>
      s.activeWorkspaceId === id ? s : { ...s, activeWorkspaceId: id }
    );

  const cycleWorkspace = (delta: number) => {
    setState((s) => {
      const idx = s.workspaces.findIndex((w) => w.id === s.activeWorkspaceId);
      if (idx === -1) return s;
      const next = (idx + delta + s.workspaces.length) % s.workspaces.length;
      return { ...s, activeWorkspaceId: s.workspaces[next].id };
    });
  };

  const jumpToWorkspace = (index: number) => {
    setState((s) => {
      if (index < 0 || index >= s.workspaces.length) return s;
      return { ...s, activeWorkspaceId: s.workspaces[index].id };
    });
  };

  const renameWorkspace = (id: string, title: string) => {
    setState((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => {
        if (w.id !== id) return w;
        if (title === "") {
          // Empty commit resets auto-naming; the title immediately
          // re-derives from the focused pane's last known cwd (B1).
          const cwd = s.paneCwds[w.focusedPaneId];
          return { ...w, autoNamed: true, title: cwd ? basenameOf(cwd) : "shell" };
        }
        return { ...w, autoNamed: false, title };
      }),
    }));
  };

  const reorderWorkspace = (fromId: string, toId: string) => {
    setState((s) => {
      const fromIdx = s.workspaces.findIndex((w) => w.id === fromId);
      const toIdx = s.workspaces.findIndex((w) => w.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return s;
      const next = [...s.workspaces];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...s, workspaces: next };
    });
  };

  const focusPane = (pid: string) => {
    updateActiveWorkspace((w) => ({ ...w, focusedPaneId: pid }));
  };

  // Menu IPC listeners, subscribed once ([] deps). The captured handlers stay
  // valid forever: every mutation goes through setState functional updaters
  // (no stale-state reads), and the one non-state read — addWorkspace's
  // default accent — goes through settingsRef, which always holds the latest
  // committed settings.
  useEffect(() => {
    const offs = [
      window.mandeck.onMenu("menu:new-pane", addPane),
      window.mandeck.onMenu("menu:new-workspace", addWorkspace),
      window.mandeck.onMenu("menu:open-folder", openFolderInNewPane),
      window.mandeck.onMenu("menu:close-pane", closePane),
      window.mandeck.onMenu("menu:close-workspace", () => closeWorkspace()),
      window.mandeck.onMenu("menu:prev-workspace", () => cycleWorkspace(-1)),
      window.mandeck.onMenu("menu:next-workspace", () => cycleWorkspace(1)),
      window.mandeck.onMenu("menu:toggle-sidebar", toggleSidebar),
    ];
    return () => {
      offs.forEach((off) => off());
    };
  }, []);

  // Keeps the View-menu "Hide Sidebar"/"Show Sidebar" label in lockstep with
  // the persisted flag (C1).
  useEffect(() => {
    if (!ready) return;
    window.mandeck.sidebarVisibleChanged(state.sidebarVisible);
  }, [ready, state.sidebarVisible]);

  // ⌘1..⌘9 jump-to-workspace stays a renderer keydown listener (B2)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        e.preventDefault();
        jumpToWorkspace(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ⌘K palette toggle — a renderer keydown listener like ⌘1-9. Closing
  // returns keyboard focus to the focused pane's terminal: only the active
  // workspace's focused pane carries .pane.focused, and xterm's helper
  // textarea is its real focus target.
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>(".pane.focused .xterm-helper-textarea")
        ?.focus();
    });
  }, []);
  const paletteOpenRef = useRef(paletteOpen);
  paletteOpenRef.current = paletteOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
      if (e.key !== "k" && e.key !== "K") return;
      e.preventDefault();
      if (paletteOpenRef.current) closePalette();
      else setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePalette]);

  // Palette "Settings": reveal the rail if hidden, then bump the popover
  // signal after the state flush so a just-revealed rail is mounted first.
  const openSettings = () => {
    setState((s) => (s.sidebarVisible ? s : { ...s, sidebarVisible: true }));
    setTimeout(() => setSettingsSignal((n) => n + 1), 0);
  };

  // The active workspace's persisted accentHue drives the --accent custom
  // property; the token sheet derives all four sanctioned accent surfaces
  // from it (A1). Set on the document root so the body-level overlay host
  // (drag ghost, spotlight, popover, toast — D3 layer table) inherits it
  // alongside the .app subtree.
  const activeWorkspace = state.workspaces.find(
    (w) => w.id === state.activeWorkspaceId
  );
  const activeAccent = activeWorkspace?.accentHue ?? DEFAULT_ACCENT;
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", activeAccent);
  }, [activeAccent]);

  // --rail-width feeds the maximize-spotlight inset math (C1/D3). The
  // overlay host sits outside the .app subtree, so the collapse-to-zero
  // override must live on the document root too.
  useEffect(() => {
    document.documentElement.toggleAttribute(
      "data-rail-hidden",
      !state.sidebarVisible
    );
  }, [state.sidebarVisible]);

  const workspaceSummaries = state.workspaces.map((w) => ({
    id: w.id,
    title: w.title,
    autoNamed: w.autoNamed,
  }));

  // ⌘K action list, rebuilt from live state on every palette render so
  // subtitles (pane landing spot, cwd, rail visibility) stay current.
  const buildPaletteActions = (): PaletteAction[] => {
    const ws = activeWorkspace;
    const home = window.mandeck.homeDir;
    const focusedCwd = ws ? state.paneCwds[ws.focusedPaneId] : undefined;
    const actions: PaletteAction[] = [
      {
        id: "new-pane",
        section: "Actions",
        icon: "terminal",
        title: "New Terminal Pane",
        subtitle:
          ws && ws.cols.length >= MAX_COLS
            ? "Joins the column with the fewest panes"
            : "Opens as a new column on the right",
        chip: "⌘N",
        run: addPane,
      },
      {
        id: "new-workspace",
        section: "Actions",
        icon: "workspace",
        title: "New Workspace",
        subtitle: "Opens at the end of the strip",
        chip: "⌘T",
        run: addWorkspace,
      },
      {
        id: "open-folder",
        section: "Actions",
        icon: "folder",
        title: "Open Folder in New Pane…",
        subtitle: "Pick a directory for a fresh shell",
        chip: "⌘O",
        run: openFolderInNewPane,
      },
      {
        id: "reveal-cwd",
        section: "Actions",
        icon: "finder",
        title: "Open Current Folder in Finder",
        subtitle: focusedCwd ? abbreviatePath(focusedCwd, home) : "~",
        run: () => {
          void window.mandeck.openDirInFinder(focusedCwd ?? home);
        },
      },
      {
        id: "settings",
        section: "Actions",
        icon: "gear",
        title: "Settings",
        subtitle: "Open the settings popover",
        run: openSettings,
      },
      {
        id: "toggle-rail",
        section: "Actions",
        icon: "rail",
        title: "Toggle Utility Rail",
        subtitle: state.sidebarVisible ? "Hide the right rail" : "Show the right rail",
        run: toggleSidebar,
      },
    ];
    if (ws) {
      actions.push(
        ws.maximizedPaneId
          ? {
              id: "exit-maximize",
              section: "Actions",
              icon: "restore",
              title: "Exit Maximize",
              subtitle: "Restore the pane grid",
              run: () => toggleMaximize(ws.maximizedPaneId!),
            }
          : {
              id: "maximize",
              section: "Actions",
              icon: "maximize",
              title: "Maximize Focused Pane",
              subtitle: "Spotlight the focused pane",
              run: () => toggleMaximize(ws.focusedPaneId),
            }
      );
    }
    state.workspaces.forEach((w, i) => {
      actions.push({
        id: `jump-${w.id}`,
        section: "Workspaces",
        dot: w.accentHue,
        title: `Jump to ${w.title}`,
        subtitle: `Workspace ${i + 1}`,
        chip: i < 9 ? `⌘${i + 1}` : undefined,
        run: () => switchWorkspace(w.id),
      });
    });
    return actions;
  };

  if (!ready) {
    // Avoid spawning PTYs before we know whether to restore a saved layout.
    return <div className="app app-loading" />;
  }

  const solidTerminal = reducedTransparency || opaqueMode;

  return (
    <div className={`app${draggingPane ? " app-dragging-pane" : ""}`}>
      <div className="titlebar">
        <div className="titlebar-traffic-spacer" />
        <WorkspaceBar
          workspaces={workspaceSummaries}
          activeWorkspaceId={state.activeWorkspaceId}
          onSelect={switchWorkspace}
          onClose={closeWorkspace}
          onRename={renameWorkspace}
          onNew={addWorkspace}
          onReorder={reorderWorkspace}
        />
        <div className="titlebar-drag-spacer" />
      </div>
      <div className="app-body">
        <div className="workspaces">
          {state.workspaces.map((ws) => (
            <PaneGrid
              key={ws.id}
              workspaceId={ws.id}
              cols={ws.cols}
              focusedPaneId={ws.focusedPaneId}
              maximizedPaneId={ws.maximizedPaneId}
              paneCwds={state.paneCwds}
              accent={ws.accentHue}
              solidTerminal={solidTerminal}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              active={ws.id === state.activeWorkspaceId}
              onFocusPane={focusPane}
              onClosePane={closePaneById}
              onToggleMaximize={toggleMaximize}
              onMovePane={movePane}
              onPaneCwd={setPaneCwd}
            />
          ))}
        </div>
        {state.sidebarVisible && (
          <UtilityRail
            accent={activeAccent}
            dragActive={draggingPane}
            settings={settings}
            openSettingsSignal={settingsSignal}
            onNewTerminal={addPane}
            onCommitSettings={commitSettings}
          />
        )}
      </div>
      {paletteOpen && (
        <CommandPalette actions={buildPaletteActions()} onClose={closePalette} />
      )}
      {(quitToast || toastExiting) &&
        createPortal(
          <div
            className={`quit-toast${quitToast ? "" : " exiting"}`}
            role="status"
            aria-live="polite"
          >
            Press ⌘Q again to quit Mandeck
          </div>,
          getOverlayHost()
        )}
    </div>
  );
}
