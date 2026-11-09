import type { DeckEntryPosition } from './deck-entry';
import { DECK_ENTRY_LAYOUT, type DeckEntryInsets } from './deck-entry-layout';

export const DECK_ENTRY_DRAG_THRESHOLD = 6;

export type DeckEntryDragSession = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startCenterX: number;
  startCenterY: number;
  insets: DeckEntryInsets;
  edgeSnap: boolean;
  moved: boolean;
  position: DeckEntryPosition;
};

function clampedAxisPosition(
  position: number,
  size: number,
  startInset: number,
  endInset: number,
) {
  const minimum = Math.min(size / 2, startInset);
  const maximum = Math.max(minimum, size - Math.min(size / 2, endInset));
  return Math.min(maximum, Math.max(minimum, position));
}

export function normalizedDeckEntryPosition({
  centerX,
  centerY,
  insets,
  viewportWidth,
  viewportHeight,
  edgeSnap = false,
  dragging = false,
}: {
  centerX: number;
  centerY: number;
  insets: DeckEntryInsets;
  viewportWidth: number;
  viewportHeight: number;
  edgeSnap?: boolean;
  dragging?: boolean;
}): DeckEntryPosition {
  const dragHorizontalInset = DECK_ENTRY_LAYOUT.core.logoSize / 2;
  const horizontalLeftInset =
    edgeSnap && dragging ? dragHorizontalInset : insets.left;
  const horizontalRightInset =
    edgeSnap && dragging ? dragHorizontalInset : insets.right;
  const canSnapHorizontally =
    edgeSnap && !dragging && viewportWidth > insets.left + insets.right;
  const x =
    canSnapHorizontally && centerX <= insets.left
      ? 0
      : canSnapHorizontally && centerX >= viewportWidth - insets.right
        ? 1
        : clampedAxisPosition(
            centerX,
            viewportWidth,
            horizontalLeftInset,
            horizontalRightInset,
          ) / viewportWidth;
  return {
    x,
    y:
      clampedAxisPosition(centerY, viewportHeight, insets.top, insets.bottom) /
      viewportHeight,
  };
}

export function createDeckEntryDragSession({
  pointerId,
  pointerX,
  pointerY,
  centerX,
  centerY,
  viewportWidth,
  viewportHeight,
  position,
  insets,
  edgeSnap = false,
}: {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  centerX: number;
  centerY: number;
  viewportWidth: number;
  viewportHeight: number;
  position: DeckEntryPosition | null;
  insets: DeckEntryInsets;
  edgeSnap?: boolean;
}): DeckEntryDragSession {
  return {
    pointerId,
    startPointerX: pointerX,
    startPointerY: pointerY,
    startCenterX: centerX,
    startCenterY: centerY,
    insets,
    edgeSnap,
    moved: false,
    position:
      position ??
      normalizedDeckEntryPosition({
        centerX,
        centerY,
        insets,
        viewportWidth,
        viewportHeight,
        edgeSnap,
      }),
  };
}

export function updateDeckEntryDragSession(
  session: DeckEntryDragSession,
  {
    pointerX,
    pointerY,
    viewportWidth,
    viewportHeight,
  }: {
    pointerX: number;
    pointerY: number;
    viewportWidth: number;
    viewportHeight: number;
  },
) {
  const deltaX = pointerX - session.startPointerX;
  const deltaY = pointerY - session.startPointerY;
  if (
    !session.moved &&
    Math.hypot(deltaX, deltaY) < DECK_ENTRY_DRAG_THRESHOLD
  ) {
    return null;
  }
  const started = !session.moved;
  session.moved = true;
  session.position = normalizedDeckEntryPosition({
    centerX: session.startCenterX + deltaX,
    centerY: session.startCenterY + deltaY,
    insets: session.insets,
    viewportWidth,
    viewportHeight,
    edgeSnap: session.edgeSnap,
    dragging: true,
  });
  return {
    position: session.position,
    started,
  };
}

export function commitDeckEntryDragSession(
  session: DeckEntryDragSession,
  {
    pointerX,
    pointerY,
    viewportWidth,
    viewportHeight,
  }: {
    pointerX: number;
    pointerY: number;
    viewportWidth: number;
    viewportHeight: number;
  },
) {
  const deltaX = pointerX - session.startPointerX;
  const deltaY = pointerY - session.startPointerY;
  session.position = normalizedDeckEntryPosition({
    centerX: session.startCenterX + deltaX,
    centerY: session.startCenterY + deltaY,
    insets: session.insets,
    viewportWidth,
    viewportHeight,
    edgeSnap: session.edgeSnap,
    dragging: false,
  });
  return session.position;
}
