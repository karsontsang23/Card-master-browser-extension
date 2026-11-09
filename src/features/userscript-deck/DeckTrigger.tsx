import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { registerGamepadVirtualPointerElement } from '../../hosts/extension/gamepad-bridge';
import { projectAssetUrl } from '../../lib/project-assets';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import type {
  MediaSpeedSelection,
  MediaSpeedWheelItem,
} from '../../media-speed/domain/types';
import type { ManagerMode } from '../manager-interaction/state';
import { cardMasterEdgePlaqueUrl, DeckEntryLogo } from './DeckEntryLogo';
import { type DeckEntryPosition, deckEntryEdgeSide } from './deck-entry';
import { deckEntryBadgeCompact, deckEntryBadgeText } from './deck-entry-badge';
import { DECK_ENTRY_LAYOUT, resolveDeckEntryInsets } from './deck-entry-layout';
import {
  commitDeckEntryDragSession,
  createDeckEntryDragSession,
  type DeckEntryDragSession,
  updateDeckEntryDragSession,
} from './deck-entry-position';
import { deckEntryPresentation } from './deck-entry-presentation';
import { MediaSpeedRadialMenu } from './MediaSpeedRadialMenu';
import { mediaSpeedWheelPointerMoved } from './media-speed-wheel-intent';

type DeckTriggerStyle = CSSProperties & {
  '--manager-deck-entry-width': string;
  '--manager-deck-entry-height': string;
  '--manager-deck-entry-half-width': string;
  '--manager-deck-entry-half-height': string;
  '--manager-deck-entry-anchor-x': string;
  '--manager-deck-entry-anchor-y': string;
  '--manager-deck-entry-left-inset': string;
  '--manager-deck-entry-right-inset': string;
  '--manager-deck-entry-top-inset': string;
  '--manager-deck-entry-bottom-inset': string;
  '--manager-deck-entry-button-width': string;
  '--manager-deck-entry-button-height': string;
  '--manager-deck-entry-logo-size': string;
  '--manager-deck-entry-edge-width': string;
  '--manager-deck-entry-edge-height': string;
  '--manager-media-speed-radius': string;
  '--manager-media-speed-option-width': string;
  '--manager-media-speed-option-height': string;
  '--manager-media-speed-crowded-option-width': string;
  '--manager-media-speed-crowded-option-height': string;
  '--manager-media-speed-option-emphasis-scale': string;
  '--manager-media-resources-size': string;
  '--manager-media-resources-combined-offset': string;
  '--manager-deck-entry-drag-offset-x'?: string;
  '--manager-deck-entry-x'?: string;
  '--manager-deck-entry-y'?: string;
};

const SPEED_WHEEL_AUTO_COLLAPSE_MS = 3200;
const SPEED_WHEEL_LEAVE_COLLAPSE_MS = 360;
const SPEED_WHEEL_HIDE_GRACE_MS = 640;
const EDGE_DOCK_LEAVE_COLLAPSE_MS = 280;
const MEDIA_RESOURCES_LOGO_URL = projectAssetUrl(
  'userscript-deck/visual/integrations/media-resources-sheep.png',
);
const MEDIA_RESOURCES_HOVER_LOGO_URL = projectAssetUrl(
  'userscript-deck/visual/integrations/media-resources-sheep-hover.png',
);

function speedWheelInteractionTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('.manager-deck-trigger, .manager-media-speed-radial'),
    )
  );
}

