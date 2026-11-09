import { projectAssetUrl } from '../../lib/project-assets';
import type { DeckEntryEdgeSide } from './deck-entry';

const CARD_MASTER_LOGO_URL = projectAssetUrl(
  'userscript-deck/visual/action-icons/card-master-logo.png',
);
const CARD_MASTER_EDGE_LEFT_URL = projectAssetUrl(
  'userscript-deck/visual/action-icons/card-master-edge-left.webp',
);
const CARD_MASTER_EDGE_RIGHT_URL = projectAssetUrl(
  'userscript-deck/visual/action-icons/card-master-edge-right.webp',
);

export function cardMasterEdgePlaqueUrl(side: DeckEntryEdgeSide) {
  return side === 'left'
    ? CARD_MASTER_EDGE_LEFT_URL
    : CARD_MASTER_EDGE_RIGHT_URL;
}

export function DeckEntryLogo({ className }: { className?: string }) {
  return (
    <img
      className={className}
      src={CARD_MASTER_LOGO_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
