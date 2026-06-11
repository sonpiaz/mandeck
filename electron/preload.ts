import { contextBridge, ipcRenderer, webUtils } from "electron";
import os from "node:os";

const hostInfo = {
  user: os.userInfo().username,
  host: os.hostname(),
};

type MenuChannel =
  | "menu:new-pane"
  | "menu:new-workspace"
  | "menu:close-pane"
  | "menu:close-workspace"
  | "menu:prev-workspace"
  | "menu:next-workspace"
  | "menu:toggle-sidebar";

const api = {
  createPty: (opts: { id: string; cols: number; rows: number; cwd?: string }) =>
    ipcRenderer.invoke("pty:create", opts),
  write: (id: string, data: string) =>
    ipcRenderer.send("pty:write", { id, data }),
  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send("pty:resize", { id, cols, rows }),
  kill: (id: string) => ipcRenderer.send("pty:kill", { id }),
  onData: (id: string, cb: (data: string) => void) => {
    const channel = `pty:data:${id}`;
    const listener = (_: unknown, data: string) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onExit: (id: string, cb: (code: number) => void) => {
    const channel = `pty:exit:${id}`;
    const listener = (_: unknown, code: number) => cb(code);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  closeWindow: () => ipcRenderer.send("window:close"),

  onMenu: (channel: MenuChannel, cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  hostInfo,
  getPathForFile: (file: File): string => {
    try { return webUtils.getPathForFile(file); } catch { return ""; }
  },
  stageDroppedFile: (srcPath: string): Promise<string> =>
    ipcRenderer.invoke("drop:stage", srcPath),

  loadState: (): Promise<unknown> => ipcRenderer.invoke("state:load"),
  saveState: (payload: unknown) => ipcRenderer.send("state:save", payload),

  // C3 settings IPC + the constants the popover renders (the renderer has no
  // Node access; the shell default and app version resolve here).
  loadSettings: (): Promise<unknown> => ipcRenderer.invoke("settings:load"),
  saveSettings: (payload: unknown) => ipcRenderer.send("settings:save", payload),
  openSettingsFile: (): Promise<boolean> => ipcRenderer.invoke("settings:open-editor"),
  defaultShell: process.env.SHELL || "/bin/zsh",
  appVersion: ipcRenderer.sendSync("app:version") as string,

  // C1: keeps the View-menu "Hide Sidebar"/"Show Sidebar" label in lockstep
  // with the persisted flag.
  sidebarVisibleChanged: (visible: boolean) =>
    ipcRenderer.send("sidebar:visible", visible),
  onQuitFlush: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("app:quit-flush", listener);
    return () => {
      ipcRenderer.removeListener("app:quit-flush", listener);
    };
  },
  flushDone: () => ipcRenderer.send("state:flush-done"),
  onQuitPrompt: (cb: (windowMs: number) => void) => {
    const listener = (_: unknown, windowMs: number) => cb(windowMs);
    ipcRenderer.on("app:quit-prompt", listener);
    return () => ipcRenderer.removeListener("app:quit-prompt", listener);
  },
  // A1/A2: the reduced-transparency boolean travels over IPC so the xterm
  // theme object (JS, not CSS) stays in lockstep with the media query.
  getReducedTransparency: (): Promise<boolean> =>
    ipcRenderer.invoke("theme:reduced-transparency"),
  onReducedTransparencyChanged: (cb: (reduced: boolean) => void) => {
    const listener = (_: unknown, reduced: boolean) => cb(reduced);
    ipcRenderer.on("theme:reduced-transparency-changed", listener);
    return () =>
      ipcRenderer.removeListener("theme:reduced-transparency-changed", listener);
  },
  onOpaqueMode: (cb: (on: boolean) => void) => {
    const listener = (_: unknown, on: boolean) => cb(on);
    ipcRenderer.on("menu:opaque-mode", listener);
    return () => {
      ipcRenderer.removeListener("menu:opaque-mode", listener);
    };
  },
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
  readClipboardText: (): Promise<string> =>
    ipcRenderer.invoke("clipboard:readText"),
  showCtxMenu: (payload: { url?: string; selection?: string }) =>
    ipcRenderer.send("ctx-menu:show", payload),
  onCtxMenuPaste: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("ctx-menu:paste", listener);
    return () => ipcRenderer.removeListener("ctx-menu:paste", listener);
  },
};

contextBridge.exposeInMainWorld("mandeck", api);
export type MandeckApi = typeof api;
