# SPEC — Mandeck Glass Redesign

Phase 3 deliverable. Clean-room specification. Implementers read ONLY this file
(plus SPRINT-PLAN.md) — they never see input/ or analysis/. This spec modifies
an existing application (target repo: `/Users/sonpiaz/mandeck`, current head
`7d102e0`); it is a redesign, not a greenfield build.

## Hard rules for this file

1. NO code blocks longer than 3 lines.
2. NO exact strings longer than 40 characters from source bundles or the legacy reference repo.
3. NO function names, class names, or file paths from the legacy reference repo. Paths and component names of the TARGET repo (`/Users/sonpiaz/mandeck`) are allowed as implementation anchors and are kept to a minimum; behavior descriptions are preferred.
4. Every feature must score 9/9 on the rubric below before advancing to Phase 4.

## Product overview

Mandeck is a macOS terminal multiplexer built for running many AI coding
agents in parallel: one window, project-scoped workspaces in a glass titlebar
strip, and a grid of terminal panes per workspace, each pane typically hosting
a long-running agent CLI. It is for developers who keep four to six agent
sessions alive all day and need to switch project contexts instantly without
ever killing a shell. It differs from stock terminals and browser- or
daemon-backed multiplexers by being a thin Electron + PTY app with a
macOS-native vibrancy glass chrome, a workspace-per-project model with
loss-free zero-config persistence, and a binding regression-invariant list
that guarantees no running shell is ever sacrificed to a visual change.

## Core user journeys (5 short narratives)

### Journey 1 — Onboarding: first launch after upgrade (v1 → v2 migration)

A user of the current build launches the redesigned app for the first time.
The main process finds their version-1 state file, validates it, writes a
timestamped backup to disk, migrates every tab verbatim into a workspace
(same ids, titles, column/pane structure, focus, maximize state), assigns
each workspace its permanent accent hue in array order, and only
then hydrates the renderer. The user sees their exact previous layout —
same columns and panes, the focused pane carrying the new accent focus ring —
with fresh shells spawning in each pane's saved working directory. Within a
prompt or two the workspace chips auto-title to project directory names and
the strip reads like a project list. Outcome: zero data loss, a byte-identical
v1 backup on disk, and a fully restored working environment.

### Journey 2 — Switching workspaces while agents run

The user has three workspaces, each with multiple panes streaming agent
output. They press ⌘2: the strip's active pill moves, the previous workspace's
grid hides, and the target's grid shows in the same frame — all workspaces
stay mounted, so every dormant PTY keeps streaming into its scrollback.
The activated workspace re-fits its terminals in one animation frame and
keyboard focus lands back in exactly the pane the user last used there.
Switching away and back is indistinguishable from never leaving; an agent
that finished while dormant simply shows its completed output on return.

### Journey 3 — Launching a pane from the utility rail

Mid-session the user clicks the "terminal" item at the top of the 56px right
rail. The click runs the identical code path as ⌘N: under five columns the
new pane becomes a new rightmost column; at the cap it joins the column with
the fewest panes. The new pane takes focus (accent ring moves to it), any
maximize spotlight collapses, and the layout persists through the normal
debounced save. Outcome: one mental model for pane creation, pointer or
keyboard.

### Journey 4 — Customizing via settings

The user clicks the gear at the bottom of the rail and a small glass-2
popover opens above it — no modal, terminals keep running behind it. They
step the terminal font size from 13 to 14: the change commits to the settings
file immediately and applies live to every terminal by mutating instance
options and re-fitting in place — never remounting, so every shell survives.
They set a default shell path, noted inline as applying to new panes only,
then press Esc to dismiss; nothing is lost because every change was already
committed. Power users press "Edit config file…" to open the raw settings
file in their default editor.

### Journey 5 — Failure recovery: corrupted state file

The user's layout file on disk is corrupted (unparseable JSON). At launch the
main process never silently destroys it: it copies the bad file to a
timestamped bad-state backup, then starts with a fresh default workspace, and
if even the backup write fails it suppresses all saves so the only copy can
never be overwritten. The user quits, replaces the state file with the newest
good backup (the migration-time v1 backup or the bad-copy after hand repair),
and relaunches. The decision table in Feature B3 hydrates the restored file
normally and the full layout returns. Outcome: corruption costs one relaunch,
never the layout.

## Tech stack (binding)

This spec modifies an existing app, so the stack is binding — implementers
must use what is already in the target repo, not substitute.

- **App shell**: Electron 33, macOS-first, single window in v1. The main process owns PTYs, the state and settings files, menus, and all file I/O; the renderer talks to it only over the existing IPC surface.
- **Renderer**: React + TypeScript. React StrictMode is OFF and must stay off (INV-8). The repo's existing bundler/build pipeline is kept unchanged.
- **Terminal**: xterm.js with the WebGL renderer addon (already a dependency, to be enabled) and the fit addon; node-pty in the main process.
- **Layout**: the repo's existing split-pane layout library for the column/pane grid; react-dnd for pane drag; plain HTML5 drag-and-drop for workspace-chip reorder (deliberately separate systems).
- **Styling**: plain CSS with custom properties carrying the Chapter A tokens; no CSS framework; system font stack (SF Pro Text/Display) plus SF Mono for terminal and path text.
- **Persistence**: JSON files in the app's userData directory — `state.json` (schema v2, Feature B3) and `settings.json` (Feature C3) — written atomically via temp-file-then-rename with fsync.
- **Packaging**: electron-builder, existing configuration unchanged.

## Features (each must hit 9/9 on rubric)

Every feature below carries the same 9 items, in order: **1. User outcome**,
**2. Trigger**, **3. Inputs**, **4. Outputs / side effects**, **5. States**,
**6. Transitions**, **7. Errors**, **8. Boundaries**, **9. Out of scope**.
Priorities: L1 = skeleton (nothing else lands without it), L2 = core, ship in
v0.1, L3 = edges.

Chapter A owns every design token; Chapters B, C, and D reference tokens by
name (`glass-1`, `--shadow-3`, `motion-snappy`, …) and never restate their
values. Where a value appears outside Chapter A, it is feature-specific (not
a shared token). The governing principle for the whole redesign: **chrome
gets the glass, the terminal buffer is content and never does** —
translucency, depth, and lighting on toolbars and panels only, so the
interface still reads with six agent panes streaming output.

---

# Chapter A — Design system & window chrome

---

### Feature A1 — Glass design system (canonical token set)

**Priority**: L1

**1. User outcome.** The app reads as a layered, macOS-native glass
instrument: the titlebar, pane headers, palettes, and menus frost what is
behind them, while terminal text stays at full contrast at all times. A user
with Reduce Transparency or Reduce Motion enabled gets a calm, opaque,
fade-only equivalent with zero loss of function.

**2. Trigger.** Tokens load with the renderer stylesheet and apply to every
window from first paint. Fallback variants activate when (a) the OS reports
reduced transparency, (b) the OS reports reduced motion, or (c) the user
enables the View → Opaque mode menu toggle.

**3. Inputs.**
- `prefers-reduced-transparency` and `prefers-reduced-motion` media queries, plus one boolean sent over IPC at window creation from the main process's native-theme check, so the xterm theme object (JS, not CSS) stays in lockstep.
- The active workspace's assigned accent hue (accent strategy below).
- The View → Opaque mode toggle state.

**4. Outputs / side effects.** All tokens ship as CSS custom properties
consumed by every chrome component. The terminal color theme consumes the
same hex values via JS.

Dark base palette:

| Token | Value | Role |
|---|---|---|
| `--bg-root` | `#0B0B10` | window base behind everything; also the opaque-fallback window color |
| `--bg-terminal` | `#0E0E14` | terminal pane base color |
| `--surface-solid` | `#16161C` | the surface all glass collapses to under reduced transparency |
| `--text-primary` | `#ECECF1` | primary text and terminal default foreground |
| `--text-secondary` | `rgba(236,236,241,0.62)` | secondary labels |
| `--text-tertiary` | `rgba(236,236,241,0.40)` | tertiary and disabled labels |
| `--separator` | `rgba(255,255,255,0.07)` | hairline separators |

Glass material levels — exactly three, never stacked directly:

| Level | Used for | Blur | Fill | Border (1px) | Inner top rim |
|---|---|---|---|---|---|
| glass-1 | persistent chrome: 44px titlebar, tab strip, 28px pane headers, utility rail | 16px + saturate(140%) | `rgba(18,18,24,0.55)` | `rgba(255,255,255,0.08)` | inset 1px top, `rgba(255,255,255,0.06)` |
| glass-2 | floating panels: command palette, dropdowns, context menus, popovers, toasts, drag ghost | 24px + saturate(160%) | `rgba(22,22,30,0.70)` | `rgba(255,255,255,0.12)` | inset 1px top, `rgba(255,255,255,0.09)` |
| glass-3 | modal overlays: maximize-spotlight scrim, settings sheet | scrim 32px, panel 40px | scrim `rgba(8,8,12,0.55)`, panel `rgba(24,24,32,0.78)` | `rgba(255,255,255,0.14)` | inset 1px top, `rgba(255,255,255,0.12)` |

Panels nested inside a glass surface use flat translucent fills
(`rgba(255,255,255,0.04–0.08)`) — never a second backdrop filter. A tiled
noise grain at 3% opacity with soft-light blending is applied to glass-2 and
glass-3 only, to kill banding on large dark panels; small controls and
glass-1 skip it.

Corner radius scale (concentric rule: inner radius = outer radius − padding,
floor 4px):

| Token | Value | Used for |
|---|---|---|
| `--radius-xs` | 4px | checkboxes, badges, small inputs |
| `--radius-sm` | 6px | buttons, tab pills, menu items |
| `--radius-md` | 10px | pane containers, cards |
| `--radius-lg` | 14px | floating panels, command palette |
| `--radius-xl` | 18px | modals |
| `--radius-pill` | 999px | capsule controls (radius = half height) |

Worked example of the concentric rule: a pane at 10px radius with a 4px-inset
header gives the header a 6px radius. Nested radii are always computed on
this arithmetic, never eyeballed.

Shadow / elevation scale (always paired with the material's 1px border — on
dark UI the hairline does half the elevation work):

