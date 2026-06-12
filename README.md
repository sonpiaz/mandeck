<p align="center">
  <img src="docs/assets/icon.png" width="128" alt="Mandeck icon" />
</p>

<h1 align="center">Mandeck</h1>

<p align="center">
  A Liquid Glass terminal multiplexer for macOS — built for running many
  long-lived agent sessions side by side, one workspace per project.
</p>

<p align="center">
  <img src="docs/assets/hero.png" width="720" alt="Mandeck design render" />
  <br />
  <sub>Design render of the v0.1 glass chrome (Variant A — Liquid Glass).</sub>
</p>

## Install

Grab `Mandeck.app` from the
[latest release](https://github.com/sonpiaz/mandeck/releases/latest)
(Apple Silicon), drop it into `/Applications`, then clear the quarantine
flag — the build is not notarized yet:

```bash
xattr -cr /Applications/Mandeck.app
```

Or build it yourself in two commands — see
[Building from source](#building-from-source).

## Why Mandeck

Terminals became the primary IDE the moment coding agents moved into them.
That changes what a terminal needs to be good at: you are no longer typing
into one shell, you are supervising several long-running sessions across
several projects at once. Mandeck is shaped around exactly that workflow.
Each project lives in a named workspace with its own pane grid and its own
accent color, so a glance at any pane tells you which context you are
looking at. Switching workspaces is instant and lossless — every shell keeps
running while it is out of view.

The chrome follows Apple's Liquid Glass language from macOS Tahoe:
translucent surfaces that pick up your wallpaper, hairline specular edges,
and a strict rule borrowed from the best pro tools — glass belongs to the
chrome only. Terminal content sits on a near-opaque surface with text at
full contrast, because legibility beats decoration in a tool you stare at
all day.

## Highlights

- **Workspaces** — one per project, shown as chips in the titlebar. Each
  owns its pane layout, remembers its focused pane, and carries its own
  accent hue from a seven-color rotation. Workspaces auto-name themselves
  from the focused pane's working directory until you rename them.
- **Tiled panes** — up to five columns, filled by a predictable layout rule.
  Drag a pane by its header to rearrange; a glass ghost follows the cursor
  and an accent wash shows the drop target. Maximize any pane into a
  spotlight overlay without disturbing the layout underneath.
- **Persistence that respects your data** — layout, working directories,
  and window frame survive restarts. State writes are atomic with fsync,
  flushed on quit, and any schema migration backs up the previous file
  before touching it. A corrupted state file costs you one relaunch, never
  your layout.
- **Command palette** — ⌘K fuzzy-jumps to any workspace or pane and runs
  every app action from the keyboard. ⌘O opens any folder as a new pane
  already cd'd there; ⌘/ shows the shortcut map.
- **File-browser panes** — browse a directory inline as a first-class grid
  citizen: navigate, open, reveal, or drop files straight into a terminal.
- **Utility rail** — a slim dock on the right with a terminal launcher,
  a files popover, and a settings popover (font, shell, accent, text
  theme), with live-apply changes that never restart a shell.
- **Text themes** — three curated terminal palettes (Bright, Soft, Warm)
  so late-night sessions don't burn your eyes; every value audited at
  4.5:1 contrast or better.
- **Lightweight by principle** — no background daemon, no account, no AI
  bolted on. PTYs live only while the app runs; the renderer hosts xterm.js
  with the WebGL renderer.

## Keyboard

| Keys | Action |
|---|---|
| ⌘K | Command palette |
| ⌘T | New workspace |
| ⌘1–9 | Jump to workspace |
| ⌘[ / ⌘] | Previous / next workspace |
| ⌘⇧W | Close workspace |
| ⌘N / ⌘D | New pane |
| ⌘O | Open folder in a new pane |
| ⌘W | Close pane (cascades to workspace, then window) |
| ⌘/ | Keyboard shortcuts panel |
| ⌘Q ⌘Q | Quit (double-press confirm) |

Double-click a workspace chip to rename it. Drag chips to reorder. ⌘+click
opens links inside a terminal; plain clicks never navigate.

## Building from source

Mandeck is an Electron app targeting Apple Silicon Macs. macOS 26 renders
the full layered glass app icon; the in-app glass chrome works on any macOS
version Electron 33 supports, and `Reduce Transparency` collapses every
glass surface to a solid fallback.

```bash
npm install        # also rebuilds node-pty for Electron
npm run dev        # Vite + Electron with HMR
npm run dist       # package release/mac-arm64/Mandeck.app
```

The packaged build is unsigned and not notarized — Gatekeeper will balk at
a downloaded copy until you clear the quarantine flag (see
[Install](#install)). A build you produce on your own machine runs as-is.

## Architecture

- **Electron 33** — main process owns PTYs (node-pty), state and settings
  files, and the native menu. Window uses `under-window` vibrancy with a
  hidden-inset titlebar.
- **React 18 + TypeScript** — StrictMode stays off deliberately: terminal
  mounts spawn real PTYs, and a remounted terminal is a dead shell. Dormant
  workspaces stay mounted and hidden so their sessions keep streaming.
- **xterm.js 5** — WebGL renderer with a canvas fallback, themed from the
  design tokens, terminal background at 92% opacity over the vibrancy layer.
- **State v2** — a single `state.json` (schema-versioned, migrated with
  timestamped backups) plus a separate `settings.json`.
- **Design tokens** — every chrome color, blur, radius, shadow, and spring
  lives in one CSS custom-property sheet; components consume tokens, never
  hex values. Three glass materials are layered by elevation and never
  stacked on each other.

The full behavioral specification lives in [docs/SPEC.md](docs/SPEC.md) and
the v0.1 scope decisions in [docs/SPRINT-PLAN.md](docs/SPRINT-PLAN.md).

## App icon

The Dock icon is authored as a layered `.icon` package
(`build/icon/Mandeck.icon`) and compiled with `actool` into `Assets.car`,
so macOS 26 renders it as real layered Liquid Glass — the accent pane
catches light independently of the mark. The same artwork compiles to a
classic `.icns` for older systems.

## Roadmap

The ⌘K command palette and the file-browser pane type both shipped in
0.1.x. Next up: per-window state for true multi-window support, a sysinfo
widget for the utility rail, and signed + notarized release builds.

## License

[MIT](LICENSE) © 2026 Son Piaz
