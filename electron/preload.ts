import { contextBridge, ipcRenderer } from "electron";

type MenuChannel =
  | "menu:new-pane"
  | "menu:new-tab"
  | "menu:close-pane"
  | "menu:close-tab"
  | "menu:prev-tab"
  | "menu:next-tab";

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

  newWindow: () => ipcRenderer.send("window:new"),
  closeWindow: () => ipcRenderer.send("window:close"),

  onMenu: (channel: MenuChannel, cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
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
