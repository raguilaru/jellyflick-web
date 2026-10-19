/**
 * AirPlay (#33, third acceptance criterion): sending the picture to an Apple
 * TV through **Safari's own picker**, which is the whole of what the app does
 * here.
 *
 * There is no protocol to speak and nothing to negotiate — unlike Chromecast,
 * where this app is the sender and `cast.ts` carries the message. AirPlay is a
 * property of the `<video>` element: Safari routes the element it is already
 * decoding, and this app's only part is to ask for the picker and to know
 * whether there is anywhere to send it.
 *
 * **Which is why it is here rather than in `src/device/`.** The device layer's
 * rule is about `navigator`, `window.chrome` and the user agent, and nothing
 * below reads any of them — it is all `video.remote` and
 * `video.webkitShowPlaybackTargetPicker`, properties of an element the player
 * owns, the same way `requestPictureInPicture` is called straight on the
 * element in `player.tsx`. `playbackTargets().airPlay` is still the device
 * layer's, and it is still what decides whether to offer this at all.
 *
 * **Two generations of API**, and `decisions.md` §8 says which comes first:
 * the standard Remote Playback API (Safari 13.1+), with the WebKit-prefixed
 * pair behind it for older Safari. The fallback's availability event carries a
 * **string**, not a boolean, which is the one trap in this file.
 */

/** Which of the two generations an element has, if either. */
export type AirPlayApi = 'remote-playback' | 'webkit' | 'none';

/**
 * The standard API, as much of it as is used here. Declared rather than taken
 * from the DOM types because `HTMLMediaElement.remote` is not in the lib this
 * project compiles against, and the WebKit pair is in no lib at all.
 */
type RemotePlayback = {
  watchAvailability(callback: (available: boolean) => void): Promise<number>;
  cancelWatchAvailability(id: number): Promise<void>;
  prompt(): Promise<void>;
};

type AirPlayElement = {
  remote?: Partial<RemotePlayback>;
  webkitShowPlaybackTargetPicker?: () => void;
};

function apis(video: HTMLVideoElement): AirPlayElement {
  return video as unknown as AirPlayElement;
}

export function airPlayApiFor(video: HTMLVideoElement): AirPlayApi {
  const element = apis(video);
  // The standard one first, which is what "prefer" means: Safari 13.1 and
  // later has both, so an element with both is the common case on a Mac.
  if (typeof element.remote?.watchAvailability === 'function') return 'remote-playback';
  if (typeof element.webkitShowPlaybackTargetPicker === 'function') return 'webkit';
  return 'none';
}

/**
 * Watches for somewhere to AirPlay to, and hands back the way to stop.
 *
 * The button is drawn from what this reports rather than from the capability
 * alone, because the capability can only say that Safari has the API: a house
 * with no Apple TV in it would otherwise get a control that opens an empty
 * picker. MDN's own pattern, and the same shape as the Cast SDK's device
 * discovery.
 *
 * Stopping is not optional. A quality or sound choice re-negotiates and
 * attaches a new source, and a watch left running is Safari holding a
 * callback into a player that no longer exists.
 */
export function watchAirPlayTargets(
  video: HTMLVideoElement,
  onAvailability: (available: boolean) => void,
): () => void {
  const element = apis(video);

  switch (airPlayApiFor(video)) {
    case 'remote-playback': {
      const remote = element.remote as RemotePlayback;
      let watch: number | undefined;
      let stopped = false;
      remote.watchAvailability(onAvailability).then(
        (id) => {
          // Stopped before the watch was even established: cancel it at once
          // rather than leaving one nobody will ever cancel.
          if (stopped) {
            void remote.cancelWatchAvailability(id).catch(() => undefined);
            return;
          }
          watch = id;
        },
        () => {
          /*
           * A browser that will not watch continuously is not a browser with
           * no AirPlay — it is one that cannot answer in advance. MDN says to
           * show the button and let the press find out, and that is the right
           * way round: a button that opens an empty picker costs a User one
           * press, where a hidden one costs them the feature.
           */
          if (!stopped) onAvailability(true);
        },
      );
      return () => {
        stopped = true;
        if (watch === undefined) return;
        void remote.cancelWatchAvailability(watch).catch(() => undefined);
      };
    }

    case 'webkit': {
      const changed = (event: Event): void => {
        /*
         * **A string, not a boolean.** Apple's own release note has
         * `event.availability === "available"` / `"not-available"`, and both
         * are truthy — so reading it as a boolean shows the button in a house
         * with nothing to send to, and it looks exactly like a working one
         * until it is pressed.
         */
        const { availability } = event as Event & { availability?: string };
        onAvailability(availability === 'available');
      };
      video.addEventListener('webkitplaybacktargetavailabilitychanged', changed);
      return () => {
        video.removeEventListener('webkitplaybacktargetavailabilitychanged', changed);
      };
    }

    default:
      // Nothing to watch, which is not a failure: there is no button either.
      return () => undefined;
  }
}

/**
 * Opens Safari's own picker, and says whether there was one to open.
 *
 * It must be called out of a User's press. Both APIs require a gesture, the
 * same way `requestPictureInPicture` does, so this is never reached from an
 * effect.
 *
 * A dismissed picker **rejects**, and that is swallowed: a User who changed
 * their mind has met nothing to be told about, and the Title is still playing
 * on this device.
 */
export function showAirPlayPicker(video: HTMLVideoElement): boolean {
  const element = apis(video);

  switch (airPlayApiFor(video)) {
    case 'remote-playback':
      (element.remote as RemotePlayback).prompt().catch(() => undefined);
      return true;

    case 'webkit':
      (element.webkitShowPlaybackTargetPicker as () => void)();
      return true;

    default:
      return false;
  }
}
