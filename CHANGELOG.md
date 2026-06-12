# Changelog

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
