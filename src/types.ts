export type Col = { cid: string; panes: string[] };

export type Edge = "top" | "bottom" | "left" | "right";

export const PANE_DND_TYPE = "mandeck/pane";
export type PaneDragItem = { pid: string; title: string };

export type Tab = {
  tid: string;
  title: string;
  autoNamed: boolean;
  cols: Col[];
  focusedPaneId: string;
  maximizedPaneId: string | null;
};

export type AppState = {
  tabs: Tab[];
  activeTabId: string;
  paneCwds: Record<string, string>;
};

export const PERSIST_VERSION = 1;
export type PersistedState = {
  version: number;
  tabs: Tab[];
  activeTabId: string;
  paneCwds: Record<string, string>;
};