| Token | Value | Used for |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(0,0,0,0.40)` | bars, headers |
| `--shadow-2` | `0 2px 6px rgba(0,0,0,0.35)` + `0 1px 2px rgba(0,0,0,0.30)` | hover lift, active tab |
| `--shadow-3` | `0 8px 24px rgba(0,0,0,0.40)` + `0 2px 6px rgba(0,0,0,0.30)` | palette, menus, drag ghost |
| `--shadow-4` | `0 16px 48px rgba(0,0,0,0.55)` + `0 4px 12px rgba(0,0,0,0.35)` | modals, spotlight pane |

Typography roles (system font stack so the SF Pro Text/Display optical switch
comes free; the terminal face is SF Mono — present on every target system):

| Element | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Titlebar tab title | SF Pro Text | 13px | 500 | inactive at 70% opacity, never a lighter weight |
| Titlebar secondary (counts, hints) | SF Pro Text | 11px | 400 | secondary color |
| Pane header title | SF Pro Text | 12px | 500 | middle-truncation for paths |
| Pane header path/branch | SF Mono | 11px | 400 | mono reads terminal-native |
| Uppercase section labels | SF Pro Text | 11px | 600 | letter-spacing +0.06–0.08em |
| Command palette input | SF Pro Display | 20px | 400 | the one Display moment |
| Menu / context items | SF Pro Text | 13px | 400 | 28px row height |
| Terminal body | SF Mono | 13px | 400 body, 700 bold-ANSI | line-height 1.4; ligatures off by default, user-optional |

No text below 11px ever sits on glass — small size plus translucent backdrop
is a double contrast penalty.

Motion tokens (springs, with bezier fallbacks; all collapse to 150ms opacity
fades under reduced motion):

| Token | Physics | Approx. duration | Used for |
|---|---|---|---|
| `motion-instant` | ease bezier | 120–150ms | hover, color changes |
| `motion-snappy` | spring response 0.35, damping 0.8 | ~300ms, ~2% overshoot | pane open/close, tab switch, maximize |
| `motion-smooth` | spring response 0.5, damping 1.0 | ~450ms, no overshoot | layout reflow, split resize |
| `motion-interactive` | spring response 0.15, damping 0.86 | continuous | drag-follow |

Standard micro-interactions: hover fades in over 130ms (fill
`rgba(255,255,255,0.06)`, border lightening to `rgba(255,255,255,0.16)`) and
fades out slower, over 250ms. Press scales to 0.97 with `motion-instant` and
releases with `motion-snappy`. The keyboard focus ring is
`0 0 0 3px rgba(accent, 0.35)` outside a 1px accent border, animated in over
150ms, shown on keyboard focus only, and never removed.

Accent strategy — one accent at a time, assigned per workspace:

- Each workspace owns one accent hue from a fixed 7-hue palette whose rotation order is: green `#58C142`, teal `#00FFDB`, blue `#429DFF`, purple `#BF55EC`, red `#FF453A`, orange `#FF9500`, yellow `#FFE900`. A hue is assigned exactly once, at workspace creation, stored on the workspace record as `accentHue` (B1, persisted in B3), and never changes for that workspace's lifetime — closing other workspaces, reordering chips, and relaunching never reshuffle hues. The first workspace of a fresh state takes the default accent — blue `#429DFF` unless the settings file overrides it (Feature C3) — and every later workspace takes a hue per B1's assignment scan (the normative algorithm). The glass tint thereby answers "which workspace am I in?" at a glance.
- Within any given view exactly one accent is visible (the active workspace's), and it tints **exactly four elements**: the focus ring, the active tab pill, the drop-target wash, and the terminal cursor. All other chrome stays neutral.
- Accent fills on glass are capped at 8% alpha (`rgba(accent, 0.08)` maximum). Accent-colored text and icons lighten one step per hue to hold at least 4.5:1 contrast on glass. Color lives in the content layer; glass itself is never tinted with accent beyond the cap.

**5. States.**
1. **Glass active** (default): all tokens as tabled above.
2. **Reduced transparency**: all three glass levels collapse to opaque `--surface-solid`; 1px borders and hairlines are kept; the window itself is built opaque (A2); the terminal snaps to solid `#0E0E14`.
3. **Opaque mode** (View menu toggle): identical surface treatment to state 2, user-invoked — it doubles as the screen-recording mode and the manual accessibility escape hatch.
4. **Reduced motion**: all spring tokens replaced by 150ms opacity fades; press-scale and drag-tilt effects disabled.
5. **Window unfocused**: the native backdrop dims automatically (A2's effect-state setting); chrome tokens do not change.

**6. Transitions.**
- OS accessibility toggles apply live, without relaunch: the main process listens for native-theme updates and switches the window (A2) while CSS media queries swap the surface tokens in the same frame.
- Opaque mode toggles instantly with no animation (it exists to remove visual noise).
- All state-to-state chrome changes use `motion-instant`; no glass surface animates its blur radius.

**7. Errors.**
- **Contrast failure** (text on glass below 4.5:1 over a worst-case backdrop — verify over white, photo, and black desktops): the remedy is raising the level's fill opacity, never raising blur, and never darkening text.
- **Gradient banding** on large glass panels: covered by the glass-2/3 noise grain; if banding appears on glass-1, the fix is increasing fill opacity, not adding grain.
- **GPU overrun** (dropped frames while output streams): reduce concurrent glass surfaces; the budget is at most 5–6 visible backdrop-filter regions, and persistent CSS blur is limited to the chrome strips defined here.

**8. Boundaries.**
- Glass is **chrome-only**: titlebar, tab strip, pane headers, utility rail, palettes, menus, modal scrims. The terminal viewport never receives a backdrop filter and terminal text is always rendered at 100% opacity, never vibrant or blended.
- Materials are never stacked: one glass level per region; anything overlaid inside it uses flat fills. Maximum three glass levels exist in the whole app, by construction.
- Refraction and lensing effects are deliberately excluded (the disciplined-glass approach proven by dense professional tools): precise blur, masking, and lighting only.
- The terminal background ships at fixed `rgba(14, 14, 20, 0.92)` alpha; every ANSI palette color must hold at least 4.5:1 against `--bg-terminal`.

**9. Out of scope.**
- A user-facing opacity slider (the future spec for it is a 0.80–1.00 clamp, but it ships after v1; v1 is fixed 0.92 plus Opaque mode).
- A theming system or light mode. (The small settings popover is Chapter C's feature and consumes these tokens; it is not a theming UI.)
- Pane-header internals, the utility rail's item design, and drag-ghost styling (Chapters C and D; they consume these tokens).

---

### Feature A2 — Window setup: native vibrancy, titlebar geometry, fallbacks

**Priority**: L1

**1. User outcome.** The window frosts the actual desktop behind it using the
OS compositor — blur is done by the window server essentially for free —
while keeping the native shadow, rounded corners, resizability, and traffic
lights. Users who opt out of transparency get today's opaque window with no
glass machinery active.

**2. Trigger.** All options are set in the window constructor inside the
window-creation function in `electron/main.ts` (target repo) — never via
setters after creation, which historically resurfaces white-flash bugs.
Runtime changes are driven only by native-theme update events and the Opaque
mode toggle.

**3. Inputs.**
- The native-theme reduced-transparency boolean, read at construction time and subscribed to for live changes.
- The dev-tools environment flag (dev-only caveat in Errors).
- The Opaque mode menu state.

**4. Outputs / side effects.** Window construction options:

| Option | Value | Why |
|---|---|---|
| `titleBarStyle` | `"hiddenInset"` | hides the native bar, keeps inset traffic lights; already in place today |
| `trafficLightPosition` | `{ x: 16, y: 16 }` | the native circles are 12px tall, so y = (44 − 12) / 2 = 16 centers them in the 44px bar |
| `vibrancy` | `"under-window"` | maps to the material macOS itself uses behind app windows; the lighter sidebar material is too bright for a dark terminal and the HUD material is tuned for HUD chrome |
| `visualEffectState` | `"followWindow"` | backdrop lights up when focused and dims when not — native focus cue for free, and the compositor idles the effect when unfocused |
| `backgroundColor` | `"#00000000"` when glass is active; `"#0B0B10"` when opaque | alpha-zero lets the effect view show through; both values set in the constructor alongside vibrancy |
| `transparent` | **never set** | transparent windows lose the native shadow, break resizing reliability, lose transparency when DevTools opens, and still cannot blur the desktop; vibrancy avoids all of it |
| `roundedCorners` | default (true) | disabling it on a frameless macOS window also disables fullscreen; never touch it |
| `hasShadow` | default (true) | the native shadow is part of the glass read |

Renderer base layers, bottom to top: the document background is fully
transparent when glass is active; a single fixed tint layer of
`rgba(11, 11, 16, 0.60)` sits over the vibrancy for color control; chrome
regions (titlebar, pane gutters, pane headers) stay fully transparent down to
that tint so the glass actually shows there.

Terminal renderer configuration:

| Setting | Value | Why |
|---|---|---|
| Renderer | WebGL addon (already a dependency), automatic DOM fallback on context loss | the DOM renderer pays the highest per-frame cost for alpha-blended cells across a live multi-pane grid |
| `allowTransparency` | `true`, set before the terminal opens | required for an alpha background; cannot change without reopening |
| `theme.background` | `rgba(14, 14, 20, 0.92)` | at ~92% the eye already reads "transparent terminal"; the last 8% of alpha buys nothing visually but costs contrast and render time |
| Opaque-mode background | solid `#0E0E14` at 1.0 | reduced transparency and Opaque mode both use it |

CSS backdrop-filter division of labor: native vibrancy provides the
window-base glass; CSS blur is reserved for small, short-lived floating
layers (drag ghosts, the maximize-spotlight scrim, toasts, menus, popovers)
that sit above already-painted content and disappear when idle, plus the
persistent glass-1 chrome strips. No CSS-blurred element may ever sit
directly over a region where only the vibrancy backdrop shows through — real
page pixels (the near-opaque terminal canvas or the tint layer) must be
underneath it, because vibrancy under a CSS backdrop filter is a known,
unfixed Electron rendering bug.

**5. States.**
1. **Glass window** (default): vibrancy on, alpha-zero background, renderer transparent stack as above.
2. **Opaque window**: built when the OS reports reduced transparency at construction — no vibrancy, background `#0B0B10`, exactly today's construction.
3. **Live-switched**: on an OS opt-out event the window removes vibrancy and sets background `#0B0B10`; on opt-in it restores the under-window material and alpha-zero background. CSS mirrors the switch via the media query without IPC; the one IPC boolean keeps the terminal theme object in sync.
4. **Unfocused**: backdrop dims via the follow-window effect state; no app code involved.
5. **Opaque mode**: window stays vibrant but the renderer paints `--surface-solid` chrome and a solid terminal, which fully hides the backdrop — visually identical to state 2 without rebuilding the window.

**6. Transitions.**
- Construction-time branch on the reduced-transparency boolean; runtime switches only through the native-theme update subscription and the menu toggle. No other code path may touch vibrancy or background color.
- Window radius and shadow never animate; they are native.

**7. Errors.**
- **Detached DevTools kills vibrancy** for the life of the window and it cannot be restored without recreating the window. Dev sessions launched with the dev-tools flag are expected to lose glass; a code comment marks this as known so it is never chased as a regression. No mitigation ships.
- **White flash at creation**: prevented by setting vibrancy and background color together in the constructor; if a future Electron upgrade reintroduces it, the regression test is window creation under both states 1 and 2.
- **Screen capture looks milky or black** in window-scoped recordings (the glass has no real backdrop to composite): the documented answer is recording in Opaque mode; no capture-detection automation ships.
- **Thin glyph anti-aliasing** with the WebGL renderer over transparency: the remedy ladder is nudging terminal alpha from 0.92 toward 0.95 — never abandoning WebGL; below that, the renderer's automatic DOM fallback bounds the failure.

**8. Boundaries.**
- macOS only; this feature defines no Windows or Linux behavior.
- The 44px bar height, the traffic-light position, and the hidden-inset style are fixed constants of the design; nothing else may reposition the lights.
- The traffic-light zone (roughly x 16–68) is kept free of any no-drag overlay so the native hover targets are never fought over.
- Every interactive element inside the titlebar must opt out of the drag region (full map in A3); drag areas ignore all pointer events.

**9. Out of scope.**
- Per-pane or per-surface native materials (one window-level material only).
- Acrylic or other non-macOS glass back-ends.
- Any use of a transparent frameless window.

---

### Feature A3 — The 44px top bar

**Priority**: L2

**1. User outcome.** One full-width glass bar carries everything: traffic
lights, the workspace tab strip, and the new-workspace button — maximizing
terminal rows, keeping a single continuous drag surface, and showing at a
glance which workspace is active via its accent-tinted pill.

**2. Trigger.** Rendered on every window at all times. Reflows on window
resize, workspace add/remove/rename, and active-workspace change. The tab
strip component lives at `src/TabBar.tsx` in the target repo.

**3. Inputs.** Workspace list and active workspace id; pointer, wheel, and
drag events; double-click rename edits; window width.

**4. Outputs / side effects.**

**Structure.** A single 44px-tall glass-1 row including its 1px bottom
hairline — there is no second row, and the workspace tabs are the only tab
level in the app (each workspace owns one pane grid; nothing tabbed exists
below it). Material: glass-1 exactly as tokened in A1, with the bottom
hairline at `--separator`. Left-to-right order: traffic lights + left drag
spacer → tab strip → "+" button pinned outside the scroll area → flexible
right drag spacer. **There is no brand glyph and no workspace-switcher button
in v1** (binding ruling, Chapter B): no saved-workspace layer exists, so
there is nothing for a switcher to manage — all workspace management is
inline on the chips.

**Left spacer.** 80px wide, full bar height, pure drag region, no overlays.
The lights occupy roughly x 16–68, leaving 12px clearance. The tab strip
starts at x = 80.

**Tab strip geometry.** Chip height 34px, vertically centered (5px inset top
and bottom). Preferred chip width 130px; chips shrink evenly to a 100px
minimum as workspaces are added; hard maximum 240px with inside ellipsizing.
Horizontal padding 12px per side. Close button is a 19×19px hit target
right-aligned in the chip with an 8px gap from the title, shown on the active
chip and on hover, hidden when only one workspace exists. Gap between chips
6px; between two *inactive* neighbors a separator tick (1px × 16px,
`--separator`, vertically centered) is drawn, suppressed on either side of
the active chip. Titles are 13px system sans, single line, ellipsized;
double-click opens the inline rename input.

**Chip states.** The active pill is one of the four accent-tinted elements,
at the 8%-alpha cap:

| State | Fill | Border | Text | Extras |
|---|---|---|---|---|
| Active | flat `rgba(workspace-accent, 0.08)` | 1px `rgba(255,255,255,0.10)` | 13px / 500, `--text-primary` at 100% | radius `--radius-sm`, `--shadow-2` lift |
| Inactive | transparent | none | 13px / 500, `--text-primary` at 70% | separator ticks both sides |
| Inactive hover | flat `rgba(255,255,255,0.05)` | none | text to 100% over 130ms | — |

Weight stays 500 in every state — activation changes opacity and fill, never
weight, so switching tabs causes zero layout shift. Chip text and the close
glyph are never accent-colored.

**"+" button.** 34×34px, radius `--radius-sm`, plus-glyph at 70% opacity,
hover = flat `rgba(255,255,255,0.06)` with the glyph at 100%. Pinned as a
sibling to the right of the scroll container so it never scrolls away; 8px
gap from the strip. Creating a workspace auto-scrolls the strip to the end.

**Right spacer.** Everything right of "+" is a flex-grow drag region with a
56px minimum width enforced even at full overflow. It ships empty in v1; if a
future affordance (update notice, AI toggle) arrives, it docks at the
spacer's left edge as a no-drag island, preserving the 56px drag minimum.

**Overflow.** Shrink-then-scroll: chips shrink evenly from 130px to 100px;
only when count × 100px exceeds the strip does it scroll horizontally, with
an auto-hiding overlay scrollbar that fades about 1.3s after the pointer
leaves. Drag-to-scroll is supported.

**Drag-region map.** `user-select: none` on the entire bar; the rename input
locally re-enables text selection. No custom context menu is attached to any
drag element (right-click on a drag region can pop the system window menu);
chips, being no-drag, attach nothing either — chip context menus do not exist
in v1.

| # | Element | Region |
|---|---|---|
| 1 | Bar root (44px row) | drag |
| 2 | Left 80px traffic spacer | drag (kept free of overlays) |
| 3 | Tab strip scroll container, including gaps and ticks | no-drag (wheel scroll, drag-scroll, and chip reorder all die inside drag regions) |
| 4 | Each chip: title, close, rename input | no-drag (inherited from 3) |
| 5 | "+" button | no-drag |
| 6 | Right flexible spacer (≥56px) | drag |
| 7 | 1px bottom hairline | drag (part of bar root) |

**Rail join and content formulas.** The bar spans the full window width; the
right utility rail starts *below* it, keeping the entire top edge one
continuous drag/glass surface. With the rail width fixed at 56px: pane-grid
width = window width − (56 if the rail is visible, else 0); pane-grid height
= window height − 44; rail box = x at window width − 56, y at 44, height =
window height − 44. The maximize-spotlight scrim keeps its 44px top anchor.

**Layout diagram (logical px, 1400px-wide window example):**

    ◄──────────────────────────────── windowWidth = 1400 ────────────────────────────────►
    ┌──────────────────────────────────────────────────────────────────────────────────────┐
    │ 44px glass-1 bar: blur 16 + saturate 140%, fill rgba(18,18,24,.55), top rim inset    │ 44
    │                                                                                        │
    │ |◄── 80 ──►|◄————— tab strip: chips 130→100, h34, gap 6 —————►|8|◄34►|◄—— ≥56 ——►|   │
    │   ● ● ●      sonpiaz │ Affitor-main │ kyma-api   ▐ sonpiaz ▌      +       (drag)      │
    │   traffic    ↑inactive: text 70%, ticks 1×16      ↑active pill            spacer      │
    │   lights     between inactive neighbors            accent fill 8%,                    │
    │   {x:16,y:16}                                      r6, 1px border, h34                │
    ├───────────────────────────────────────────────── 1px hairline rgba(255,255,255,.07) ──┤
    │                                                                          ┌─── 56 ───┐ │
    │   pane grid                                                              │ right    │ │
    │   width  = 1400 − 56 = 1344        (rail hidden → 1400)                  │ rail     │ │
    │   height = windowHeight − 44                                             │ y starts │ │
    │   …                                                                      │ at 44    │ │

**5. States.**
- Chip: active / inactive / inactive-hover / renaming (inline input replaces the title; input is the bar's only text-selection zone).
- Strip: fits (no scroll) / shrinking (130→100px) / scrolling (overlay scrollbar live) / scrollbar fading.
- "+" button: rest / hover.
- Single-workspace: close buttons hidden on all chips.
- Reduced transparency or Opaque mode: the bar renders on opaque `--surface-solid` with the hairline kept; all geometry unchanged.

**6. Transitions.**
- Workspace switch: pill fill, text opacity, and tick suppression swap with `motion-instant`; the pane grid below switches per Feature B4.
- Hover states fade in 130ms, out 250ms. Creating a workspace appends a chip and auto-scrolls to it with `motion-smooth`.
- Width changes from add/remove/resize reflow chips evenly with `motion-smooth`; under reduced motion all of the above become 150ms fades or instant repositioning.

**7. Errors.**
- Title longer than the chip: ellipsize inside the chip; the full title appears in a native tooltip and the rename input.
- Rename committed empty: revert per Feature B1's reset rule; Escape cancels; Enter or blur commits.
- Wheel or drag-scroll attempted while the strip fits: no-op, no scrollbar flash.
- A right-click landing on a drag region: the system may show the window menu; the app attaches nothing there by design.

**8. Boundaries.**
- The bar is the only horizontal chrome strip; no second tab row may be introduced without revisiting the workspace-model decision (Chapter B, which is binding over this layout's labels but not its geometry).
- The two guaranteed window-drag handles — 80px left, ≥56px right — may never shrink below those minimums regardless of workspace count.
- Accent appears in the bar only as the active pill's 8% fill; ticks, hairline, hover fills, and text stay neutral.
- The bar uses glass-1 only and opens no popovers in v1.

**9. Out of scope.**
- The utility rail's contents and item design (Chapter C; this feature fixes only its 56px width and its below-the-bar join).
- Pane headers, drag-ghost visuals, and drop-target washes (Chapter D; they consume A1 tokens).
- Workspace behavior semantics — creation, switching, rename rules, persistence (Chapter B owns behavior; this feature owns presentation).

---

# Chapter B — Workspace model & workspace bar behavior

This chapter is normative for the workspace hierarchy, the workspace bar's
behavior, the v2 persistence schema with its v1→v2 migration, and
workspace-switching mechanics. Two binding precedence rulings:

1. **No brand glyph or switcher button in the titlebar in v1.** There is no saved-workspace layer in v1, so a switcher popover has nothing to manage. The bar's left edge is: traffic-light spacer, then workspace chips, then the trailing "+", nothing else. Feature A3 owns *presentation* (spacers, chips, ticks, overflow); this chapter owns *behavior*.
2. **One strip, two levels of chrome.** There is no second tab row below the workspace bar. A workspace directly owns its pane grid.

Vocabulary: a **workspace** is one chip in the top strip and one column/pane
grid. It is a rename-and-promotion of the current build's "tab" entity — not
a new layer above it. In code, the tab-family names are renamed to
workspace-family names, and the existing pane-grid component currently named
`Workspace` (in `src/Workspace.tsx`) is renamed `PaneGrid` so the word
"workspace" is free for the user-facing entity. The persisted root document
type is renamed `PersistedState` for the same reason.

---

### Feature B1 — Workspace entity (window → workspace → pane grid)

**Priority**: L1

**1. User outcome.** Each project context the user works in is one workspace:
a named chip in the top strip that owns a full grid of terminal panes. The
strip reads as a list of projects ("sonpiaz", "Affitor-main", "kyma-api")
because workspace titles auto-track the focused pane's directory. Window →
workspace → pane grid is the entire hierarchy; there is no tab layer.

**2. Trigger.** The entity exists from first launch: the app always has at
least one workspace. New workspaces are created via the bar (B2); the
entity's fields change in response to pane focus, cwd reports, renames,
maximize toggles, and layout edits.

**3. Inputs.**
- Pane-grid edits (add/close/move panes, drag splitters) targeting the workspace's columns.
- OSC 7 cwd reports from the workspace's focused pane (drives auto-naming).
- Rename commits from the chip's inline editor (B2).
- Maximize toggles from pane headers.

**4. Outputs / side effects.** One workspace record, the unit of both
rendering and persistence:

| Field | Meaning |
|---|---|
| `id` | Stable string id (`t`-prefix + numeric suffix convention carried over from the current build). Keys the chip and the React subtree. |
| `title` | Chip label. No length cap; long titles ellipsize visually. |
| `autoNamed` | `true` → the title tracks the focused pane's cwd basename (see States). |
| `accentHue` | One of the seven accent hexes (A1). Assigned at creation by the scan rule below; immutable for the workspace's lifetime. While this workspace is active it tints A1's four sanctioned elements: focus ring, active chip pill, drop wash, terminal cursor. |
| `cols` | Ordered columns, each `{cid, panes}` — exactly the current build's column/pane structure, unchanged. Columns cap at 5; panes stack vertically within a column. |
| `focusedPaneId` | The pane that holds keyboard focus when this workspace is active; restored on every switch (B4). |
| `maximizedPaneId` | The spotlighted pane, or null. Per-workspace; survives switches and restarts. |

**Accent assignment (normative).** At creation — and only then — the new
workspace takes the first hue not owned by any existing workspace, scanning
the A1 palette in its fixed rotation order starting at the default accent
(C3). When all seven hues are owned (an eighth workspace and beyond), the
scan instead picks the least-owned hue, ties broken by the same scan order —
duplicates are accepted past seven. A hue freed by closing a workspace
returns to the pool for future creations; no surviving workspace ever changes
hue. Because `accentHue` persists in the v2 schema (B3), relaunch reads hues
from the file rather than re-deriving them — strip order and creation order
are both irrelevant to a hue once assigned, so reorders and middle-of-strip
closes can never shift the active pill, focus ring, or cursor tint.

A workspace transitively owns its panes' PTYs, xterm instances, and
scrollback (all runtime-only), plus its splitter ratios (runtime-only, never
persisted). A workspace does **not** own: the `paneCwds` map (global at the
state root, because pane ids are globally unique — B3), sidebar visibility
(global — Feature C1), or settings.

**5. States.** `autoNamed` semantics, fully specified:
- A new workspace starts with title `shell` and `autoNamed: true`.
- **Auto-rename rule (REQUIRED, newly wired in this redesign):** whenever a workspace's *focused* pane reports a cwd change and the workspace is `autoNamed`, the title becomes the basename of that cwd. Without this rule every chip reads "shell" and the strip's project-name identity collapses. Only the focused pane drives the title; the rule applies to dormant workspaces too (their chips update live).
- A non-empty manual rename sets `autoNamed: false` — sticky across cwd changes and restarts.
- Committing an empty rename resets `autoNamed: true`, and the title immediately re-derives from the focused pane's last known cwd basename; if no cwd is known yet, it falls back to `shell`.
- Basename edge: cwd `/` titles the workspace `/`; the home directory titles it with the user's directory name. No special-casing.

**6. Transitions.** Tab → workspace is a rename plus exactly one addition:
every field above except `accentHue` maps 1:1 onto a field of the current
build's tab record with identical semantics, and `accentHue` is the single
new entity-level field — the v1→v2 migration assigns it per the scan rule
above (B3). No other field is added or removed at the entity level (the
remaining schema-level additions live in B3). Pane-grid behaviors (add-pane column algorithm, close-pane focus
fallback, drag-rearrange drop semantics, maximize spotlight) are owned by
Chapter D's invariants and are unchanged by this promotion.

**7. Errors.** A cwd report from a non-focused pane never retitles the
workspace. A cwd report arriving while the rename editor is open is applied
to state but the editor's draft text is not disturbed; if the editor then
commits empty, the freshly reported cwd wins (per the reset rule above).

**8. Boundaries.** Minimum one workspace per window at all times (closing the
last one closes the window — B2). No maximum workspace count; the bar's
shrink-then-scroll overflow rule (A3) absorbs growth. Pane and column ids are
globally unique across all workspaces (B3); the 5-column cap is per
workspace.

**9. Out of scope.** The legacy app's higher "saved workspace" layer:
name/icon/color identity, saved-vs-ephemeral distinction, switcher popover,
inline icon/color editor. Per-workspace sidebar visibility and per-workspace
settings (deferred until needed). Workspace templates and profiles. If a
future version wants multiple *sets* of workspaces, that is a v2+ layer above
this model and must not disturb the entity defined here.

---

### Feature B2 — Workspace bar interactions

**Priority**: L2

**1. User outcome.** The user creates, switches, renames, closes, and
reorders workspaces entirely from the top strip or the keyboard, with the
exact muscle memory of today's tab bar — every existing tab shortcut performs
the same action, relabeled to workspaces.

**2. Trigger.** Pointer interactions on the strip (click, double-click,
hover, HTML5 drag, "×" and "+" clicks) and the keyboard map below.

**3. Inputs.** Full keyboard map — a 1:1 relabel of the current bindings; no
chord changes:

| Shortcut | v1 action | Route | Change vs. current build |
|---|---|---|---|
| ⌘1…⌘9 | Jump to workspace N (left-to-right strip order) | Renderer keydown listener (stays out of the native menu, as today) | Relabel only |
| ⌘[ / ⌘] | Previous / next workspace, wraps at both ends | "Workspace" app menu → IPC | Relabel only |
| ⌘T | New workspace (one pane, focused, becomes active) | File menu → IPC | Relabel only |
| ⌘⇧W | Close active workspace | File menu → IPC | Relabel only |
| ⌘W | Close focused pane; cascade pane → workspace → window | File menu → IPC | Relabel only (cascade now reads "workspace") |
| ⌘N / ⌘D | New pane in active workspace | File menu → IPC | Unchanged |
| ⌘⇧N | — | — | **Removed** (single-window v1, B3) |
| ⌘⌃1…⌘⌃9 | Unbound | — | Reserved for a future workspace-set switcher; never bound in v1 |

Menu relabels: "New Tab" → "New Workspace", "Close Tab" → "Close Workspace"
in the File menu; "Previous Tab" / "Next Tab" → "Previous Workspace" / "Next
Workspace" in the Workspace menu (the menu itself keeps its name). The "New
Window" item is deleted.

**4. Outputs / side effects.** Mutations to the workspace array,
`activeWorkspaceId`, and per-workspace `title`/`autoNamed`; all persist via
the normal debounced save (B3).

**5. States.** Per interaction:

- **Create.** Two equivalent entry points: the "+" button pinned at the strip's right end *outside* the scroll area (so it never scrolls away), and ⌘T. The new workspace is appended at the end of the strip, contains exactly one pane, takes focus, becomes active, and receives its permanent `accentHue` via B1's assignment scan; the strip auto-scrolls to reveal its chip. Title starts as `shell` until the first cwd report (B1).
- **Switch.** Click a chip, ⌘1–9 jump, or ⌘[/⌘] cycle with wraparound. Switching is a pure activation change — no workspace state is mutated except `activeWorkspaceId`. Mechanics in B4.
- **Inline rename.** Double-click a chip swaps its label for an inline text input — auto-focused with the text pre-selected. Enter commits; Escape cancels; blur commits. The committed value is trimmed; a trimmed-empty commit resets `autoNamed: true` (B1); any non-empty commit sets the title and `autoNamed: false` (sticky manual name). The first click of the double-click pair activates the chip, so a renamed workspace is always the active one when the editor opens.
- **Close.** The "×" affordance renders only when more than one workspace exists, and then only on the active chip and on a hovered chip. Clicking "×" closes that workspace — active or not — killing all its PTYs and deleting its panes' `paneCwds` entries. Closing the *active* workspace activates its right neighbor; if it was last in the strip, the new last workspace (left neighbor) activates. Closing an *inactive* workspace leaves the active one unchanged. ⌘⇧W closes the active workspace under the same rules. Closing the last remaining workspace closes the window (which is the app, in single-window v1). The ⌘W cascade is: close focused pane → an emptied workspace closes → the last workspace's close closes the window. No confirm-before-close dialog anywhere in this flow.
- **Drag-reorder.** Chip reorder uses plain HTML5 drag-and-drop, kept deliberately separate from the react-dnd pane system: drag a chip, drop it on another chip, and the dragged workspace is spliced to the target's index. The active workspace stays active through a reorder; ⌘1–9 indices follow the new order immediately; the new order persists via the debounced save. There is no animated ride-the-cursor reorder and no live mid-drag reshuffling — the order changes once, on drop.

**6. Transitions.** Hover, press, and active-chip visual treatments (pill
fill, separator ticks, 130→100px shrink, overlay scrollbar) are owned by
Feature A3; nothing in this feature alters them. Creating a workspace plays
no entrance animation beyond A3's chip-grow; switching plays none (B4).

**7. Errors.**
- A ⌘1–9 jump to an index beyond the workspace count (e.g. ⌘7 with four workspaces) is a silent no-op.
- Cycling with a single workspace is a no-op (wrap lands on itself).
- A whitespace-only rename commit counts as empty (reset to auto-named).
- Starting a chip drag while another chip's rename editor is open blurs the editor first, committing its draft, then proceeds with the drag.
- Dropping a dragged chip anywhere other than on a chip (on the "+", the spacers, or outside the strip) cancels the reorder; the order is unchanged.
- Closing the workspace whose chip is currently in rename mode (via ⌘⇧W) discards the editor with the workspace.

**8. Boundaries.** Reordering across an overflowed strip requires scrolling
the strip first — there is no drag-past-edge auto-scroll in v1. The "×" hit
target and chip geometry come from A3. Keyboard jump covers only the first
nine workspaces; further workspaces are reachable by click and cycle only.

**9. Out of scope.** Chip context menus, F2-to-rename, any title length cap
(titles ellipsize instead), tab pinning, per-chip badges and flag markers,
confirm-before-close, and any switcher popover. None of these exist in v1.

---

### Feature B3 — Persistence v2 and the v1→v2 migration

**Priority**: L1

**1. User outcome.** Quitting and relaunching restores every workspace —
order, titles, column/pane structure, focus, maximize state, and each pane's
working directory — with fresh shells. A user upgrading from the current
build keeps their entire saved layout: their old state file loads loss-free
as workspaces, and a timestamped backup of it exists on disk before the new
format ever writes.

**2. Trigger.** Load: app launch (renderer requests state over IPC; the main
process owns the file). Save: any state change, debounced 400ms, plus a
force-flush during the quit sequence. Migration: a version-1 file encountered
at load time.

**3. Inputs.** The `state.json` file in the app's user-data directory (dev
builds keep their separate profile directory, unchanged).

**4. Outputs / side effects.** The v2 schema — flat and single-window:

| Root field | Type | Semantics |
|---|---|---|
| `version` | literal `2` | Schema discriminator. |
| `workspaces` | ordered array | Strip order, left to right. Each entry is exactly the workspace record of B1 (`id`, `title`, `autoNamed`, `accentHue`, `cols` of `{cid, panes}`, `focusedPaneId`, `maximizedPaneId`). |
| `activeWorkspaceId` | string | Must reference an entry in `workspaces`. |
| `paneCwds` | map: pane id → absolute path | Stays ONE global root-level map (pane ids are globally unique). Entries are deleted when their pane closes, so the map stops accreting dead keys. |
| `windowBounds` | optional `{x, y, w, h}` | Last window frame, saved debounced on move/resize and restored on launch. Absence is tolerated: the window opens at the 1400×900 default. Restored bounds are validated against the current display arrangement: if the frame does not intersect any attached display's work area (display unplugged since last run), the value is discarded and the window opens at the default size, centered on the primary display; the discarded value is overwritten on the next save. |
| `sidebarVisible` | optional boolean | Utility-rail visibility (Feature C1). Absent or non-boolean ⇒ `true`. Never causes hydration to reject the file. |

There is no `windows` array — the root is deliberately single-window (see
Boundaries); a future v3 may wrap it.

**5. States.** Load-time decision table, evaluated by the **main process**
inside its state-load handler before the renderer receives any payload:

| File condition | Backup written first | Then |
|---|---|---|
| `version: 2`, shape valid | none | Hydrate directly. |
| `version: 1`, passes the existing field-by-field v1 validation | `state.json.v1-backup-<timestamp>` | Migrate (table below). |
| `version: 1`, fails validation | `state.json.bad-<timestamp>` | Fresh default state. |
| Any other version, unparseable JSON, or missing file shape | `state.json.bad-<timestamp>` | Fresh default state. |
| File absent | none | Fresh default state. |

The backup is written before the renderer hydrates, so it exists even if the
renderer's debounced save overwrites `state.json` 400ms later. No v2 write
may occur before hydration resolves (the existing readiness gate already
enforces this ordering). This closes the silent-destruction hazard: the
current loader returns null on any version mismatch and the app then
overwrites the file with a fresh default within 400ms.

Migration mapping — a verbatim wrap plus one additive field; no existing
data is rewritten:

| v1 field | v2 destination | Transform |
|---|---|---|
| `tabs` | `workspaces` | Verbatim: same array, same order, same records, same ids. Tab K becomes workspace K. Additionally, each migrated workspace gains `accentHue`, assigned in array order by B1's scan — the first tab gets the default accent, the second the next hue in the rotation, and so on. |
| `activeTabId` | `activeWorkspaceId` | Copied. |
| `paneCwds` | `paneCwds` | Carried unchanged. |
| `version: 1` | `version: 2` | Replaced. |
| — | `windowBounds`, `sidebarVisible` | Absent after migration (both tolerated). |

Workspace ids keep their existing `t<N>` string values through migration —
only type names and field names change — so the one-character-prefix +
numeric-suffix convention keeps working with zero data rewriting.

**6. Transitions.** Counter re-seeding: on every hydrate (v2 or migrated),
the three id counters (`p`/`c`/`t` suffixes) re-seed to the maximum numeric
suffix found by scanning **every** workspace's id, columns, and panes — not
just the active workspace. This is mandatory: dormant workspaces keep live
panes whose PTY-map entries are keyed by bare pane id; a freshly minted
colliding id would silently hijack a hidden workspace's shell. Any future
schema nesting must preserve this walk-all-workspaces invariant.

Write hardening ships in the same change as the version bump: fsync before
the atomic temp-file rename, and a force-flush of any pending debounced save
during the quit sequence, so a layout change in the last 400ms before quit is
no longer lost. The 400ms debounce is kept.

**7. Errors.** A v2 file whose `activeWorkspaceId` references no workspace
hydrates with the first workspace active. A workspace whose `accentHue` is
missing or not one of the seven palette hexes (e.g. a hand-edited file)
hydrates anyway: the field is repaired in array order by B1's assignment
scan and the repair persists with the next save — never a rejection. A v2
file with an empty `workspaces` array fails validation (backed up as bad,
fresh default).
`paneCwds` entries pointing at directories that no longer exist are passed to
PTY spawn as-is; spawn falls back to the home directory (existing behavior).
Backup write failure aborts the migration: the app loads a fresh default *in
memory* but suppresses saves until a backup succeeds, rather than risking the
only copy of the v1 file.

**8. Boundaries.** **Single-window only.** The "New Window" menu item and its
window-creation IPC channel are removed in v1 — not hidden behind a flag,
removed. Rationale: the current multi-window is broken by design (every
window last-writer-wins-saves the same file; the main-process PTY map is
unscoped), the product is a single-window product, and freezing the v2 schema
around one window keeps the migration trivial. With one window, the PTY map
needs no window scoping; globally-unique pane ids are the only invariant it
relies on. The committed return path when multi-window comes back (v2+):
per-window state files plus a small window manifest, pane ids namespaced per
window, and the PTY map keyed by window + pane id — not a `windows` array
inside one shared file, which would re-create the write race. Nothing in the
v2 schema blocks that path.

**Migration acceptance test (mandatory gate — the redesign does not ship
without it passing).** Take a `state.json` written by the current production
build (version 1, one or more tabs, populated `paneCwds`). Launch the
redesigned build against it. It MUST hold that:
1. A `state.json.v1-backup-<timestamp>` file exists on disk before the first v2 write, byte-identical to the original v1 file.
2. Zero data loss: the v2 file contains every v1 tab as a workspace — same count, same order, same ids, titles, `autoNamed` flags, column/pane structure, `focusedPaneId`, `maximizedPaneId`, and the full unmodified `paneCwds` map. The previously active tab is the active workspace. Each workspace additionally carries an `accentHue` assigned in array order per B1 — the only field migration adds.
3. **Workspace #1 renders the identical layout** the v1 app rendered for tab #1: same columns left to right, same pane stacking within each column, same focused pane carrying the focus ring, same maximize state — and every pane's fresh shell spawns in its saved cwd.
4. After the app's first save, re-launching restores the same state again (round-trip stability), and the backup file is untouched.

**9. Out of scope.** Multi-window state (above). Persisting splitter ratios,
scrollback, or PTY contents (PTYs remain runtime-only; restore always spawns
fresh shells). Settings (separate file — Feature C3). Schema provisions for
pane types other than terminal (lands with the first non-terminal pane view,
not speculatively).

---

### Feature B4 — Switching mechanics

**Priority**: L2

**1. User outcome.** Switching workspaces is instant and lossless: every
shell keeps running, scrollback is exactly where it was, and keyboard focus
lands back in the pane the user was working in — switching away and back is
indistinguishable from never leaving.

**2. Trigger.** Any switch action from B2 (chip click, ⌘1–9, ⌘[/⌘]), plus the
implicit activations from creating a workspace and from closing the active
one.

**3. Inputs.** Target workspace id; the target's `focusedPaneId` and
`maximizedPaneId`.

**4. Outputs / side effects.** `activeWorkspaceId` updated; exactly one
workspace visible; keyboard focus inside its focused pane's terminal.

**5. States.** Each workspace is either *active* (visible) or *dormant*
(hidden). **All workspaces stay mounted at all times**: every workspace
renders permanently into the DOM, and the root element of each toggles
between visible and hidden display — the current build's exact keep-mounted
pattern, now mandatory at the workspace level. Unmounting a dormant workspace
is forbidden: a remounted terminal component is a dead shell, because the
terminal's mount lifecycle owns its PTY.

**6. Transitions.** On activation, in order:
1. The target workspace's root becomes visible; the previous one becomes hidden. The swap is instant — no transition animation in v1.
2. Every terminal in the activated workspace re-fits (via the fit addon, in a requestAnimationFrame) so panes match the current window size. Resize events that arrived while the workspace was hidden are deliberately not processed at arrival time — fitting against a hidden, zero-sized container produces garbage — so activation is the single reconciliation point.
3. On a workspace's *first ever* activation, the even splitter redistribution fires once (existing behavior); subsequent activations never reset splitters, so user-dragged ratios survive switching.
4. Keyboard focus moves to the workspace's `focusedPaneId` terminal — the same focus mechanism a newly created pane uses. Focus is per-workspace state: switching A → B → A restores A's focused pane, not B's.
5. If the workspace has a `maximizedPaneId`, its spotlight is simply revealed with the workspace. Maximize state survives switches and is never cleared by switching.

PTY data keeps flowing to dormant workspaces: output, OSC 7 cwd reports
(which may retitle an auto-named dormant chip, per B1), title changes, and
PTY exits are all applied to dormant panes' state and scrollback in real
time, so a workspace is fully current the moment it is revealed.

**7. Errors.** A dangling `focusedPaneId` (referencing a pane that no longer
exists) falls back to the workspace's most-recently-created pane — the same
max-numeric-suffix rule the close-pane path uses — and the field is repaired
to that pane. A dangling `maximizedPaneId` is repaired the same way but to
`null` (no spotlight): the workspace renders its normal grid and the repaired
value persists with the next save. A PTY that exits while its workspace is
dormant shows its exit state when the workspace is revisited; it does not
force a switch or any notification.

**8. Boundaries.** Memory scales with the total pane count across ALL
workspaces — every dormant workspace keeps live PTYs and xterm buffers. This
is the accepted cost of instant, lossless switching; v1 imposes no pane or
workspace cap and no hibernation of dormant workspaces. Switch latency
budget: the display swap plus re-fit must complete within one frame plus one
rAF; nothing else may run on the switch path.

**9. Out of scope.** Switch transition animations (crossfades, slides) —
explicitly none in v1; if the design language later adds one it must not
remount terminal components. Dormant-workspace hibernation or PTY suspension.
Per-workspace window bounds. Background-activity badges on dormant chips (a
legacy feature, not ported).

---

# Chapter C — Utility rail & settings

---

### Feature C1 — Right utility rail

**Priority**: L2

**1. User outcome.** A slim, always-available dock on the right edge of the
window gives one-click access to launching a new terminal pane and to app
settings, without consuming meaningful terminal space and without ever
interfering with pane dragging or the maximize spotlight.

**2. Trigger.** Present whenever the app window is open and the
sidebar-visibility flag is true (the default). Hidden/shown via **View menu →
"Hide Sidebar" / "Show Sidebar"**. No keyboard shortcut in v1 — shortcuts for
chrome toggles are decided later together with the still-missing
pane-focus-navigation keys.

**3. Inputs.**
- The persisted `sidebarVisible` boolean (optional root field of the v2 schema, B3).
- The app's pane-drag-active flag (the drag-in-flight state of the pane drag system, D2).
- The active workspace's `maximizedPaneId` (drives the spotlight inset math, D3).

**4. Outputs / side effects.**
- A rendered chrome column, 56px wide, holding exactly two items in v1.
- Layout effect on the pane grid: width = window width − 56px when visible, full width when hidden (formulas in A3).
- Reads/writes exactly one persisted field: `sidebarVisible` (B3). Nothing else is persisted by the rail itself.

**5. States.**

**Geometry and surface (fixed, not user-resizable):**

| Property | Value | Why |
|---|---|---|
| Width | 56px fixed | fits a 20px icon over an 11px label with a ≥44px hit target |
| Vertical span | from the 44px titlebar's bottom edge to the window bottom | the titlebar keeps full window width as the drag/glass surface |
| Surface | glass-1 (A1) with a 1px left hairline at `--separator`; collapses to `--surface-solid` under reduced transparency / Opaque mode like all glass-1 chrome | the window ships with vibrancy (A2), so the rail joins the persistent-chrome material; if a full pane grid cannot hold frame rate, the sanctioned fallback is the same as pane headers (D1): keep fill + rim + hairline, drop the backdrop blur |
| Item layout | "terminal" launcher at top (8px inset), "settings" gear pinned at bottom (8px inset), flexible empty stretch between | the top/bottom split separates launchers from settings |
| Overflow | none in v1 | two items need under ~200px of height; degradation ladders are not ported until the item count outgrows a ~600px-tall window |

**Per-item visual states** (consuming A1's standard micro-interactions):

| State | Treatment | Motion |
|---|---|---|
| Idle | 20px icon at `--text-secondary`; 11px lowercase label at `--text-tertiary` (11px is the chrome-text floor); icon+label centered; hit area = full 56px rail width per item | — |
| Hover | rounded inner pill, inset 4px from rail edges, radius `--radius-sm`; A1 standard hover fill and border-lighten; icon and label rise to `--text-primary`. No accent glow — rail items are secondary actions | A1 standard: in 130ms, out 250ms |
| Pressed | A1 standard press (scale 0.97); fill deepens to `rgba(255,255,255,0.10)` | press on `motion-instant`; release on `motion-snappy` |
| Focus-visible | A1 focus ring, accent = the active workspace accent | animates in over 150ms; never removed |
| Disabled (reserved) | 40% opacity on icon and label, no hover/press response, default cursor. **Unused in v1** — the launcher has no cap to hit (columns cap at 5 but vertical stacking continues) and settings is always available | — |
| Inert during pane drag | pointer interaction fully ignored (no hover, no click, not a drop target) but **visually idle** — no dim, no disabled look | — |
| Hidden | rail removed from the flex row; pane grid expands to full width | grid resizes in place; see Transitions |
| Reduced motion | all scale animations replaced by 150ms opacity fades | — |

**Keyboard & tooltips:** both items are real buttons in the tab order;
Enter/Space activates. Tooltips use the **native title attribute** in v1
(zero new code; a styled glass tooltip arrives only when a shared tooltip
component exists for the rest of the chrome): "New terminal (⌘N)" on the
launcher, "Settings" on the gear.

**6. Transitions.**
- **Show/hide toggle:** flipping the View-menu item resizes the pane-grid flex area in place. If the settings popover is open when the rail is hidden, the popover closes first — it is anchored to the gear and dies with its anchor (C3's dismissal list) — then the grid resizes. The grid and terminal components **must not remount** — a remounted terminal is a dead shell (INV-8/INV-10). All visible terminals re-fit after the resize. The boolean persists as the optional `sidebarVisible` root field of the v2 schema (B3), defaulting to visible; its absence never triggers migration or rejection.
- **Item state changes:** per the motion column above; no layout-affecting animation ever runs on the rail itself.

**7. Errors.** None — the rail is pure chrome with no I/O. If the visibility
field is absent or non-boolean in `state.json`, it is treated as `true`
(visible); it never causes hydration to reject the file.

**8. Boundaries.**
- **HARD CONSTRAINT — the rail is a flex SIBLING of the pane-grid area, never a descendant of any element carrying a `filter`, `transform`, or `backdrop-filter`, and never nested inside the pane-grid container.** This keeps the rail clear of the pane grid's clean-ancestry invariant (INV-14) and out of every drag/spotlight overlay's ancestry. The containing-block trap that motivates this is documented in D3. Reviewers should reject any implementation that nests the rail inside the pane-grid container.
- **Maximize spotlight excludes the rail.** The spotlight scrim covers the *workspace region only*: below the titlebar, from the window's left edge to the rail's left edge. The maximized pane's right inset is measured from the rail's left edge — 88px from the window edge while the rail is visible, 32px when hidden (full geometry in D3). The rail keeps normal styling and stays interactive beside the scrim.
- **Pane drags ignore the rail.** The rail is pointer-inert for the drag's duration; releasing a dragged pane over the rail cancels the move: the pane snaps back, no layout change.
- **Z-order:** the rail lives on the base plane as a sibling of the pane grid. All overlays live in the single body-level portal (D3's layer table: scrim 800 → spotlight 810 → drag ghost 1000 → settings popover 1050 → toast 1100). The settings popover closes on drag start (C3), so popover-versus-drag-layer stacking never arises.
- **Deviation from the legacy reference, stated explicitly:** the legacy rail carried terminal, files, and web entries. **v1 ships the terminal launcher only; "files" and "web" are DEFERRED.** Reason: this app's pane model is terminal-only — every pane renders a terminal and the persisted shape carries no pane-type field — so files and web are not rail entries but entire new *pane view types*, each costing a persisted pane-type field (schema bump + migration), a view-component registry, per-type header chrome and drag-ghost glyphs, focus semantics for non-PTY panes, and the content surface itself (a directory browser; an embedded web view plus a real security review). Realistic estimate 1–2+ days each versus under half a day for the entire rail. When they land, they slot into this same rail with the same click semantics as C2.

**9. Out of scope.**
- "sysinfo" — excluded entirely, not deferred: nothing in this app calls for it.
- Any config-driven widget system (user-defined launchers, ordering keys, per-workspace scoping, a rail context menu, custom command launchers). The two v1 items are hardcoded. Custom command launchers are the most attractive future revival, but they depend on the settings story (C3) maturing first.
- Per-workspace rail visibility — visibility is a single global flag (B1/B3); per-workspace scoping is deferred.
- Overflow degradation modes; rail resizing.

---

### Feature C2 — Terminal launcher click behavior

**Priority**: L2

**1. User outcome.** Clicking the rail's "terminal" item adds a new terminal
pane to the active workspace exactly as ⌘N does — same placement, same focus,
same persistence — so users learn one mental model regardless of input
method.

**2. Trigger.** Pointer click, or Enter/Space while the launcher button has
keyboard focus.

**3. Inputs.** The active workspace's column layout (column count, per-column
pane counts), its `maximizedPaneId`, the drag-active flag. Nothing else.

**4. Outputs / side effects.** One new terminal pane: focused, maximize
cleared, persisted through the existing debounced state save. No new IPC, no
new state fields.

**5. States.**

| Situation | Behavior |
|---|---|
| Under 5 columns | the new pane becomes a new rightmost column |
| At the 5-column cap | the pane appends to the column with the fewest panes; ties broken rightmost |
| Any add | the new pane takes focus; any maximize is cleared; user-dragged splitter ratios survive (adding never triggers an even-redistribution reset) |
| Rapid clicks | honored 1:1 — each click creates one pane, identical to mashing ⌘N. No debounce, no busy state |
| While a pane is maximized | allowed, and identical to pressing ⌘N during maximize today: the add-pane path already nulls the maximized-pane id, so the spotlight collapses, the pane is added to the grid behind, and the user lands focused in the new pane. **No special case is written** |
| During a pane drag | inert per C1 — the click never fires |

**6. Transitions.** The new pane appears via the existing add-pane code path
with its existing (non-animated in v1) layout insertion; the focus ring moves
to the new pane immediately.

**7. Errors.** None introduced. PTY spawn failure is handled by the existing
pane lifecycle exactly as it is for ⌘N — this feature adds no new failure
mode and no new error UI.

**8. Boundaries.**
- **One code path.** The rail button must invoke the *same handler* as the ⌘N menu route (the menu→IPC→renderer fan-in in `electron/main.ts` and the renderer's add-pane function), with zero divergence — not a parallel reimplementation. Acceptance check: any future change to ⌘N placement rules changes the rail click identically, for free.
- The launcher creates panes only in the **active workspace**; it never creates workspaces or windows.

**9. Out of scope.** Launching anything other than a terminal (see C1's
deferral list); launch-maximized behavior; modifier-click variants (e.g.
shift-click for split-below) — none exist in v1.

---

### Feature C3 — Settings (gear, popover, settings.json)

**Priority**: L3

**1. User outcome.** Clicking the gear gives the user a small, native-feeling
popover to adjust the few settings that matter (terminal font size/family,
default shell) with instant effect, plus an escape hatch to the raw config
file — without a settings *pane*, a modal, or any interruption to running
terminals.

**2. Trigger.**
- Gear click (or Enter/Space on the focused gear) **toggles** the popover: opens if closed, closes if open.
- While a pane is maximized: opens above the spotlight (see Boundaries).
- During a pane drag: inert per C1.

**3. Inputs.**
- `settings.json` — a **new file, separate from `state.json`**, in the app's userData directory. Separation rationale: a corrupt layout file must never block settings, and vice versa.
- File shape (all fields optional; defaults mirror today's hardcoded values):

| Field | Type | Default | Applies |
|---|---|---|---|
| font family | string | the current ui-monospace stack | live, all terminals |
| font size | number, clamped 10–18 | 13 | live, all terminals |
| line height | number | current hardcoded value | live, all terminals |
| default accent | string (one of the 7 workspace-accent hexes, A1) | blue `#429DFF` | next launch — seeds the first workspace of a fresh default state and sets the scan-start of B1's assignment rotation for workspaces created from then on; workspaces with a persisted `accentHue` are never retinted |
| shell | string (absolute path) | `$SHELL`, falling back to `/bin/zsh` | new panes only |

**4. Outputs / side effects.**
- The anchored popover (presentation below).
- Three **new IPC operations**: load settings, save settings, open-settings-file-in-default-editor. (The renderer has no Node access; all file I/O lives in the main process, consistent with the existing IPC surface.)
- Writes to `settings.json`: immediate (not debounced — settings changes are low-frequency) and atomic via the same temp-file-then-rename pattern `state.json` uses.

**5. States.**

**Popover presentation:** anchored to the gear, opening up-and-left from the
bottom-right corner; ~280px wide; **glass-2 material (A1)** with radius
`--radius-lg` and `--shadow-3`; collapses to `--surface-solid` with borders
kept under reduced transparency / Opaque mode, per A1. It is a **popover, not
a modal**: no scrim, terminals keep running visibly behind it. Because it
floats over the rail and terminal content (real painted pixels), it complies
with A2's CSS-blur placement rule.

**Popover contents (deliberately small, top to bottom):**
1. "Settings" title row with the app version.
2. Terminal font-size stepper (10–18, default 13).
3. Font-family text field.
4. Default-shell text field, with the inline note **"applies to new panes"**.
5. Footer button **"Edit config file…"** — creates `settings.json` with defaults if missing, then opens it in the OS default editor via the open-in-editor IPC.

Nothing else: no theme switcher UI (the default-accent field is
file-edit-only in v1 via the escape hatch), no keybinding UI, no opacity
slider (deferred past v1 by A1's decisions).

**Dismissal:** Esc, outside click, gear re-click, any pane drag starting, or
the rail being hidden (View → Hide Sidebar, C1) while the popover is open —
removing the anchor closes the popover in the same frame; it never persists
floating anchorless. Dismissal never discards anything — every change was
already committed (see Transitions).

**6. Transitions.**
- **Commit model:** each control commits on interaction (stepper click; text field on Enter or blur). Commit = save to `settings.json` + apply per the rules below. There is no Save/Cancel button.
- **Live-apply, font size/family/line-height:** applies immediately to **all live terminals by mutating the terminal instance's options and re-fitting in place — never by remounting.** A remounted terminal is a dead shell; this is a correctness rule, not a preference. The mutation happens where the xterm instances live (`src/Terminal.tsx` owns the options today; its hardcoded font constants are replaced by the loaded settings).
- **Shell:** applies to **future panes only**; existing PTYs are untouched. Stated inline in the popover.
- **Default accent:** read at launch only in v1; no live re-theming machinery ships with this feature.
- Popover open/close animates on `motion-instant` (a 120–150ms fade + slight rise); reduced motion collapses it to an opacity fade.

**7. Errors.**
- **Missing `settings.json`:** silently use defaults. The file is created only when the user first commits a change or presses "Edit config file…" — never speculatively at launch.
- **Corrupt/unparseable `settings.json`:** use defaults in memory, never block startup, and leave the corrupt file untouched on disk until the user's next commit overwrites it (the escape-hatch button opens the corrupt file as-is so the user can repair it by hand).
- **Out-of-range values** (e.g. font size 7 or 40): clamped to the documented range on load, not rejected.
- **Invalid shell path:** not validated by the popover; a bad shell fails at the next pane spawn through the existing PTY error path. The popover is not a validator.
- **Open-in-editor failure** (no default editor association): the main process falls back to revealing the file in Finder.

**8. Boundaries.**
- The popover is **pure chrome**: it touches no pane-model code and introduces no new pane view type. This is deliberate — the alternative (a settings-file *editor pane*) would itself be the first non-terminal pane view type, contradicting C1's files/web deferral and dragging text-editing scope into v1.
- `settings.json` and `state.json` never share a file or a write path; layout corruption cannot take settings down, and vice versa.
- While maximized, the popover renders above the spotlight (z 1050, layer table in D3) and the gear remains interactive beside the scrim.
- Settings are global (per-app), not per-workspace and not per-pane, in v1.

**9. Out of scope.**
- Theme switching UI, keybinding editor, terminal-opacity slider, per-profile settings, settings search, import/export.
- Live file-watching of `settings.json` (external edits apply at next launch; the popover is the live path).
- Extra gear-menu entries (tips, release notes, help) — none exist in this app.

---

# Chapter D — Component re-skin & regression invariants

This chapter re-skins the four interactive surfaces that already exist in the
target repo — pane chrome, pane drag, maximize spotlight, toasts/quit-confirm
— plus the binding list of behaviors that must survive the redesign
unchanged. Accent everywhere in this chapter means **the active workspace's
accent hue** (A1). The prime directive: **every visual property may change;
no behavior may change** except where a decision below explicitly says so
(each such change is listed in the decision register at the end of this
spec).

---

### Feature D1 — Pane chrome re-skin

**Priority**: L2

**1. User outcome.** Each terminal pane reads as a rounded glass-edged card
on the dark window canvas: a slim glass header with a directory-name title
and two quiet icon buttons, a terminal surface with subtle ambient depth, and
an unmistakable accent ring on exactly one pane — the focused one. Terminal
text stays razor-sharp at all times.

**2. Trigger.** Always-on. Applies to every pane in every workspace from
first paint.

**3. Inputs.**
- Pane focus state (`focusedPaneId` of the active workspace).
- The pane's tracked cwd (the existing per-pane cwd map fed by OSC 7).
- The pane's OSC 0/2 title and the preload host info (title fallbacks).
- Active workspace accent hue.
- `prefers-reduced-transparency` / Opaque mode (A1 fallback rules).

**4. Outputs / side effects.**

**Pane container**

| Property | Value |
|---|---|
| Corner radius | `--radius-md` |
| Background | `--bg-terminal` at **0.92** alpha (fixed; no slider in v1) |
| Unfocused border | 1px `--separator` |
| Gutters between panes | window canvas (`--bg-root` over vibrancy) shows through |
| Shadow | none at rest (cards sit flush; elevation is reserved for ghost/spotlight) |

**Focus treatment (decided).** The focused pane gets the A1 focus-ring recipe
rendered **inward**, because the split-layout containers clip outside
shadows: a 1px solid accent border at 100% opacity on the container, plus a
2px inner ring at `rgba(accent, 0.35)` immediately inside it (≈3px total
visual weight — the token's geometry, folded inside the clip). Ring fades in
over 150ms, out over 250ms. No glow beyond the ring; accent is never used as
a fill tint on the pane.

**Header (28px, glass-1)**

| Element | Spec |
|---|---|
| Strip | 28px tall, glass-1 (A1) with a 1px bottom hairline at `--separator` |
| Corners | top corners follow the pane's `--radius-md`; bottom corners 0 (concentric rule) |
| Leading icon | 14×14 terminal glyph (prompt-in-rounded-square), `--text-tertiary` |
| Title | **basename of the pane's tracked cwd**; fallback chain: cwd basename → OSC 0/2 title → `user@host`. SF Pro Text 12px / 500, tail-ellipsized. Focused pane: `--text-primary`; unfocused: `--text-secondary` |
| Maximize button | 22×22 hit target, diagonal-arrows expand/contract glyphs, tooltips and aria-labels kept |
| Close button | 22×22 hit target, ×-stroke glyph, tooltip/aria-label kept |
| Button styling | glyph at 70% opacity → 100% on hover over 130ms; A1 standard hover fill, radius `--radius-xs` |
| Drag handle | entire header (minus buttons) keeps grab cursor; mouse-down focuses the pane |

**xterm theme remap** (replaces the inherited dark theme; these are
content-layer values specific to the terminal, not shared chrome tokens)

| Theme role | Value |
|---|---|
| background | `rgba(14, 14, 20, 0.92)` with `allowTransparency: true` |
| foreground | `--text-primary`, always 100% opacity — never vibrant, never blended |
| cursor | workspace accent (one of the four sanctioned accent elements) |
| cursor accent (text under block cursor) | `#0E0E14` |
| selection | `rgba(236,236,241,0.18)` — neutral; selection is NOT accent-tinted |
| ANSI 16 | retain the current ramp, then audit each of the 8 normal colors against `--bg-terminal`; lighten any entry below 4.5:1 contrast one step. Bright variants unchanged |
| Renderer | enable the WebGL addon already in `package.json` (canonical triple: WebGL + allowTransparency + 0.92 background); automatic DOM fallback on context loss is the accepted degradation path |

Opaque mode / reduced transparency: terminal snaps to solid `#0E0E14`,
header to `--surface-solid` with borders kept (A1 owns the toggle; D1
surfaces must honor it).

**5. States.**
1. Focused — accent border + inner ring, header title at `--text-primary`, header fill unchanged (focus is communicated by the ring, not a header tint).
2. Unfocused — 1px separator border, secondary title.
3. Hover on header buttons — 130ms glyph + fill fade-in, 250ms fade-out.
4. Drag-source / drop-target — owned by D2; D1 styles are suppressed or overlaid as D2 specifies.
5. Maximized — owned by D3; container radius and shadow change there.
6. Opaque mode — solid fallbacks above.

**6. Transitions.** Focus ring in 150ms / out 250ms (`motion-instant`
family). Header hover 130ms in / 250ms out. No other animated properties;
pane geometry changes remain instant (the split layout owns them).

**7. Errors.**
- cwd never reported (shell without the OSC 7 hook): title stays on the fallback chain; no blank titles.
- WebGL context lost: addon falls back to DOM rendering; the 0.92 alpha stays (the DOM renderer supports it; cost noted in Boundaries). If glyphs render visibly thin on WebGL + transparency, the sanctioned remedy is raising terminal alpha toward 0.95 — never abandoning WebGL, never dimming text.
- Contrast audit failure in an ANSI color: lighten that entry; never lower the background alpha below 0.92 to compensate.

**8. Boundaries.**
- The terminal buffer is content: **no backdrop-filter ever touches the terminal viewport**. Its translucency comes free from the compositor via the window vibrancy layer.
- Header glass budget: headers sit over the pane's own mostly-static surface, so blur cost is low; still, the implementation must verify a full 5-column grid of live terminals holds frame rate. If it does not, the single sanctioned fallback is headers keeping the glass-1 fill + rim + hairline but dropping the backdrop blur. No other degradation path is permitted.
- Terminal font stays 13px mono by default; font settings ship via Feature C3's live-apply path, which mutates options in place and never remounts.
- The header remains the only drag handle; the terminal area never initiates pane drags.
- While a pane is maximized (D3 spotlight), its header is NOT a drag handle: pane drags can only start from grid panes. To move a spotlighted pane the user un-maximizes first; the drag affordance (cursor, drag start) is simply absent on the spotlight pane's header.

**9. Out of scope.** Per-pane gear/settings button (legacy had one; not
ported). Per-pane opacity controls. Pane background images. Header context
menus.

---

### Feature D2 — Drag re-skin

**Priority**: L2

**1. User outcome.** Lifting a pane feels physical: the source pane frosts
over as if the pane was peeled off it, a small glass ghost with real depth
follows the cursor on a spring, and the candidate drop half of the hovered
pane washes in the workspace accent. Everything else on screen stays bright
and readable — no more full-workspace blackout.

**2. Trigger.** Drag starts on a pane header (existing react-dnd flow). Ends
on drop, drop-on-self, or cancel (release outside any target / Escape).

**3. Inputs.**
- Drag source pane id and title; hovered target pane and quadrant (left/right/top/bottom half — existing hit-test).
- Column count (5-column cap governs left/right drop semantics — unchanged).
- Workspace accent hue. `prefers-reduced-motion`.

**4. Outputs / side effects.**

**Mini ghost pane** (replaces the current flat ghost, keeps its structure)

| Property | Value |
|---|---|
| Size / tilt | 280×180, static −1.5° tilt (kept) |
| Material | glass-2 (A1) |
| Shadow / radius | `--shadow-3`; radius `--radius-md` (reads as a miniature pane) |
| Content | mini header (terminal glyph + ellipsized title) + one fake prompt line with a blinking block cursor in the workspace accent |
| Layer | body-level overlay layer (D3 layer table), above everything except the settings popover and toasts |

**Source pane treatment (decided — replaces the global workspace dim).** A
frost overlay covers the source pane only (header included): backdrop blur
16px + flat fill `rgba(236,236,241,0.06)`. The focus ring is suppressed for
the duration of the drag. The rest of the workspace, the top bar, and the
rail keep their idle styling — the global brightness/saturate filter over the
workspace area is **deleted**, and with it the counter-brightening hack on
the drop indicator. (This also removes the second containing-block bite —
see D3.)

**Drop-zone hint (decided — accent wash replaces both the legacy green and
the current dashed blue).** The hovered half of the target pane is covered by
a flat wash: fill `rgba(accent, 0.15)` + 1px border `rgba(accent, 0.60)`,
radius 8px, no dash pattern. Moving between halves animates position/size
over 130ms (`motion-instant`).

**Motion**

| Phase | Token | Behavior |
|---|---|---|
| Lift | `motion-instant` | ghost fades/scales in (0.97→1.0, opacity to 0.85→1 over 130ms); frost overlay fades in 130ms |
| Follow | `motion-interactive` | ~1-frame spring lag reads as mass |
| Drop | `motion-snappy` | ghost fades out 150ms while the grid re-renders the pane in its new slot; the landed pane's focus ring fades in (it takes focus, existing rule) |
| Cancel / self-drop | `motion-smooth` | ghost and frost fade out 150ms; zero layout change |

`prefers-reduced-motion`: all springs and fades collapse to 150ms opacity
fades; the ghost tracks the cursor 1:1 with no spring lag.

**5. States.**
1. Idle — no drag artifacts mounted.
2. Lifting — ghost + frost fading in.
3. In flight, no target — ghost only; no wash anywhere.
4. In flight, over a target half — wash on exactly one half of exactly one pane.
5. Over self — no wash (self-drop is a no-op, unchanged).
6. Settling — ghost fading, layout committed, moved pane focused, maximize cleared (unchanged).

**6. Transitions.** Per the motion table. Wash relocation between
halves/targets uses `motion-instant` position transitions; wash
appearance/disappearance is a 130ms fade.

**7. Errors.**
- Drop at the 5-column cap with a left/right quadrant: falls back to top/bottom insert in the target column — behavior unchanged; the wash must show the half that will actually be used (top/bottom), never a left/right wash that lies.
- Drag interrupted by window blur or Escape: treated as cancel; all overlays unmount; no state mutation.
- File drag (native files) entering the same drop targets: keeps the existing accept path (INV-5); its hover tint re-skins to the same `rgba(accent, 0.15)` wash over the full pane.

**8. Boundaries.**
- No filter of any kind is applied to any ancestor of the pane grid during drag (hard rule; enforced by INV-14).
- The frost overlay backdrop-blurs one pane at most, transiently — this is the entire drag-time blur budget.
- No fly-to-slot animation of the ghost into the landed pane in v1; drop is fade-out + instant re-layout.
- Workspace-chip reorder (HTML5 DnD in the top bar, B2) is a separate system and is untouched by this feature.

**9. Out of scope.** Live content thumbnail in the ghost (it stays a symbolic
mini pane). Cross-workspace pane drags. Drag-out-to-new-window. Spring-loaded
workspace switching while dragging.

---

### Feature D3 — Maximize spotlight re-skin (body-level portal)

**Priority**: L2

**1. User outcome.** Maximizing a pane lifts it into a floating spotlight:
the workspace recedes behind a deep glass scrim, the pane floats with real
elevation and generous margins, and — critically — this works every time,
regardless of what filters or transforms exist anywhere in the layout tree.

**2. Trigger.** Header maximize button toggles. Auto-clears when panes are
added, moved, or closed (unchanged). One maximized pane per workspace,
persisted in state (unchanged).

**3. Inputs.** `maximizedPaneId` of the active workspace; window dimensions;
the 44px top-bar height; rail visibility (C1); `prefers-reduced-motion` /
reduced transparency.

**4. Outputs / side effects.**

**The containing-block trap (documented; this is why the portal is
mandatory).** `position: fixed` positions an element relative to the viewport
*unless* any ancestor carries a `transform`, `filter`, or `backdrop-filter` —
that ancestor silently becomes the containing block and the "fixed" element
is trapped inside it. This has bitten this app **twice**: once via the
split-layout library's transform on its containers (patched with a CSS
override), and once via the drag-time dim filter on the workspace area, which
re-trapped a maximized pane during drags. A glass redesign multiplies
ancestors with exactly these properties, so the fix-by-exception approach is
dead. **Decision: the spotlight renders through a portal whose host element
is a direct child of `document.body`, outside the React app root's layout
tree.** No ancestor effects can ever capture it. The CSS override for the
layout library's transform is deleted once the portal lands.

**No-remount requirement.** A remounted terminal component kills its shell
(mount spawns a PTY, cleanup kills it — INV-8/INV-13). Toggling maximize must
therefore never change the React identity of the pane's terminal.
Implementation rule: each pane's terminal renders exactly once into a stable
per-pane host element keyed by pane id; the grid cell and the spotlight frame
are dumb slots that adopt that host element. Acceptance test: toggle maximize
10× — same shell process, scrollback intact, zero PTY spawn/kill events.
xterm refits via rAF on each toggle (unchanged); if adopting the host element
drops the WebGL context, the addon's DOM fallback engages and a refit +
repaint must be verified.

**Visuals**

| Layer | Spec |
|---|---|
| Scrim | glass-3 scrim (A1), covering the **workspace region only**: from y = 44px (below the top bar) to the window bottom, from the window's left edge to the rail's left edge when the rail is visible (full width when hidden). The rail keeps normal styling and stays interactive beside it (C1) |
| Spotlight pane | margins 72px top / 32px left+bottom; right inset 32px measured from the rail's left edge (88px from the window edge while the rail is visible, 32px when hidden); radius `--radius-lg`; 1px border `rgba(255,255,255,0.14)`; `--shadow-4` |
| Pane interior | exactly the D1 pane (header + terminal at 0.92); no extra material — the pane itself is content framed by chrome, never glass-on-glass |
| Layer order (body portal children, back to front) | scrim z 800 → spotlight pane z 810 → drag-ghost layer z 1000 → settings popover z 1050 → toast layer z 1100 |

Reduced transparency: scrim becomes flat `rgba(8,8,12,0.78)` with no blur;
pane fallbacks per D1.

**5. States.**
1. Restored — pane in grid, portal frame empty, scrim unmounted.
2. Maximized — scrim up, pane in spotlight frame, grid interaction blocked by the scrim.
3. Toggling — entrance/exit animation in flight (input to the terminal is live throughout; the PTY never pauses).

**6. Transitions.** Entrance: scrim fades in 150ms (`motion-instant`); pane
scales 0.98→1 with `motion-snappy`. Exit: reverse, scrim 250ms fade.
`prefers-reduced-motion`: both directions are plain 150ms fades, no scale.

**7. Errors.**
- Maximize toggled while a drag is in flight: the drag is cancelled first (drag overlays unmount), then the toggle applies.
- Pane closed while maximized (⌘W): maximize clears, then the normal close cascade runs (unchanged).
- Window resized while maximized: margins are recomputed from the live window size; terminal refits.

**8. Boundaries.**
- The scrim is **inert** in v1: clicking it does not restore (matches today — only the header button toggles).
- The scrim never covers the 44px top bar; workspace switching while maximized remains possible and shows the new workspace un-maximized or with its own persisted maximize, per its own state (unchanged, B4).
- Only one body-level portal host exists for all of D2/D3/D4's and C3's overlay layers; it is created once at startup and never unmounted.

**9. Out of scope.** Full-bleed maximize mode. Maximize animations that morph
from the grid cell's exact position (the spring scale is centered, not
FLIP-from-cell, in v1). Per-pane zoom levels.

---

### Feature D4 — Toasts & quit confirm (⌘Q double-press) on glass-2

**Priority**: L3

**1. User outcome.** Transient messages float in a small glass capsule at the
bottom center of the window — most importantly the quit guard: the first ⌘Q
never kills work; it asks, quietly and legibly, for a second ⌘Q.

**2. Trigger.** First ⌘Q press arms the confirm (existing main-process
interception). Future toasts (none other exist in v1) reuse the same surface.

**3. Inputs.** The quit-prompt broadcast from the main process; the 2000ms
confirmation window; `prefers-reduced-motion` / reduced transparency.

**4. Outputs / side effects.**

| Property | Value |
|---|---|
| Surface | glass-2 (A1) |
| Shadow / radius | `--shadow-3`; radius `--radius-lg` |
| Geometry | bottom-center, 24px above the window bottom edge; padding 10px 16px; single line |
| Type | SF Pro Text 13px / 400, `--text-primary`; the toast text stays the current quit-prompt copy |
| Grain | none (noise grain is skipped on small controls) |
| Layer | toast layer z 1100 (D3 layer table) — above the spotlight scrim, so the prompt is visible even while maximized (transient 2s glass-2-over-glass-3 overlap is accepted within the 3-level cap) |

Behavior is byte-for-byte today's: first ⌘Q cancels quit in the main process,
arms 2000ms, broadcasts the prompt; the toast auto-dismisses when the window
expires; a second ⌘Q inside the window kills all PTYs and quits. Reduced
transparency: toast collapses to `--surface-solid` with border kept.

**5. States.**
1. Hidden. 2. Visible/armed (2000ms). 3. Dismissing (fade-out). Re-arming
while visible restarts the 2000ms window without replaying the entrance.

**6. Transitions.** Enter: 8px upward slide + fade over `motion-snappy`.
Exit: 250ms fade (`motion-instant` out-curve). Reduced motion: fades only, no
slide.

**7. Errors.**
- Quit confirmed while a drag or maximize is active: quit proceeds; no teardown animation is required.
- Multiple windows: out of scope in v1 (single window — see anti-features); the broadcast plumbing remains in place untouched.

**8. Boundaries.** One toast at a time; a new toast replaces the current one.
Toasts never capture pointer events (click-through). No action buttons, no
close ×, no stacking in v1.

**9. Out of scope.** A general notification system, toast queueing,
persistent banners, update notices (the top bar's right spacer owns any
future update affordance, per A3).

---

### Feature D5 — Regression invariants (MUST NOT change)

**Priority**: L1 (gate)

**1. User outcome.** After the entire re-skin ships, a user who knew
yesterday's Mandeck loses nothing: every shortcut, every cascade, every
persistence guarantee, and every terminal behavior works identically. The
redesign is falsifiable against this list.

**2. Trigger.** Checked on every redesign PR (code review gate) and
re-checked once on the final packaged build via the manual checklist below.

**3. Inputs.** The current behavior at git head `7d102e0` of
`/Users/sonpiaz/mandeck` (the audited baseline), as amended only by decisions
explicitly registered in this spec.

**4. Outputs / side effects.** The numbered invariant checklist. Each item is
a behavior that must hold, byte-for-byte, in the shipped redesign.

**INV-1 — Full shortcut table.** Every binding below works exactly as
described:

| Shortcut | Behavior |
|---|---|
| ⌘N / ⌘D | New pane in current workspace (identical aliases) |
| ⌘T | New workspace (one pane, focused, becomes active) |
| ⌘W | Close focused pane; cascade pane → workspace → window |
| ⌘⇧W | Close current workspace |
| ⌘[ / ⌘] | Previous / next workspace, with wraparound |
| ⌘1..⌘9 | Jump to workspace N (renderer keydown listener, as today) |
| ⌘Q ⌘Q | Double-press quit confirm (2000ms window) |
| ⌘C / ⌘V / ⌘A | Stock edit-menu roles keep working in the terminal |

⌘⇧N (New Window) is **intentionally removed** per the workspace-model
decision (single-window v1, B3); its absence is not a regression. No other
binding may move, change meaning, or gain a modifier.

**INV-2 — Pane add placement.** Under 5 columns, a new pane becomes a new
rightmost column; at 5 columns it appends to the column with the fewest
panes, tie broken rightmost. The new pane takes focus and clears any
maximize.

**INV-3 — Close cascade + redistribution.** Closing a pane drops an emptied
column (columns shift left); focus moves to the most-recently-created
surviving pane; an empty workspace cascades to workspace close; the last
workspace cascades to window close. Even redistribution (layout reset) fires
only on first workspace activation and on shrink — **adding a pane never
resets user-dragged splitter ratios**.

**INV-4 — Persistence debounce + atomic write.** State saves debounce at
400ms after any change; the main process writes via temp-file-then-rename
(atomic). Restore validates shape field-by-field and re-seeds id counters
from the max suffix across **all** workspaces. (The schema-migration and
fsync/backup hardening are B3's additions; they extend, never replace, this
write path.)

**INV-5 — File-drop staging + image flow.** Native file drops are accepted by
the same drop targets as pane drags (react-dnd file type). Dropped files are
staged into the space-free directory `~/.mandeck/drops/` under generated
names, the staged paths (shell-quoted when needed) are typed into the focused
pane's PTY, and a staged image path renders as `[Image #N]` inside Claude
Code. Staging failure falls back to the original path. The no-space path
constraint is load-bearing — never relocate staging under the default
userData path.

**INV-6 — OSC 7 cwd tracking.** The PTY child env keeps the terminal-program
variable trick that makes stock macOS zsh emit OSC 7 on every prompt with
zero shell-rc injection. The per-pane cwd map updates on every OSC 7,
persists, and on restore each fresh PTY spawns in its saved cwd. (D1's
basename title and the strip's auto-naming consume this map; they must not
alter how it is produced.)

**INV-7 — ⌘+click-only links.** The custom link provider regex-scans buffer
lines (including wrapped lines) for http(s) URLs; hover shows pointer; **a
plain click never opens a link** — activation requires ⌘+click (or
Ctrl+click); URLs open externally and are validated http/https-only in the
main process. The right-click context menu keeps Copy / Open URL / Paste
exactly as wired.

**INV-8 — StrictMode stays OFF.** The React root renders without StrictMode.
This is load-bearing: a terminal component's mount spawns a PTY and its
cleanup kills it; double-mount = dead shells. Any PR adding StrictMode is an
automatic reject.

**INV-9 — Stable keys for layout panes.** Columns key on their column id,
panes on their pane id; ids are monotonic counters re-seeded on restore
across all workspaces. Reorders and moves preserve ids so terminal DOM nodes
survive. No index-based keys, ever.

**INV-10 — Inactive workspaces stay mounted.** Every workspace renders
permanently; only the active one is displayed (display toggle, never
unmount). PTYs and scrollback survive every switch; switching is instant.

**INV-11 — PTYs are runtime-only.** PTYs live in a main-process map and are
never persisted; restore spawns fresh login shells with the existing env
additions. PTY data/exit events route only to the owning window.

**INV-12 — Double-⌘Q semantics.** First press cancels quit and arms a 2000ms
window with the toast prompt; second press inside the window kills all PTYs
and quits. (D4 re-skins the toast; the timing and process flow are
untouched.)

**INV-13 — Maximize semantics.** One maximized pane per workspace; persisted;
toggled by the header button; auto-cleared on pane add/move/close; xterm
refits on toggle; the shell survives toggling (D3's no-remount acceptance
test).

**INV-14 — Clean pane-grid ancestry (new invariant, introduced by this
redesign).** No ancestor of the pane grid may ever carry `transform`,
`filter`, or `backdrop-filter`. The spotlight portal removes the need; this
invariant prevents the trap from returning through future styling.

**The 5-point manual packaged-build checklist.** Run once on the packaged
`.app` (not dev mode) before calling the redesign done:

| # | Action | Pass condition |
|---|---|---|
| M-1 | Drag a pane to another pane's edge and drop | ghost + frost + accent wash render; layout commits; moved pane focused; no console errors |
| M-2 | Press ⌘Q twice | first press shows the glass toast and does not quit; second press within 2s quits cleanly |
| M-3 | Quit, relaunch | workspaces, pane layout, titles, and each pane's working directory restore |
| M-4 | ⌘+click an http URL in terminal output | opens in the default browser; a plain click does nothing |
| M-5 | Drop an image file onto a pane running Claude Code | staged path is typed into the PTY and renders as `[Image #N]` |

**5. States.** Per-PR: pass/fail against INV-1..14 (reviewer checklist).
Pre-release: pass/fail against M-1..5 on the packaged build. A single failure
blocks merge/release respectively.

**6. Transitions.** The list is append-only during the redesign: a registered
decision may *add* an invariant (as INV-14 was added) but may never silently
delete one. Removing an invariant requires an explicit decision-register
entry.

**7. Errors.** If a re-skin change cannot satisfy an invariant (e.g., a
material choice forces a terminal remount), the visual change loses and is
redesigned — invariants outrank aesthetics, no exceptions.

**8. Boundaries.** The invariants bind Chapters A–D equally; this feature is
merely their registry. Performance regressions are governed by D1/D2
boundaries (frame-rate verification on a full grid), not by this checklist.

**9. Out of scope.** Automated end-to-end test infrastructure for these
invariants (manual + review gates suffice for v1; test tooling is a separate
future investment).

---

## Anti-features (global)

Explicitly **not** in this redesign, even though the legacy app contains
them. Building any of these is a spec violation, not an oversight:

1. **Files / web / sysinfo widgets** — the rail's non-terminal launchers stay dead ends per Chapter C; no widget panes of any kind.
2. **Embedded browser** — no webview pane, ever, in this app's v1.
3. **AI chat sidebar** — no AI panel, no AI toggle in the chrome; terminals running AI CLIs are the product.
4. **Backend daemon** — no separate server process; the architecture stays renderer + main process + PTYs.
5. **Tab pinning** — workspace chips have no pinned state.
6. **Per-workspace backgrounds** — workspace identity is carried by the accent hue only; no wallpapers, no background images, no per-workspace tint of the glass.
7. **Multi-window** — single-window v1; ⌘⇧N and its IPC are removed per B3; the multi-window return path is consciously deferred (per-window state files, namespaced ids) and nothing in this spec may pre-build for it.

## Decision register (all open questions, resolved)

Every open question raised during analysis, resolved here decisively. Where
two drafted sections disagreed, the winning ruling is recorded.

| # | Question | Resolution |
|---|---|---|
| R-1 | Second-level pane-tab strip? | No. One 44px row, workspace tabs only (A3, B ruling 2). |
| R-2 | Titlebar brand glyph / workspace-switcher button? | None in v1 — no saved-workspace layer exists, so chips carry all management (B ruling 1; A3's earlier logo-button sketch is superseded). |
| R-3 | Exact rail width? | 56px, fixed (A3/C1). |
| R-4 | Right-side bar controls? | None in v1; future affordances dock at the right spacer's left edge as no-drag islands (A3). |
| R-5 | Base palette: purpose-built vs inherited hexes? | Purpose-built family: `#0B0B10` / `#0E0E14` / `#16161C` (A1). |
| R-6 | Terminal background alpha, user slider? | Fixed 0.92; slider deferred past v1; Opaque mode is the escape hatch (A1/A2). |
| R-7 | One fixed accent vs per-workspace? | Per-workspace accent from the 7-hue palette, blue default; exactly four tinted elements; 8% fill cap (A1). |
| R-8 | Vibrancy material choice? | Under-window, shipped default; follow-window effect state (A2). |
| R-9 | Terminal renderer? | WebGL addon on, transparency allowed, background `rgba(14, 14, 20, 0.92)`; thin-glyph remedy is alpha toward 0.95, never WebGL removal (A2/D1). |
| R-10 | Accent on the active tab: neutral white fill vs accent fill? | Accent fill at 8% alpha (A3). |
| R-11 | Rail surface: solid or glass? | glass-1 — the window ships with vibrancy (A2), so the rail joins the persistent chrome material; solid `--surface-solid` is its reduced-transparency collapse, and dropping blur (keeping fill/rim/hairline) is its only performance fallback (C1; supersedes the earlier solid-rail draft premised on an opaque window). |
| R-12 | Settings popover material? | Real glass-2, active from v1 (C3; same supersession as R-11). |
| R-13 | Settings "theme accent" vs per-workspace accents? | The settings field is the **default accent**: at next launch it seeds the first workspace of a fresh default state and sets the scan-start of B1's assignment rotation; it never retints a persisted `accentHue` (C3). |
| R-14 | Rail visibility persistence? | One optional global `sidebarVisible` root field in the v2 schema, default true, absence tolerated (B3/C1); per-workspace scoping deferred. |
| R-15 | Focused-pane treatment | 1px solid accent border + 2px inner ring at `rgba(accent, 0.35)`, rendered inward to avoid split-container clipping; 150ms in / 250ms out (D1). |
| R-16 | Global drag dim vs source-pane treatment | Source-pane-only frost (blur 16px + 6% white lift); global workspace dim deleted, counter-brighten hack deleted (D2). |
| R-17 | Spotlight architecture | Body-level portal, mandatory; layout-library transform CSS override deleted; INV-14 added (D3). |
| R-18 | Spotlight scrim coverage with the rail visible | Scrim covers the workspace region only — window left edge to the rail's left edge; the rail stays interactive; the pane's right inset is measured from the rail's left edge (C1/D3; supersedes the earlier full-width scrim draft). |
| R-19 | Scrim click-to-restore? | No — scrim is inert; only the header button toggles (D3). |
| R-20 | Spotlight pane radius | `--radius-lg` with `--shadow-4` (current 8px retired) (D3). |
| R-21 | Ghost material | glass-2 + `--shadow-3` + radius `--radius-md`; 280×180 and −1.5° tilt kept; no live thumbnail (D2). |
| R-22 | Drop-wash strength | `rgba(accent, 0.15)` fill + 1px `rgba(accent, 0.60)` border (over content, so the 8% accent-on-glass cap does not apply); dashed pattern retired (D2). |
| R-23 | Toast surface | glass-2, radius `--radius-lg`, `--shadow-3`, bottom-center, z above the spotlight scrim (D4). |
| R-24 | Pane title source | cwd basename → OSC title → `user@host` fallback chain; tail-ellipsized at 12px/500 (D1). |
| R-25 | Multi-window? | Deferred: anti-feature #7; the v2+ return path (per-window state files, namespaced ids) stays unfrozen (B3). |
| R-26 | Save debounce figure | 400ms kept (earlier 500ms figure superseded), plus fsync + quit-time force-flush (B3). |
| R-27 | Overlay z-order with the settings popover | scrim 800 → spotlight 810 → drag ghost 1000 → settings popover 1050 → toast 1100; the popover closes on drag start so popover-vs-ghost stacking never arises (C1/C3/D3). |
| R-28 | Workspace accent: persisted or re-derived? | Persisted — `accentHue` is a field of the workspace record (B1) and the v2 schema (B3), assigned once at creation by the first-free scan of the 7-hue rotation starting at the default accent (least-owned, scan-order ties, past seven), immutable thereafter. Reorder, close, and relaunch never reshuffle hues; freed hues return to the pool; migration assigns hues in array order; a missing/invalid value is repaired at hydration (A1/B1/B3/C3). |
| R-29 | Settings popover when the rail hides while it is open? | The popover closes with its anchor — View → Hide Sidebar joins C3's dismissal list, resolved the same way R-27 resolved drag start; nothing is lost because every change commits on interaction (C1/C3). |

## Acceptance — definition of done

The redesign ships only when all three gates below pass.

### 1. Migration test (blocking)

Run B3's mandatory migration acceptance test against a real version-1
`state.json` from the current production build. All four conditions must
hold: (1) a byte-identical timestamped v1 backup exists on disk before the
first v2 write; (2) zero data loss — every tab becomes a workspace with
identical ids, titles, structure, focus, maximize state, and the full
`paneCwds` map, with the previously active tab active, plus a
migration-assigned `accentHue` per workspace (the only added field); (3) workspace #1
renders the pixel-equivalent layout of v1 tab #1 with fresh shells spawning
in saved cwds; (4) round-trip stability — a second relaunch restores the same
state and the backup is untouched. Additionally, the Journey 5 corruption
path is exercised once: a deliberately corrupted state file must produce a
timestamped bad-copy backup plus a fresh default, never a silent overwrite.

### 2. Regression checklist (blocking)

Every redesign PR is reviewed against INV-1 through INV-14 (Feature D5); a
single failed invariant blocks merge. Before release, the 5-point manual
checklist M-1 through M-5 is run once on the packaged `.app` (not dev mode);
a single failure blocks release. The invariant list is append-only — no
invariant may be silently dropped during implementation.

### 3. Visual bar (blocking)

Every chrome surface — titlebar, workspace chips, utility rail, pane headers,
settings popover, drag ghost, drop wash, spotlight scrim and frame, toast —
uses a defined Chapter A token for its material, radius, shadow, typography,
and motion. **No hardcoded colors:** any hex or rgba literal appearing in
chrome styles must be one of the values in the A1 token tables (verification:
grep chrome components for color literals and match each against the token
registry; terminal-content values from D1's xterm table are the only
sanctioned additions). Both fallback renders are verified by hand: reduced
transparency and Opaque mode must show every glass surface collapsed to
`--surface-solid` with hairlines kept, and reduced motion must show fades
only. Accent discipline is spot-checked: exactly four accent-tinted elements
visible, 8% fill cap on glass respected, terminal text at 100% opacity
everywhere.
