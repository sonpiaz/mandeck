# SPRINT-PLAN — waveterm-ui → mandeck v0.1 "Glass"

Phase 4 deliverable, locked with the owner on 2026-06-11.
Owner decisions: **design = Variant A "Liquid Glass"** (mockup
`mockups/variant-a-liquid.html`, chosen over B "Linear Restraint");
**scope = minimal rail** (terminal + settings only).
MODE 1 (No Wall): implementation target is the EXISTING repo
`/Users/sonpiaz/mandeck` — same session may implement; the mockup HTML and
analysis/ may be consulted (they are our own invented design, not source).

## v0.1 scope

### MUST-HAVE features (SPEC.md feature numbers)

- [ ] **A1 + A2 + A3** — Glass design system, window vibrancy, 44px glass
      titlebar. The whole point of the redesign: premium Liquid Glass look
      (Variant A: blur 16/saturate 140% chrome, specular rims, wallpaper
      bleed-through, noise grain on glass-2).
- [ ] **B1 + B2 + B3 + B4** — Workspace model + bar + persistence v2 +
      switching. The red-box-A port: named project workspaces one keystroke
      apart, zero data loss migration from v1 state.
- [ ] **C1 + C2 + C3** — Utility rail (terminal launcher + settings gear)
      with glass-2 settings popover + settings.json. The red-box-B port,
      minimal v1 set per owner decision.
- [ ] **D1 + D2 + D3 + D4** — Component re-skin: pane chrome, drag
      ghost/wash, maximize spotlight as body portal, toasts/⌘Q on glass-2.
- [ ] **D5** — Regression invariants INV-1..14 + 5-point packaged-build
      checklist all green. Non-negotiable: the redesign must not regress
      the working core.

### DROP-FOREVER features (anti-features)

- Embedded web browser widget (memory risk, against product thesis)
- AI chat sidebar (Claude Code IS the AI; the terminal hosts it)
- Backend daemon (no wavesrv equivalent, ever)
- Tab pinning, per-workspace background images (feature-collage clutter)
- Per-pane gear/settings, pane background images

### DEFER (might add in v0.2)

- Files widget (file-browser pane type), web widget — revisit after dogfood
- sysinfo widget
- Multi-window (per-window state files design committed in SPEC B3)
- ⌘K command palette (see First-principles delta — strongest wedge candidate)
- Accent color slider / theme picker UI (accent ships file-only in v1)

## Tech stack

**Binding** (existing repo, locked): Electron 33 + React 18 (StrictMode OFF)
+ TypeScript strict + Vite 5 + xterm.js 5 (enable bundled WebGL addon per
SPEC) + node-pty + allotment + react-dnd. No new heavyweight deps; icon
glyphs inline SVG.

## Sprints

### Sprint 1 — Workspace model + persistence v2 (SPEC chapter B)

**Goal**: Tab → Workspace rename lands cleanly; state v2 + migration proven.

**Includes**: B1 workspace entity (incl. focused-pane cwd→basename
auto-rename rule — currently scaffolded but absent), B2 bar interactions +
keyboard map relabel, B3 v2 schema + v1 backup-then-migrate + load decision
table + fsync/quit-flush hardening, B4 switching mechanics (mounted
workspaces, rAF re-fit, focus repair).

**Acceptance**:
- [ ] SPEC B3 migration test: real v1 state.json loads with zero data loss;
      byte-identical timestamped backup written; round-trip stable
- [ ] All keyboard shortcuts work relabeled (⌘1-9, ⌘[/⌘], ⌘T, ⌘⇧W, ⌘W cascade)
- [ ] Build green; no visual regressions (re-skin comes in Sprint 2)

### Sprint 2 — Glass foundation (SPEC chapter A)

**Goal**: the app LOOKS like mockup variant A.

**Includes**: A1 token sheet (CSS custom properties exactly per SPEC tables),
A2 window vibrancy (under-window + #00000000 + followWindow + nativeTheme
branch + reduced-transparency fallback), A3 44px glass titlebar with chip
geometry D1-D12, xterm theme remap + 0.92 terminal alpha + WebGL addon +
allowTransparency.

**Acceptance**:
- [ ] Side-by-side vs mockups/variant-a-liquid.png: chrome reads as same design
- [ ] Wallpaper visibly bleeds through titlebar; terminal text stays 100% contrast
- [ ] Reduce Transparency (system setting) collapses to solid #16161C live

### Sprint 3 — Utility rail + settings (SPEC chapter C)

**Goal**: red box B ships in its minimal v1 form.

