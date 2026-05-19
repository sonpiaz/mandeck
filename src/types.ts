export type Col = { cid: string; panes: string[] };

export type Edge = "top" | "bottom" | "left" | "right";

export const PANE_DND_TYPE = "mandeck/pane";
export type PaneDragItem = { pid: string };

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
};
