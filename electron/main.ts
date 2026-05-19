import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";
import { spawn, type IPty } from "node-pty";
import path from "node:path";
import os from "node:os";

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const ptys = new Map<string, IPty>();
let windowSeq = 0;
let cascadeOffset = 0;

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function sendToFocused(channel: string, payload?: unknown) {
  const win = focusedWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const seq = ++windowSeq;
  const offsetX = ((cascadeOffset++) % 8) * 24;
  const offsetY = offsetX;

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    x: 100 + offsetX || undefined,
    y: 100 + offsetY || undefined,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0b0d10",
    title: `Mandeck — Window ${seq}`,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    if (seq === 1 && process.env.MANDECK_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  return win;
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "Cmd+Shift+N",
          click: () => createWindow(),
        },
        {
          label: "New Tab",
          accelerator: "Cmd+T",
          click: () => sendToFocused("menu:new-tab"),
        },
        {
          label: "New Pane",
          accelerator: "Cmd+N",
          click: () => sendToFocused("menu:new-pane"),
        },
        {
          label: "Split Pane",
          accelerator: "Cmd+D",
          click: () => sendToFocused("menu:new-pane"),
        },
        { type: "separator" },
        {
          label: "Close Pane",
          accelerator: "Cmd+W",
          click: () => sendToFocused("menu:close-pane"),
        },
        {
          label: "Close Tab",
          accelerator: "Cmd+Shift+W",
          click: () => sendToFocused("menu:close-tab"),
        },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Workspace",
      submenu: [
        {
          label: "Previous Tab",
          accelerator: "Cmd+[",
          click: () => sendToFocused("menu:prev-tab"),
        },
        {
          label: "Next Tab",
          accelerator: "Cmd+]",
          click: () => sendToFocused("menu:next-tab"),
        },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("pty:create", (event, { id, cols, rows, cwd }) => {
  const shell = process.env.SHELL || "/bin/zsh";
  const pty = spawn(shell, ["-l"], {
    name: "xterm-256color",
    cols: cols ?? 80,
    rows: rows ?? 24,
    cwd: cwd || os.homedir(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      MANDECK: "1",
      MANDECK_PID: id,
    },
  });
  ptys.set(id, pty);

  const wc = event.sender;
  pty.onData((data) => {
    if (!wc.isDestroyed()) wc.send(`pty:data:${id}`, data);
  });
  pty.onExit(({ exitCode }) => {
    if (!wc.isDestroyed()) wc.send(`pty:exit:${id}`, exitCode);
    ptys.delete(id);
  });

  return { ok: true, pid: pty.pid };
});

ipcMain.on("pty:write", (_e, { id, data }) => {
  const pty = ptys.get(id);
  if (!pty) {
    console.warn(`[mandeck] pty:write to unknown id=${id} bytes=${data?.length}`);
    return;
  }
  pty.write(data);
});

ipcMain.on("pty:resize", (_e, { id, cols, rows }) => {
  try {
    ptys.get(id)?.resize(cols, rows);
  } catch {
    /* PTY may have exited */
  }
});

ipcMain.on("pty:kill", (_e, { id }) => {
  ptys.get(id)?.kill();
  ptys.delete(id);
});

ipcMain.on("window:new", () => {
  createWindow();
});

ipcMain.on("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  for (const pty of ptys.values()) {
    try { pty.kill(); } catch { /* noop */ }
  }
  ptys.clear();
});
