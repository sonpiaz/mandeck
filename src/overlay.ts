// Single body-level portal host for overlay layers (SPEC D3 boundary: one
// host, a direct child of document.body, created once at startup and never
// unmounted — no ancestor filter/transform/backdrop-filter can ever trap a
// fixed-position overlay rendered through it). C3's settings popover is its
// first tenant; D2/D3/D4 adopt it in the re-skin sprint.
let host: HTMLDivElement | null = null;

export function getOverlayHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement("div");
    host.id = "overlay-root";
    document.body.appendChild(host);
  }
  return host;
}
