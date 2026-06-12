import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { spawn, type IPty } from "node-pty";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { loadStateFile, writeBackup, writeStateFile } from "./state-file.mjs";
import { defaultSettings } from "./settings-schema.mjs";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Dev builds share `app.getName() = "Mandeck"` with the legacy WaveTerm-based
// Mandeck.app still installed in /Applications. Same userData dir →
// Chromium SingletonLock + Cookies/Network files race → silent renderer crash.
// Force dev mode to a separate profile dir to avoid clobbering each other.
if (isDev) {
  app.setPath("userData", path.join(app.getPath("appData"), "mandeck-dev"));
}

const ptys = new Map<string, IPty>();

const STATE_PATH = () => path.join(app.getPath("userData"), "state.json");
const SETTINGS_PATH = () => path.join(app.getPath("userData"), "settings.json");
const QUIT_CONFIRM_WINDOW_MS = 2000;
let quitConfirmedUntil = 0;
let quitFlushed = false;

// Backup-failure save suppression (B3 §7): if the timestamped backup of the
// old state file could not be written, no save may overwrite the only copy
// until a backup succeeds.
let pendingBackup: { raw: string; kind: string } | null = null;

function savesAllowed(): boolean {
  if (!pendingBackup) return true;
  try {
    writeBackup(STATE_PATH(), pendingBackup.raw, pendingBackup.kind);
    pendingBackup = null;
    return true;
  } catch {
    return false;
  }
}

// settings.json is owned by the main process (C3): a separate file from
// state.json, loaded lazily, cached for PTY spawns, written immediately and
// atomically on every renderer commit. A corrupt file yields null (the
// renderer falls back to defaults in memory) and stays untouched on disk
// until the next commit overwrites it.
let settingsCache: Record<string, unknown> | null = null;
let settingsLoaded = false;

function readSettingsFile(): Record<string, unknown> | null {
  if (!settingsLoaded) {
    settingsLoaded = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH(), "utf8"));
      settingsCache = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      settingsCache = null;
    }
  }
  return settingsCache;
}

type Bounds = { x: number; y: number; w: number; h: number };

// windowBounds is owned by the main process: merged into every save and
// persisted debounced on move/resize (B3).
let currentBounds: Bounds | null = null;
let lastRendererPayload: Record<string, unknown> | null = null;

function mergedPayload(): Record<string, unknown> | null {
  if (!lastRendererPayload) return null;
  return currentBounds
    ? { ...lastRendererPayload, windowBounds: currentBounds }
    : lastRendererPayload;
}

function boundsOnScreen(b: Bounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      b.x < a.x + a.width &&
      b.x + b.w > a.x &&
      b.y < a.y + a.height &&
      b.y + b.h > a.y
    );
  });
}

function readSavedWindowBounds(): Bounds | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH(), "utf8"));
    if (!parsed || parsed.version !== 2) return null;
    const wb = parsed.windowBounds;
    if (
      wb &&
      typeof wb === "object" &&
      [wb.x, wb.y, wb.w, wb.h].every(
        (n: unknown) => typeof n === "number" && Number.isFinite(n)
      )
    ) {
      return { x: wb.x, y: wb.y, w: wb.w, h: wb.h };
    }
  } catch {
    /* absent or unreadable — the load decision table handles it */
  }
  return null;
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function sendToFocused(channel: string, payload?: unknown) {
  const win = focusedWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// A2 window-material colors: the only sanctioned color literals outside the
// renderer token sheet. Alpha-zero lets the native effect view show through;
// the opaque branch matches the renderer's --bg-root.
const WINDOW_BG_GLASS = "#00000000";
const WINDOW_BG_OPAQUE = "#0B0B10";

// Runtime material switches are sanctioned ONLY for the native-theme
// subscription (A2 state 3); everything else is constructor-time.
function applyWindowMaterial(win: BrowserWindow, reduced: boolean) {
  if (reduced) {
    win.setVibrancy(null);
    win.setBackgroundColor(WINDOW_BG_OPAQUE);
  } else {
    win.setVibrancy("under-window");
    win.setBackgroundColor(WINDOW_BG_GLASS);
  }
}

let lastReducedTransparency = false;
function watchNativeTheme() {
  lastReducedTransparency = nativeTheme.prefersReducedTransparency;
  nativeTheme.on("updated", () => {
    const reduced = nativeTheme.prefersReducedTransparency;
    if (reduced === lastReducedTransparency) return;
    lastReducedTransparency = reduced;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      applyWindowMaterial(win, reduced);
      // Keeps the renderer's xterm theme object (JS, not CSS) in lockstep
      // with the CSS media query (A1).
      win.webContents.send("theme:reduced-transparency-changed", reduced);
    }
  });
}

