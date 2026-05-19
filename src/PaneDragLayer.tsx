import { useDragLayer } from "react-dnd";
import { PANE_DND_TYPE, type PaneDragItem } from "./types";

const GHOST_W = 280;
const GHOST_H = 180;

export function PaneDragLayer() {
  const { isDragging, item, currentOffset, itemType } = useDragLayer(
    (monitor) => ({
      isDragging: monitor.isDragging(),
      item: monitor.getItem<PaneDragItem | null>(),
      currentOffset: monitor.getClientOffset(),
      itemType: monitor.getItemType(),
    })
  );

  if (
    !isDragging ||
    itemType !== PANE_DND_TYPE ||
    !item ||
    !currentOffset
  ) {
    return null;
  }

  // Center the ghost on the cursor so it feels held, not dragged from a corner.
  const x = currentOffset.x - GHOST_W / 2;
  const y = currentOffset.y - 18;

  return (
    <div className="pane-drag-layer">
      <div
        className="pane-drag-ghost"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0) rotate(-1.5deg)`,
          width: GHOST_W,
          height: GHOST_H,
        }}
      >
        <div className="pane-drag-ghost-header">
          <span className="pane-drag-ghost-icon" aria-hidden>▢</span>
          <span className="pane-drag-ghost-title">{item.title}</span>
        </div>
        <div className="pane-drag-ghost-body">
          <span className="pane-drag-ghost-prompt">
            {item.title.split("@")[0] || "user"}@…
          </span>
          <span className="pane-drag-ghost-cursor" aria-hidden>▍</span>
        </div>
      </div>
    </div>
  );
}