export function DeckTrigger({
  mode,
  visibleCount,
  activeCount,
  showDeckTriggerBadge,
  ready,
  hidden,
  autoHideAtEdge = true,
  autoHideInFullscreen,
  receiving = false,
  position,
  speedWheelVisible,
  speedSelection,
  speedWheelItems,
  mediaResourcesCount = 0,
  showMediaResourcesTrigger = true,
  showMediaResourcesBadge = true,
  triggerRef,
  onHover,
  onLeave,
  onPositionChange,
  onPositionCommit,
  onSpeedSelection,
  onOpenMediaResources,
  mediaResourcesPopup,
  onActivate,
}: {
  mode: ManagerMode;
  visibleCount: number;
  activeCount: number;
  showDeckTriggerBadge: boolean;
  ready: boolean;
  hidden: boolean;
  autoHideAtEdge?: boolean;
  autoHideInFullscreen: boolean;
  receiving?: boolean;
  position: DeckEntryPosition | null;
  speedWheelVisible: boolean;
  speedSelection: MediaSpeedSelection;
  speedWheelItems: readonly MediaSpeedWheelItem[];
  mediaResourcesCount?: number;
  showMediaResourcesTrigger?: boolean;
  showMediaResourcesBadge?: boolean;
  triggerRef: RefCallback<HTMLElement>;
  onHover: (positionX: number) => void;
  onLeave: () => void;
  onPositionChange: (position: DeckEntryPosition) => void;
  onPositionCommit: (position: DeckEntryPosition) => void;
  onSpeedSelection: (selection: MediaSpeedSelection) => void;
  onOpenMediaResources?: () => void;
  mediaResourcesPopup?: ReactNode;
  onActivate: () => void;
}) {
  useLocale();

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const mediaResourcesButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragSessionRef = useRef<DeckEntryDragSession | null>(null);
  const suppressClickRef = useRef(false);
  const radialCollapseTimerRef = useRef<number | null>(null);
  const radialHideTimerRef = useRef<number | null>(null);
  const edgeCollapseTimerRef = useRef<number | null>(null);
  const ignoreEdgeHoverAfterDragRef = useRef(false);
  const ignoreRadialEntryRef = useRef(false);
  const dragCallbacksRef = useRef({ onPositionChange, onPositionCommit });
  dragCallbacksRef.current = { onPositionChange, onPositionCommit };
  const [dragging, setDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<DeckEntryPosition | null>(
    null,
  );
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [edgeHovered, setEdgeHovered] = useState(false);
  const activePosition = dragging && dragPosition ? dragPosition : position;
  const edgeDockSide =
    autoHideAtEdge && !hidden && !dragging
      ? deckEntryEdgeSide(activePosition)
      : null;
  const edgeExpanded =
    edgeDockSide === null ||
    edgeHovered ||
    dragging ||
    receiving ||
    Boolean(mediaResourcesPopup) ||
    mode !== 'closed';
  const radialSignal = edgeExpanded && speedWheelVisible && mode === 'closed';
  const [radialRetained, setRadialRetained] = useState(radialSignal);
  const radialRequested =
    edgeExpanded && mode === 'closed' && (radialSignal || radialRetained);
  const [radialExpanded, setRadialExpanded] = useState(
    () =>
      radialRequested &&
      typeof document !== 'undefined' &&
      !document.hidden &&
      document.hasFocus(),
  );
  const [radialMounted, setRadialMounted] = useState(radialRequested);
  const radialVisible = edgeExpanded && (radialMounted || radialRequested);
  const presentation = deckEntryPresentation({
    mode,
    ready,
    hidden,
    receiving,
    radialVisible,
    mediaResourcesAvailable:
      edgeExpanded &&
      showMediaResourcesTrigger &&
      mediaResourcesCount > 0 &&
      onOpenMediaResources !== undefined,
  });
  const mediaResourcesVisible = presentation.resourcesVisible;
  const entryInsets = resolveDeckEntryInsets(
    presentation.accessoryState === 'speed-resources',
  );
  const popupHorizontal =
    (position?.x ?? 1) > 0.5 ? ('left' as const) : ('right' as const);
  const popupVertical =
    (position?.y ?? 1) > 0.5 ? ('above' as const) : ('below' as const);
  const setButtonNode = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      if (!hidden) triggerRef(node);
    },
    [hidden, triggerRef],
  );
  const setLaunchAnchorNode = useCallback(
    (node: HTMLSpanElement | null) => {
      if (hidden) triggerRef(node);
    },
    [hidden, triggerRef],
  );

  const clearRadialCollapseTimer = useCallback(() => {
    if (radialCollapseTimerRef.current === null) return;
    window.clearTimeout(radialCollapseTimerRef.current);
    radialCollapseTimerRef.current = null;
  }, []);

  const clearEdgeCollapseTimer = useCallback(() => {
    if (edgeCollapseTimerRef.current === null) return;
    window.clearTimeout(edgeCollapseTimerRef.current);
    edgeCollapseTimerRef.current = null;
  }, []);

  const expandEdgeDock = useCallback(() => {
    if (
      !edgeDockSide ||
      document.hidden ||
      ignoreEdgeHoverAfterDragRef.current
    ) {
      return;
    }
    clearEdgeCollapseTimer();
    setEdgeHovered(true);
  }, [clearEdgeCollapseTimer, edgeDockSide]);

  const scheduleEdgeCollapse = useCallback(
    (delay: number) => {
      clearEdgeCollapseTimer();
      if (!edgeDockSide) return;
      edgeCollapseTimerRef.current = window.setTimeout(() => {
        edgeCollapseTimerRef.current = null;
        setEdgeHovered(false);
      }, delay);
    },
    [clearEdgeCollapseTimer, edgeDockSide],
  );

  useEffect(() => {
    if (edgeDockSide === null) {
      clearEdgeCollapseTimer();
    }
    return clearEdgeCollapseTimer;
  }, [clearEdgeCollapseTimer, edgeDockSide]);

  useEffect(() => {
    if (radialHideTimerRef.current !== null) {
      window.clearTimeout(radialHideTimerRef.current);
      radialHideTimerRef.current = null;
    }
    if (radialSignal) {
      setRadialRetained(true);
      return;
    }
    if (mode !== 'closed') {
      setRadialRetained(false);
      return;
    }
    radialHideTimerRef.current = window.setTimeout(() => {
      radialHideTimerRef.current = null;
      setRadialRetained(false);
    }, SPEED_WHEEL_HIDE_GRACE_MS);
    return () => {
      if (radialHideTimerRef.current === null) return;
      window.clearTimeout(radialHideTimerRef.current);
      radialHideTimerRef.current = null;
    };
  }, [mode, radialSignal]);

  const scheduleRadialCollapse = useCallback(
    (delay: number) => {
      clearRadialCollapseTimer();
      radialCollapseTimerRef.current = window.setTimeout(() => {
        radialCollapseTimerRef.current = null;
        setRadialExpanded(false);
      }, delay);
    },
    [clearRadialCollapseTimer],
  );

  const expandRadial = useCallback(() => {
    if (!radialRequested || document.hidden || !document.hasFocus()) return;
    clearRadialCollapseTimer();
    setRadialExpanded(true);
  }, [clearRadialCollapseTimer, radialRequested]);
  const gamepadInteractionRef = useRef({
    expandEdgeDock,
    scheduleEdgeCollapse,
    expandRadial,
    onHover,
    onLeave,
  });
  gamepadInteractionRef.current = {
    expandEdgeDock,
    scheduleEdgeCollapse,
    expandRadial,
    onHover,
    onLeave,
  };

  useEffect(() => {
    if (!radialRequested) {
      clearRadialCollapseTimer();
      setRadialExpanded(false);
      return;
    }
    setRadialMounted(true);
    if (document.hidden || !document.hasFocus()) {
      setRadialExpanded(false);
      return;
    }
    setRadialExpanded(true);
    scheduleRadialCollapse(SPEED_WHEEL_AUTO_COLLAPSE_MS);
    return clearRadialCollapseTimer;
  }, [clearRadialCollapseTimer, radialRequested, scheduleRadialCollapse]);

  useEffect(() => {
    const deactivate = () => {
      ignoreRadialEntryRef.current = true;
      ignoreEdgeHoverAfterDragRef.current = false;
      clearRadialCollapseTimer();
      clearEdgeCollapseTimer();
      setRadialExpanded(false);
      setEdgeHovered(false);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) deactivate();
    };
    window.addEventListener('blur', deactivate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', deactivate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearEdgeCollapseTimer, clearRadialCollapseTimer]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || hidden || !ready || mode !== 'closed') return;
    return registerGamepadVirtualPointerElement({
      element: button,
      onHoverChange(hovered, point) {
        if (hovered && point) {
          ignoreEdgeHoverAfterDragRef.current = false;
          gamepadInteractionRef.current.expandEdgeDock();
          gamepadInteractionRef.current.onHover(point.x);
          gamepadInteractionRef.current.expandRadial();
        } else {
          gamepadInteractionRef.current.scheduleEdgeCollapse(
            EDGE_DOCK_LEAVE_COLLAPSE_MS,
          );
          gamepadInteractionRef.current.onLeave();
        }
      },
    });
  }, [hidden, mode, ready]);

  useEffect(() => {
    const button = mediaResourcesButtonRef.current;
    if (!button || !mediaResourcesVisible) return;
    return registerGamepadVirtualPointerElement({ element: button });
  }, [mediaResourcesVisible]);

  const handleRadialClosed = useCallback(() => {
    if (!radialRequested) setRadialMounted(false);
  }, [radialRequested]);

  const updateDragPosition = useCallback((event: PointerEvent) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const update = updateDeckEntryDragSession(session, {
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (!update) return;
    const rawCenterX = update.position.x * window.innerWidth;
    const minClusterX = Math.min(window.innerWidth / 2, session.insets.left);
    const maxClusterX = Math.max(
      minClusterX,
      window.innerWidth - Math.min(window.innerWidth / 2, session.insets.right),
    );
    const clusterCenterX = Math.min(
      maxClusterX,
      Math.max(minClusterX, rawCenterX),
    );
    setDragOffsetX(rawCenterX - clusterCenterX);
    setDragPosition(update.position);
    if (update.started) setDragging(true);
    event.preventDefault();
    dragCallbacksRef.current.onPositionChange(update.position);
  }, []);

  const finishDrag = useCallback(
    (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      updateDragPosition(event);
      dragSessionRef.current = null;
      const button = buttonRef.current;
      if (!session.moved) {
        if (button?.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        return;
      }
      const committedPosition = commitDeckEntryDragSession(session, {
        pointerX: event.clientX,
        pointerY: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      clearEdgeCollapseTimer();
      ignoreEdgeHoverAfterDragRef.current =
        deckEntryEdgeSide(committedPosition) !== null;
      if (button?.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      setEdgeHovered(false);
      setDragOffsetX(0);
      setDragPosition(null);
      setDragging(false);
      dragCallbacksRef.current.onPositionCommit(committedPosition);
    },
    [clearEdgeCollapseTimer, updateDragPosition],
  );

  useEffect(() => {
    const clearPostDragEdgeLock = (event: PointerEvent) => {
      if (!ignoreEdgeHoverAfterDragRef.current || dragSessionRef.current) {
        return;
      }
      const side = edgeDockSide;
      if (!side) {
        ignoreEdgeHoverAfterDragRef.current = false;
        return;
      }
      const horizontalClearance = DECK_ENTRY_LAYOUT.dock.width / 2 + 12;
      const leftEdgeZone =
        side === 'right'
          ? event.clientX < window.innerWidth - horizontalClearance
          : event.clientX > horizontalClearance;
      const button = buttonRef.current;
      const bounds = button?.getBoundingClientRect();
      const leftVerticalZone = bounds
        ? event.clientY < bounds.top - 24 || event.clientY > bounds.bottom + 24
        : false;
      if (leftEdgeZone || leftVerticalZone) {
        ignoreEdgeHoverAfterDragRef.current = false;
      }
    };
    window.addEventListener('pointermove', clearPostDragEdgeLock, true);
    return () => {
      window.removeEventListener('pointermove', clearPostDragEdgeLock, true);
    };
  }, [edgeDockSide]);

  useEffect(() => {
    window.addEventListener('pointermove', updateDragPosition, true);
    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('pointercancel', finishDrag, true);
    return () => {
      window.removeEventListener('pointermove', updateDragPosition, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('pointercancel', finishDrag, true);
      dragSessionRef.current = null;
    };
  }, [finishDrag, updateDragPosition]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!presentation.canDrag || event.button !== 0 || !event.isPrimary) {
      return;
    }
    const anchor =
      event.currentTarget.querySelector?.<HTMLElement>(
        '.manager-deck-trigger__logo-anchor',
      ) ?? event.currentTarget;
    const bounds = anchor.getBoundingClientRect();
    const session = createDeckEntryDragSession({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position,
      insets: entryInsets,
      edgeSnap: autoHideAtEdge,
    });
    dragSessionRef.current = session;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const positionStyle: DeckTriggerStyle = {
    '--manager-deck-entry-width': `${DECK_ENTRY_LAYOUT.dock.width}px`,
    '--manager-deck-entry-height': `${DECK_ENTRY_LAYOUT.dock.height}px`,
    '--manager-deck-entry-half-width': `${DECK_ENTRY_LAYOUT.dock.width / 2}px`,
    '--manager-deck-entry-half-height': `${DECK_ENTRY_LAYOUT.dock.height / 2}px`,
    '--manager-deck-entry-anchor-x': `${DECK_ENTRY_LAYOUT.dock.defaultCenterOffset}px`,
    '--manager-deck-entry-anchor-y': `${DECK_ENTRY_LAYOUT.dock.defaultCenterOffset}px`,
    '--manager-deck-entry-left-inset': `${entryInsets.left}px`,
    '--manager-deck-entry-right-inset': `${entryInsets.right}px`,
    '--manager-deck-entry-top-inset': `${entryInsets.top}px`,
    '--manager-deck-entry-bottom-inset': `${entryInsets.bottom}px`,
    '--manager-deck-entry-button-width': `${DECK_ENTRY_LAYOUT.core.buttonWidth}px`,
    '--manager-deck-entry-button-height': `${DECK_ENTRY_LAYOUT.core.buttonHeight}px`,
    '--manager-deck-entry-logo-size': `${DECK_ENTRY_LAYOUT.core.logoSize}px`,
    '--manager-deck-entry-edge-width': `${DECK_ENTRY_LAYOUT.core.edgePlaqueWidth}px`,
    '--manager-deck-entry-edge-height': `${DECK_ENTRY_LAYOUT.core.edgePlaqueHeight}px`,
    '--manager-media-speed-radius': `${DECK_ENTRY_LAYOUT.speed.radius}px`,
    '--manager-media-speed-option-width': `${DECK_ENTRY_LAYOUT.speed.optionWidth}px`,
    '--manager-media-speed-option-height': `${DECK_ENTRY_LAYOUT.speed.optionHeight}px`,
    '--manager-media-speed-crowded-option-width': `${DECK_ENTRY_LAYOUT.speed.crowdedOptionWidth}px`,
    '--manager-media-speed-crowded-option-height': `${DECK_ENTRY_LAYOUT.speed.crowdedOptionHeight}px`,
    '--manager-media-speed-option-emphasis-scale': `${DECK_ENTRY_LAYOUT.speed.optionEmphasisScale}`,
    '--manager-media-resources-size': `${DECK_ENTRY_LAYOUT.resources.size}px`,
    '--manager-media-resources-combined-offset': `${DECK_ENTRY_LAYOUT.resources.combinedOffset}px`,
    ...(dragging
      ? {
          '--manager-deck-entry-drag-offset-x': `${dragOffsetX}px`,
        }
      : {}),
    ...(activePosition
      ? {
          '--manager-deck-entry-x': `${activePosition.x * 100}%`,
          '--manager-deck-entry-y': `${activePosition.y * 100}%`,
        }
      : {}),
  };

  const cluster = (
    <div
      className={`manager-deck-entry-cluster${radialVisible ? ' has-speed-radial' : ''}${mediaResourcesVisible ? ' has-media-resources-trigger' : ''}${hidden ? ' has-hidden-trigger' : ''}${activePosition ? ' has-custom-position' : ''}${dragging ? ' is-dragging' : ''}`}
      data-core-state={presentation.coreState}
      data-edge-dock={edgeDockSide ?? 'off'}
      data-edge-expanded={edgeDockSide ? edgeExpanded : undefined}
      data-fullscreen-auto-hide={autoHideInFullscreen}
      data-accessories={presentation.accessoryState}
      data-media-resources-placement={
        presentation.resourcePlacement ?? undefined
      }
      data-cat-catch-popup-horizontal={
        mediaResourcesPopup ? popupHorizontal : undefined
      }
      data-cat-catch-popup-vertical={
        mediaResourcesPopup ? popupVertical : undefined
      }
      style={positionStyle}
      onPointerEnter={(event) => {
        if (edgeExpanded) {
          clearEdgeCollapseTimer();
        }
        if (!speedWheelInteractionTarget(event.target)) return;
        if (ignoreRadialEntryRef.current) return;
        expandRadial();
      }}
      onPointerMove={(event) => {
        if (
          !speedWheelInteractionTarget(event.target) ||
          document.hidden ||
          !document.hasFocus() ||
          !ignoreRadialEntryRef.current ||
          !mediaSpeedWheelPointerMoved(event.movementX, event.movementY)
        ) {
          return;
        }
        ignoreRadialEntryRef.current = false;
        expandRadial();
      }}
      onPointerLeave={() => {
        if (!dragging) {
          scheduleEdgeCollapse(EDGE_DOCK_LEAVE_COLLAPSE_MS);
        }
        if (!radialRequested || dragging) return;
        if (document.hidden || !document.hasFocus()) return;
        ignoreRadialEntryRef.current = false;
        scheduleRadialCollapse(SPEED_WHEEL_LEAVE_COLLAPSE_MS);
      }}
    >
      {radialVisible && (
        <MediaSpeedRadialMenu
          items={speedWheelItems}
          selection={speedSelection}
          visible={radialRequested}
          expanded={radialExpanded}
          onClosed={handleRadialClosed}
          onRequestExpand={expandRadial}
          onSelect={onSpeedSelection}
        />
      )}
      {mediaResourcesVisible && (
        <button
          ref={mediaResourcesButtonRef}
          type="button"
          className="manager-media-resources-trigger"
          aria-label={t('cm_deck_trigger_text_1', [
            String(mediaResourcesCount),
          ])}
          title={t('cm_deck_trigger_text_2', [String(mediaResourcesCount)])}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.detail > 0) event.currentTarget.blur();
            onOpenMediaResources?.();
          }}
        >
          <img
            className="manager-media-resources-trigger__logo is-default"
            src={MEDIA_RESOURCES_LOGO_URL}
            alt=""
            aria-hidden="true"
          />
          <img
            className="manager-media-resources-trigger__logo is-hover"
            src={MEDIA_RESOURCES_HOVER_LOGO_URL}
            alt=""
            aria-hidden="true"
          />
          {showMediaResourcesBadge && (
            <span
              className="manager-entry-count-badge manager-media-resources-trigger__badge"
              data-compact={
                deckEntryBadgeCompact(mediaResourcesCount) ? 'true' : undefined
              }
              aria-hidden="true"
            >
              {deckEntryBadgeText(mediaResourcesCount)}
            </span>
          )}
        </button>
      )}
      {mediaResourcesPopup}
      <button
        ref={setButtonNode}
        type="button"
        disabled={!presentation.canActivate}
        data-audio-managed="true"
        className={`manager-deck-trigger${presentation.coreState === 'hidden' ? ' is-hidden' : ''}${presentation.coreState === 'closed' ? ' is-ready' : ''}${presentation.coreState === 'transition' ? ' is-transitioning' : ''}${presentation.coreState === 'suppressed' ? ' is-suppressed' : ''}${presentation.coreState === 'receiving' ? ' is-import-receiving' : ''}${dragging ? ' is-dragging' : ''}`}
        aria-hidden={presentation.coreVisible ? undefined : true}
        tabIndex={presentation.coreVisible ? undefined : -1}
        onPointerEnter={(event) => {
          expandEdgeDock();
          onHover(event.clientX);
        }}
        onPointerMove={() => {
          if (!edgeExpanded) {
            expandEdgeDock();
          }
        }}
        onPointerLeave={onLeave}
        onPointerDown={beginDrag}
        onDragStart={(event) => {
          event.preventDefault();
        }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (event.detail > 0) event.currentTarget.blur();
          onActivate();
        }}
        aria-grabbed={dragging}
        aria-label={
          presentation.coreState === 'receiving'
            ? t('cm_deck_trigger_text_3')
            : presentation.coreState === 'transition'
              ? t('cm_deck_trigger_text_4')
              : presentation.coreState === 'suppressed'
                ? t('cm_deck_trigger_text_5')
                : t('cm_deck_trigger_text_6', [String(visibleCount)])
        }
      >
        {edgeDockSide && (
          <span
            className="manager-deck-trigger__edge-anchor"
            aria-hidden="true"
          >
            <img
              className="manager-deck-trigger__edge-plaque"
              src={cardMasterEdgePlaqueUrl(edgeDockSide)}
              alt=""
              draggable={false}
            />
          </span>
        )}
        <span className="manager-deck-trigger__logo-anchor">
          <DeckEntryLogo className="manager-deck-trigger__logo" />
          {showDeckTriggerBadge && ready && (
            <span
              className="manager-entry-count-badge manager-deck-trigger__badge"
              data-compact={
                deckEntryBadgeCompact(activeCount) ? 'true' : undefined
              }
              aria-hidden="true"
            >
              {deckEntryBadgeText(activeCount)}
            </span>
          )}
        </span>
      </button>
    </div>
  );

  return hidden ? (
    <>
      <span
        ref={setLaunchAnchorNode}
        className="manager-deck-launch-anchor"
        aria-hidden="true"
      />
      {cluster}
    </>
  ) : (
    cluster
  );
}
