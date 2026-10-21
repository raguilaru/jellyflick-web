import type { CastSender, CastSenderOptions, CastSession } from './types';

/**
 * The Cast sender SDK, loaded on demand (#33).
 *
 * **Nothing imports this statically.** `browser.ts` reaches it through an
 * `import()` inside `loadCastSender`, so the module — and with it the
 * `<script>` that pulls two hundred kilobytes off `gstatic.com` — is in a
 * chunk nobody fetches until a User presses Cast. That is the ticket's first
 * acceptance criterion and it is also the only way the app keeps working on a
 * LAN with no internet, which is most of what Jellyfin is used for.
 *
 * It is here rather than in `src/playback/` because of what it touches:
 * `window.chrome`, `window.cast` and `window.__onGCastApiAvailable`, which
 * only `src/device/` may read. What a receiver is *told* is Jellyfin's
 * business and stays in `src/playback/cast.ts`; this file never mentions
 * Jellyfin.
 *
 * ## The SDK's own two awkward properties, handled here and nowhere else
 *
 * - **The readiness global must exist before the script runs.** The SDK calls
 *   `window.__onGCastApiAvailable(isAvailable)` once it has initialised, so
 *   the handler is installed first and the `<script>` appended after.
 * - **`isAvailable` can be `false`**, which is not an error: it is a
 *   Chromium-family browser whose Cast implementation is missing or switched
 *   off. `decisions.md` §8's point exactly — this is the only way to find out,
 *   and it can only be found out after paying for the download.
 *
 * Both of those, and a script that will not load at all, come out of this
 * module the same way: a rejected promise. The caller has one thing to say to
 * a User either way.
 */

/**
 * `chrome.cast.ErrorCode.CANCEL`, as its own value rather than read off the
 * global: it is the one code this file compares against, the enum is a plain
 * string, and reaching for `chrome.cast.ErrorCode` would mean handling the
 * case where the SDK that just rejected is not there to be asked.
 */
const CAST_CANCELLED = 'cancel';

/**
 * The code out of whatever `requestSession()` rejected with.
 *
 * The CAF sender rejects with the bare `chrome.cast.ErrorCode` string, but the
 * base API and some Chromium derivatives reject with a `chrome.cast.Error`
 * carrying it in `code`. Both are read, because the difference decides whether
 * a User is told their cast failed, and an unrecognised shape is treated as a
 * failure — the louder of the two, and the right way round for a rejection
 * nobody has seen before.
 */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** The CAF Web Sender script, with the framework on top of the base API. */
const CAST_SENDER_SDK =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

/**
 * The slice of the SDK this file uses, declared rather than typed from
 * `@types/chrome` — which is a dependency the size of the SDK itself for four
 * calls, on a global that may not exist.
 */
type CastGlobals = {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
  chrome?: {
    cast?: {
      AutoJoinPolicy?: { ORIGIN_SCOPED?: string };
    };
  };
  cast?: {
    framework?: {
      CastContext: {
        getInstance(): {
          setOptions(options: { receiverApplicationId: string; autoJoinPolicy?: string }): void;
          requestSession(): Promise<unknown>;
          getCurrentSession(): CafSession | null;
          endCurrentSession(stopCasting: boolean): void;
        };
      };
    };
  };
};

/** The CAF session object, again only as much of it as is used. */
type CafSession = {
  sendMessage(namespace: string, message: unknown): Promise<void>;
  getCastDevice(): { friendlyName?: string } | null;
};

function globals(): CastGlobals {
  return window as unknown as CastGlobals;
}

/**
 * The load, which happens **at most once per page** however many times a User
 * casts: the script installs globals, and appending it twice would run an SDK
 * that is already running.
 *
 * Held as a promise rather than a flag so two presses in flight together get
 * the same answer rather than two scripts.
 */
let loading: Promise<boolean> | undefined;

function loadSdk(): Promise<boolean> {
  loading ??= new Promise<boolean>((resolve) => {
    // Installed **before** the script: this is how the SDK says it is ready,
    // and a handler added afterwards is a handler it has already looked for.
    globals().__onGCastApiAvailable = (isAvailable: boolean) => {
      resolve(isAvailable);
    };
    const script = document.createElement('script');
    script.src = CAST_SENDER_SDK;
    /*
     * Offline, blocked, or a Server on a LAN with no route out: never a throw,
     * just no Cast. The caller's one message covers it.
     *
     * **The cache is dropped here, and only here.** The rationale above — a
     * script appended twice would run an SDK that is already running — is
     * about a script that *ran*; this one did not, so there is nothing to run
     * twice and nothing to keep. Holding the failure would make a household
     * whose internet blinked press Cast to the same message until they
     * reloaded the page. `isAvailable === false` is left cached on purpose:
     * that is a browser whose Cast is switched off, which pressing again
     * cannot change.
     */
    script.addEventListener('error', () => {
      script.remove();
      loading = undefined;
      resolve(false);
    });
    document.head.append(script);
  });
  return loading;
}

export async function createCastSender(options: CastSenderOptions): Promise<CastSender> {
  const available = await loadSdk();
  const framework = globals().cast?.framework;
  if (!available || framework === undefined) {
    throw new Error('The Cast sender SDK is not available in this browser.');
  }

  const context = framework.CastContext.getInstance();
  /*
   * The receiver the **User's account** named, and `ORIGIN_SCOPED` auto-join
   * so a reload while a cast is running rejoins the session it left rather
   * than opening a second one.
   */
  context.setOptions({
    receiverApplicationId: options.receiverId,
    ...(globals().chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED === undefined
      ? {}
      : { autoJoinPolicy: globals().chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED }),
  });

  return {
    connect: async () => {
      try {
        await context.requestSession();
      } catch (error: unknown) {
        /*
         * **A dismissed picker and a receiver that would not start both land
         * here**, and the SDK's own error code is the only thing that tells
         * them apart. `cancel` is the dismissal and the one silence this
         * function keeps; `receiver_unavailable`, `timeout`, `session_error`
         * and the rest are failures a User is owed a word about, so they
         * rethrow and the player says what it already says for every other
         * way a cast can fail.
         *
         * Absence of a session cannot stand in for this, which is what was
         * tried first: it is equally absent after a receiver that would not
         * start, so a failed launch read as a dismissal and said nothing at
         * all.
         */
        if (errorCodeOf(error) === CAST_CANCELLED) return undefined;
        throw error;
      }

      const session = context.getCurrentSession();
      /*
       * `requestSession()` resolved and yet there is no session: not a
       * dismissal — a dismissal rejects with `cancel` above — so it is a
       * failure, and it is thrown rather than swallowed for the same reason.
       */
      if (session === null) {
        throw new Error('The Cast SDK reported a session it then did not have.');
      }
      return castSessionOf(session, context, options.namespace);
    },
  };
}

function castSessionOf(
  session: CafSession,
  context: { endCurrentSession(stopCasting: boolean): void },
  namespace: string,
): CastSession {
  return {
    // The receiver's own name, which is what a User called it when they set it
    // up. A receiver that will not say is still a receiver, so it is drawn
    // without a name rather than not drawn.
    receiverName: session.getCastDevice()?.friendlyName ?? '',
    send: (message) => session.sendMessage(namespace, message),
    // `true` stops the receiver as well as disconnecting from it: a User who
    // pressed Stop casting wants the television to stop, not to keep playing
    // with nothing driving it.
    end: () => context.endCurrentSession(true),
  };
}
