# Changelog

## 0.1.3 — 2026-06-11

Resize correctness.

- Live drag no longer storms the shell with resize events: xterm re-fits
  every frame (visual stays smooth), but the PTY receives exactly one
  SIGWINCH per gesture, at the final size. Fixes duplicated/garbled output
  from TUI apps (Claude Code and other ink-based UIs) when resizing the
  window or pane splitters mid-stream.
- PTY resize dims are clamped to sane integers and failures are logged
  instead of silently swallowed, so a PTY can no longer get stranded at a
  stale size.

## 0.1.2 — 2026-06-11

Pane variety and faster theming.

- File-browser pane type: browse directories inline with navigation and
  context actions.
- Accent swatches now recolor the current workspace immediately.
- Keyboard-shortcuts panel on ⌘/.

## 0.1.1 — 2026-06-11

Navigation and workflow polish on top of the Glass redesign.

- Command palette (⌘K): fuzzy-searchable actions for panes, workspaces,
  and settings from anywhere in the app.
- Open Folder (⌘O): pick a directory and spawn a pane already cd'd there.
- Rail files popover: cwd at a glance plus a recent-folders list for
  one-click reopening.
- Settings pickers expanded, including accent swatches for per-workspace
  hues.
- Abbreviated pane titles keep headers readable in narrow panes.
- Pane-header context menu with Move to Workspace.

## 0.1.0 — 2026-06-11 "Glass"

The redesign release. The whole chrome moved to a Liquid Glass design
system while the terminal core stayed untouched.

- Workspaces replace tabs as the top of the hierarchy: named chips in the
  titlebar, per-workspace accent hues, auto-naming from the focused pane's
  cwd, instant lossless switching.
- State schema v2 with a safe v1 migration: timestamped backup before any
  write, atomic fsync'd saves, quit-time flush, corruption recovery.
- Liquid Glass chrome: design-token sheet, under-window vibrancy, glass
  titlebar and pane headers, glass drag ghost and drop wash, maximize
  spotlight as a body-level portal, reduced-transparency fallbacks.
- Utility rail with terminal launcher and settings popover backed by
  settings.json; font changes live-apply without restarting shells.
- xterm.js switched to the WebGL renderer with themed palette.
- Layered Liquid Glass app icon compiled from a hand-authored .icon
  package via actool, with .icns fallback.

## 0.0.1 — 2026-05-19

Initial from-scratch build: multi-tab terminal with tiled panes (up to five
columns), pane drag-rearrange, maximize spotlight, ⌘Q double-press confirm,
session persistence with OSC 7 cwd tracking, file-drop staging, and
⌘+click link opening.