**Includes**: C1 rail (56px flex sibling, hover/press/focus states, View-menu
toggle, drag-inert), C2 terminal launcher ≡ ⌘N path, C3 settings popover
(glass-2, font stepper live-apply via option mutation + refit, shell for new
panes, Edit-config escape hatch) + settings.json IPC.

**Acceptance**:
- [ ] Rail click spawns pane identically to ⌘N in all layout cases
- [ ] Font size change applies live without any terminal remount (PTYs survive)
- [ ] Rail sits OUTSIDE every filtered/transformed ancestor (verify maximize +
      drag-dim both leave rail untouched)

### Sprint 4 — Re-skin interactions + package (SPEC chapter D)

**Goal**: every overlay/interaction matches the design system; packaged build.

**Includes**: D1 pane chrome (28px glass-1 headers, accent focus ring), D2
drag ghost glass-2 + accent wash (green retired), D3 maximize spotlight →
body-level portal on glass-3 (containing-block trap fix), D4 toasts/⌘Q
glass-2, D5 invariants sweep, electron-builder package.

**Acceptance**:
- [ ] INV-1..14 all verified
- [ ] 5-point packaged checklist green (drag, ⌘Q×2, restore, ⌘+click, drop)
- [ ] 10x maximize toggle: same PTY pid (no remount)

## First-principles delta (Phase 4 mandatory audit)

> JTBD (PROBLEM-FIT): switch between project contexts instantly, watch
> several long-running agent sessions side-by-side, in a tool that feels
> as premium as the work it hosts.

### Things in SPEC.md but NOT in first-principles answer

- **The utility rail itself**: from first principles, a launcher for "new
  terminal" (already ⌘N) + a settings entry (could live in the menu) does
  not need 56px of permanent chrome. It survives as an OWNER muscle-memory
  port (red box B) — consciously kept, consciously minimal. If dogfood shows
  it unused, v0.2 may demote it to hidden-by-default.
- **WaveTerm's wider widget economy** (files/web/sysinfo/AI/apps): correctly
  dropped or deferred — that's the feature-collage the rebuild rejects.

### Things in first-principles answer but NOT in SPEC.md

- **⌘K command palette**: with N workspaces × M panes of agent sessions, a
  fuzzy jump-to-workspace/pane + action palette is the modern first-
  principles answer to "switch contexts instantly" (both mockups even render
  one as the glass-2 demo). Deliberately DEFERRED to v0.2 to keep v0.1
  shippable today — flagged as the wedge feature to build next.
- **Per-workspace accent identity** (glass tint tells you which project a
  pane belongs to at a glance): partially IN SPEC already (accentHue per
  workspace) — this is the 10x-different detail vs every competitor; keep it.

### Verdict

Not a 5%-better clone: same-shaped chrome but different product thesis —
lean leak-free core + premium glass + per-workspace identity, with the
palette wedge queued for v0.2. Proceed.

## Definition of success for v0.1

- [x] Owner replaces `/Applications/Mandeck.app` (legacy WaveTerm fork) with
      the packaged redesigned build as daily terminal; legacy uninstalled;
      all 5 regression checks green; first reaction is a screenshot.

## Risks + mitigations

- **Risk**: state v2 migration bug wipes real layout (hydrate-null → 400ms
  overwrite).
  - Mitigation: backup written by MAIN process before renderer hydrates
    (SPEC B3); migration acceptance test on a copy of the live state.json
    BEFORE first launch against real data.
- **Risk**: glass layers break position:fixed maximize spotlight (bitten 2×).
  - Mitigation: SPEC D3 mandates body-level portal + clean-ancestry
    invariant; Sprint 4 acceptance includes the 10x-toggle PTY test.
- **Risk**: blur over live terminals tanks frame rate.
  - Mitigation: SPEC A1 chrome-only glass rule + D1 sanctioned fallback
    (drop header backdrop blur, keep fill+rim); WebGL addon enabled.
- **Risk**: vibrancy + 0.92 alpha hurts terminal legibility on bright
  wallpapers.
  - Mitigation: text always 100% opacity; alpha fixed at 0.92 (no slider);
    Reduce Transparency collapses everything to solid.

## Phase 5 instructions for Team B

MODE 1 — the implementing session works directly on `/Users/sonpiaz/mandeck`
on a feature branch. Read SPEC.md (copied into the repo) as the single
source of behavior; mockups/variant-a-liquid.html may be consulted for
visual fidelity (it is our own design artifact). Commit per sprint with
conventional prefixes. If anything in SPEC.md is unclear, report the gap —
do not guess behavior.
