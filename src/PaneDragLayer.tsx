import { useDragLayer } from "react-dnd";
import { PANE_DND_TYPE, type PaneDragItem } from "./types";

export function PaneDragLayer() {
  const { isDragging, item, currentOffset, itemType } = useDragLayer(
    (monitor) => ({
      isDragging: monitor.isDragging(),
      item: monitor.getItem<PaneDragItem | null>(),
      currentOffset: monitor.getSourceClientOffset(),
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

  return (
    <div className="pane-drag-layer">
      <div
        className="pane-drag-ghost"
        style={{
          transform: `translate3d(${currentOffset.x}px, ${currentOffset.y}px, 0)`,
        }}
      >
        <span className="pane-drag-ghost-icon" aria-hidden>▢</span>
        <span className="pane-drag-ghost-label">Move pane</span>
      </div>
    </div>
  );
}
