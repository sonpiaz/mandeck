import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { spawn, type IPty } from "node-pty";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Dev builds share `app.getName() = "Mandeck"` with the legacy WaveTerm-based
// Mandeck.app still installed in /Applications. Same userData dir →
// Chromium SingletonLock + Cookies/Network files race → silent renderer crash.
// Force dev mode to a separate profile dir to avoid clobbering each other.
if (isDev) {
  app.setPath("userData", path.join(app.getPath("appData"), "mandeck-dev"));
}

const ptys = new Map<string, IPty>();
let windowSeq = 0;
let cascadeOffset = 0;

const STATE_PATH = () => path.join(app.getPath("userData"), "state.json");
const QUIT_CONFIRM_WINDOW_MS = 2000;
let quitConfirmedUntil = 0;

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
      // Causes macOS /etc/zshrc to install update_terminal_cwd → zsh emits
      // OSC 7 on every prompt; we listen for it to persist per-pane cwd.
      TERM_PROGRAM: "Apple_Terminal",
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

ipcMain.handle("state:load", (): unknown => {
  try {
    const raw = fs.readFileSync(STATE_PATH(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.on("state:save", (_e, payload: unknown) => {
  try {
    const file = STATE_PATH();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error("[mandeck] state:save failed", err);
  }
});

ipcMain.handle("drop:stage", (_e, srcPath: string): string => {
  try {
    if (!srcPath || !fs.existsSync(srcPath)) return "";
    const dropsDir = path.join(app.getPath("userData"), "drops");
    fs.mkdirSync(dropsDir, { recursive: true });
    const ext = path.extname(srcPath).toLowerCase() || ".bin";
    const stamp = Date.now().toString(36);
    const rand = crypto.randomBytes(3).toString("hex");
    const dst = path.join(dropsDir, `drop_${stamp}_${rand}${ext}`);
    fs.copyFileSync(srcPath, dst);
    return dst;
  } catch (err) {
    console.error("[mandeck] drop:stage failed", err);
    return "";
  }
});

ipcMain.handle("shell:openExternal", (_e, url: string) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  shell.openExternal(url).catch(() => {});
  return true;
});

ipcMain.handle("clipboard:readText", () => clipboard.readText());

ipcMain.on("ctx-menu:show", (event, { url, selection }: { url?: string; selection?: string }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const items: MenuItemConstructorOptions[] = [
    {
      label: "Copy",
      enabled: !!selection,
      click: () => { if (selection) clipboard.writeText(selection); },
    },
    {
      label: "Open URL in External Browser",
      enabled: !!url,
      click: () => { if (url) shell.openExternal(url).catch(() => {}); },
    },
    {
      label: "Paste",
      click: () => event.sender.send("ctx-menu:paste"),
    },
  ];
  Menu.buildFromTemplate(items).popup({ window: win });
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

app.on("before-quit", (e) => {
  const now = Date.now();
  if (now < quitConfirmedUntil) {
    // Confirmed within the window — proceed with the quit.
    for (const pty of ptys.values()) {
      try { pty.kill(); } catch { /* noop */ }
    }
    ptys.clear();
    return;
  }
  // First ⌘Q press: cancel quit, show toast, arm the confirm window.
  e.preventDefault();
  quitConfirmedUntil = now + QUIT_CONFIRM_WINDOW_MS;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("app:quit-prompt", QUIT_CONFIRM_WINDOW_MS);
  }
  setTimeout(() => {
    if (Date.now() >= quitConfirmedUntil) quitConfirmedUntil = 0;
  }, QUIT_CONFIRM_WINDOW_MS + 50);
});
