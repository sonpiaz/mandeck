export type Col = { cid: string; panes: string[] };

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