function createWindow() {
  // Restored bounds are validated against the current display arrangement;
  // a frame that intersects no display's work area is discarded and the
  // window opens at the default size, centered (B3).
  const saved = currentBounds ?? readSavedWindowBounds();
  const valid = saved && boundsOnScreen(saved) ? saved : null;

  // A2: every material option is set in the constructor — never via setters
  // after creation, which historically resurfaces white-flash bugs. The
  // reduced-transparency branch builds today's opaque window instead.
  const reduced = nativeTheme.prefersReducedTransparency;

  const win = new BrowserWindow({
    ...(valid
      ? { x: valid.x, y: valid.y, width: valid.w, height: valid.h }
      : { width: 1400, height: 900 }),
    titleBarStyle: "hiddenInset",
    // The native circles are 12px tall: y = (44 − 12) / 2 = 16 centers them
    // in the 44px bar (A2).
    trafficLightPosition: { x: 16, y: 16 },
    ...(reduced
      ? { backgroundColor: WINDOW_BG_OPAQUE }
      : {
          backgroundColor: WINDOW_BG_GLASS,
          vibrancy: "under-window" as const,
          visualEffectState: "followWindow" as const,
        }),
    title: "Mandeck",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  {
    const b = win.getBounds();
    currentBounds = { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  let boundsTimer: NodeJS.Timeout | null = null;
  const onBoundsChange = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      boundsTimer = null;
      if (win.isDestroyed()) return;
      const b = win.getBounds();
      currentBounds = { x: b.x, y: b.y, w: b.width, h: b.height };
      const payload = mergedPayload();
      if (!payload || !savesAllowed()) return;
      try {
        writeStateFile(STATE_PATH(), payload);
      } catch (err) {
        console.error("[mandeck] windowBounds save failed", err);
      }
    }, 400);
  };
  win.on("move", onBoundsChange);
  win.on("resize", onBoundsChange);

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    if (process.env.MANDECK_DEVTOOLS === "1") {
      // Known caveat (A2): detached DevTools kills vibrancy for the life of
      // the window and it cannot be restored without recreating the window.
      // Dev sessions with this flag lose glass — never chase as a regression.
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  return win;
}

// The View-menu sidebar label flips with the persisted flag (C1); the
// renderer reports it over sidebar:visible and the menu is rebuilt. The
// Opaque Mode checkbox state is kept across rebuilds.
let sidebarVisible = true;
let opaqueModeChecked = false;

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    {
      label: "File",
      submenu: [
        {
          label: "New Workspace",
          accelerator: "Cmd+T",
          click: () => sendToFocused("menu:new-workspace"),
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
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendToFocused("menu:open-folder"),
        },
        { type: "separator" },
        {
          label: "Close Pane",
          accelerator: "Cmd+W",
          click: () => sendToFocused("menu:close-pane"),
        },
        {
          label: "Close Workspace",
          accelerator: "Cmd+Shift+W",
          click: () => sendToFocused("menu:close-workspace"),
        },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: sidebarVisible ? "Hide Sidebar" : "Show Sidebar",
          click: () => sendToFocused("menu:toggle-sidebar"),
        },
        { type: "separator" },
        {
          // A1 state 3: user-invoked solid surfaces — doubles as the
          // screen-recording mode and the manual accessibility escape hatch.
          label: "Opaque Mode",
          type: "checkbox",
          checked: opaqueModeChecked,
          click: (item) => {
            opaqueModeChecked = item.checked;
            sendToFocused("menu:opaque-mode", item.checked);
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Workspace",
      submenu: [
        {
          label: "Previous Workspace",
          accelerator: "Cmd+[",
          click: () => sendToFocused("menu:prev-workspace"),
        },
        {
          label: "Next Workspace",
          accelerator: "Cmd+]",
          click: () => sendToFocused("menu:next-workspace"),
        },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("pty:create", (event, { id, cols, rows, cwd }) => {
  // C3: the configured shell applies to new panes only; an invalid path is
  // not validated here — spawn fails through the existing PTY error path.
  const settings = readSettingsFile();
  const configuredShell =
    settings && typeof settings.shell === "string" && settings.shell.trim() !== ""
      ? settings.shell
      : null;
  const shellPath = configuredShell || process.env.SHELL || "/bin/zsh";
  const pty = spawn(shellPath, ["-l"], {
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

ipcMain.on("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

// B3 load decision table runs here, in the main process, so the timestamped
// backup exists on disk before the renderer hydrates (and therefore before
// any debounced v2 save can overwrite the file).
ipcMain.handle("state:load", (): unknown => {
  const result = loadStateFile(STATE_PATH());
  if (result.backupFailed && result.raw !== null) {
    pendingBackup = { raw: result.raw, kind: result.backupKind ?? "bad" };
    console.error(
      "[mandeck] state backup failed; saves suppressed until a backup succeeds"
    );
  }
  return result.state;
});

ipcMain.on("state:save", (_e, payload: unknown) => {
  if (!payload || typeof payload !== "object") return;
  if (!savesAllowed()) return;
  lastRendererPayload = payload as Record<string, unknown>;
  try {
    writeStateFile(STATE_PATH(), mergedPayload());
  } catch (err) {
    console.error("[mandeck] state:save failed", err);
  }
});

// C3's three settings IPC operations: load, save, open-in-editor.
ipcMain.handle("settings:load", () => readSettingsFile());

ipcMain.on("settings:save", (_e, payload: unknown) => {
  if (!payload || typeof payload !== "object") return;
  settingsCache = payload as Record<string, unknown>;
  settingsLoaded = true;
  try {
    // Immediate, not debounced — settings changes are low-frequency (C3).
    writeStateFile(SETTINGS_PATH(), payload, true);
  } catch (err) {
    console.error("[mandeck] settings:save failed", err);
  }
});

ipcMain.handle("settings:open-editor", async () => {
  const file = SETTINGS_PATH();
  if (!fs.existsSync(file)) {
    // Created with defaults only when the user asks for it — never
    // speculatively at launch (C3). A corrupt file is opened as-is.
    const doc = defaultSettings(process.env.SHELL || "/bin/zsh");
    try {
      writeStateFile(file, doc, true);
      settingsCache = doc as unknown as Record<string, unknown>;
      settingsLoaded = true;
    } catch (err) {
      console.error("[mandeck] settings file create failed", err);
      return false;
    }
  }
  const failure = await shell.openPath(file);
  // No default editor association: fall back to revealing in Finder (C3 §7).
  if (failure) shell.showItemInFolder(file);
  return true;
});

ipcMain.on("sidebar:visible", (_e, visible: unknown) => {
  if (typeof visible !== "boolean" || visible === sidebarVisible) return;
  sidebarVisible = visible;
  buildMenu();
});

ipcMain.on("app:version", (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.handle("drop:stage", (_e, srcPath: string): string => {
  try {
    if (!srcPath || !fs.existsSync(srcPath)) return "";
    // Stage outside userData because the default macOS userData lives in
    // "~/Library/Application Support/..." which contains a space —
    // Claude Code's path-to-image detector stops at the first space and
    // the path is rendered as text instead of [Image #N]. ~/.mandeck/drops/
    // is fully space-free.
    const dropsDir = path.join(os.homedir(), ".mandeck", "drops");
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

// Open Folder… directory picker. The menu route and the command palette both
// fan into the renderer's single open-folder handler, which invokes this.
ipcMain.handle("dialog:pick-folder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const res = await dialog.showOpenDialog(win, {
    title: "Open Folder",
    properties: ["openDirectory"],
  });
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
});

ipcMain.handle("shell:openExternal", (_e, url: string) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  shell.openExternal(url).catch(() => {});
  return true;
});

ipcMain.handle("clipboard:readText", () => clipboard.readText());

ipcMain.handle(
  "theme:reduced-transparency",
  () => nativeTheme.prefersReducedTransparency
);

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
  watchNativeTheme();
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
  if (now >= quitConfirmedUntil) {
    // First ⌘Q press: cancel quit, show toast, arm the confirm window.
    e.preventDefault();
    quitConfirmedUntil = now + QUIT_CONFIRM_WINDOW_MS;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("app:quit-prompt", QUIT_CONFIRM_WINDOW_MS);
    }
    setTimeout(() => {
      if (Date.now() >= quitConfirmedUntil) quitConfirmedUntil = 0;
    }, QUIT_CONFIRM_WINDOW_MS + 50);
    return;
  }
  if (!quitFlushed) {
    // Confirmed quit: hold it until the renderer force-flushes any pending
    // debounced save (B3 quit-flush), then resume.
    e.preventDefault();
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win) {
      quitFlushed = true;
      app.quit();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ipcMain.removeListener("state:flush-done", finish);
      quitFlushed = true;
      quitConfirmedUntil = Date.now() + QUIT_CONFIRM_WINDOW_MS;
      app.quit();
    };
    ipcMain.once("state:flush-done", finish);
    win.webContents.send("app:quit-flush");
    setTimeout(finish, 300);
    return;
  }
  // Flushed and confirmed — proceed with the quit.
  for (const pty of ptys.values()) {
    try { pty.kill(); } catch { /* noop */ }
  }
  ptys.clear();
});
