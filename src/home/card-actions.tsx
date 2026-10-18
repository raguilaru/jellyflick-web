import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { TitleDetails } from '../catalogue/catalogue';
import type { DeviceLayer } from '../device/types';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * What a card on Home can do to its Title, and what it needs to do it (#21).
 *
 * An enlarged hover card offers Play, My List and More info. My List is the
 * shell's one store and More info is an address, so both already reach a card
 * through a context of their own. **Play is the one that could not**: it needs
 * the gateway, the User and the device layer to open a player, and a player
 * has to outlive the card it was started from — the pointer leaves the moment
 * it moves towards the picture.
 *
 * So Home holds what is playing and this context is how a card asks for it,
 * rather than four Row components growing three props each. It is the same
 * call `use-billboard.ts` made for the featured Title: the thing that must
 * survive the component is held above it.
 */

export type CardActions = {
  gateway: JellyfinGateway;
  /** The User watching: `PlaybackInfo` is asked on their behalf. */
  userId: string;
  /** The player reads the remote's keys and the device's codecs through it. */
  device: DeviceLayer;
  /**
   * Play this Title, in a player over Home.
   *
   * It takes the **Title** and not a `PlayTarget` on purpose: a Series holds
   * no file, so what Play means for one is an Episode and working that out
   * costs two reads (`resolvePlayTarget`). Home makes them, because Home is
   * also where the answer "there is no Episode to play" has somewhere to be
   * said — a card the pointer has already left cannot say anything.
   */
  play: (details: TitleDetails) => void;
};

const CardActionsContext = createContext<CardActions | undefined>(undefined);

export function CardActionsProvider({
  actions,
  children,
}: {
  actions: CardActions;
  children: ComponentChildren;
}) {
  return <CardActionsContext.Provider value={actions}>{children}</CardActionsContext.Provider>;
}

/**
 * What a card can do, or `undefined` where nothing is offering it — a `Row`
 * rendered in a unit test of its own, and the title page's More like this,
 * which is inside a pop-up and keeps the plain controls.
 *
 * A card without actions simply draws no enlarged version of itself, which is
 * the same answer a phone gets.
 */
export function useCardActions(): CardActions | undefined {
  return useContext(CardActionsContext);
}
