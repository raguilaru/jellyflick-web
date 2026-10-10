import type { Title } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';
import type { RowCard } from './row';

/**
 * A Title as the card that stands for it. Every Row and every grid of Titles
 * shows the same card, so there is one place that decides what a card is made
 * of and how big its artwork is asked for.
 */

/**
 * How wide a card's artwork is asked for. Wide enough for a card on a 1080p TV
 * at twice the pixel density, and far narrower than the poster the Server holds.
 */
export const ARTWORK_WIDTH = 400;

export function cardFor(gateway: JellyfinGateway, title: Title): RowCard {
  return {
    titleId: title.itemId,
    name: title.name,
    ...(title.artwork === undefined
      ? {}
      : {
          artworkUrl: gateway.itemImageUrl(title.artwork.itemId, 'Primary', {
            tag: title.artwork.imageTag,
            maxWidth: ARTWORK_WIDTH,
          }),
        }),
  };
}
