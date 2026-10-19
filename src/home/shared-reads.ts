import { createContext } from 'preact';
import { useContext, useRef } from 'preact/hooks';

/**
 * One read of the Server, shared by everything on the screen that wants it
 * (#41).
 *
 * A Billboard Source asks its Row's **own loader**, which is what makes #22
 * correct: Resume inherits Continue Watching's three-read merge, its
 * one-entry-per-Title rule and its hidden-Series behaviour without a second
 * copy of any of them. The cost was that the reads were made again — Home with
 * Resume featured and Continue Watching on it asked the Server the same three
 * questions twice, on the one screen every session opens with.
 *
 * **What is shared is the read, never the rules.** This module knows nothing
 * about Rows, Titles or the Billboard: a loader asks for its answer by a key it
 * writes itself, and the second caller to ask for that key is handed the first
 * one's promise. So the Billboard still goes through `loadContinueWatching`,
 * and the one place Continue Watching's rules live is still
 * `continue-watching.ts`. A fix that copied the Row's rules into the Billboard
 * would have dropped the same number of reads and been the wrong fix.
 *
 * **It is one screen's cache and nothing longer.** `useSharedReadsFor` makes a
 * fresh one whenever the address, the Server or the User changes, which is
 * exactly when a Row re-reads anyway: Home unmounts on a navigation and reads
 * itself again on the way back, and a cache that outlived that would show a
 * household what its Server said some screens ago. Nothing here expires, is
 * invalidated or is written to — the lifetime *is* the invalidation.
 */

/** Whether an answer is still wanted. Nothing says otherwise by default. */
const ALWAYS = (): boolean => true;

export type SharedReads = {
  /**
   * The answer to `key`, asked once however many callers want it.
   *
   * `load` is handed a `stillWanted` that is true while **any** caller still
   * wants the answer, which is what `loadBecauseYouWatched` asks the Server
   * twice in sequence for: a Row that has gone must not go on asking, and a
   * Billboard that joined the same read must not be cut off because the Row
   * left. A caller with no opinion passes none and counts as still wanting it.
   */
  once<T>(
    key: string,
    load: (stillWanted: () => boolean) => Promise<T>,
    stillWanted?: () => boolean,
  ): Promise<T>;
};

/**
 * No sharing at all: every caller reads for itself.
 *
 * This is what a loader called outside the shell gets — a unit test of one
 * loader, and anything that has not been given a cache — so sharing is an
 * optimisation a screen opts into rather than a thing every call site has to
 * know about.
 */
export const NO_SHARED_READS: SharedReads = {
  once: (_key, load, stillWanted) => load(stillWanted ?? ALWAYS),
};

export function createSharedReads(): SharedReads {
  /** Each answer in flight or already given, and who is still waiting on it. */
  const asked = new Map<string, { answer: Promise<unknown>; wanted: (() => boolean)[] }>();

  return {
    once<T>(
      key: string,
      load: (stillWanted: () => boolean) => Promise<T>,
      stillWanted?: () => boolean,
    ): Promise<T> {
      const joined = asked.get(key);
      if (joined !== undefined) {
        joined.wanted.push(stillWanted ?? ALWAYS);
        return joined.answer as Promise<T>;
      }

      const wanted = [stillWanted ?? ALWAYS];
      const answer = load(() => wanted.some((asking) => asking())).catch((reason: unknown) => {
        // A read that threw is not an answer to keep: the next caller should
        // be able to ask the Server again rather than inherit the failure.
        // Every loader here catches its own failures, so this is the guard for
        // the one that one day does not.
        asked.delete(key);
        throw reason;
      });

      asked.set(key, { answer, wanted });
      return answer;
    },
  };
}

/**
 * The default is no sharing, so a Row drawn outside the shell still reads the
 * Server for itself.
 */
const SharedReadsContext = createContext<SharedReads>(NO_SHARED_READS);

export const SharedReadsProvider = SharedReadsContext.Provider;

/** The cache this screen is reading through. */
export function useSharedReads(): SharedReads {
  return useContext(SharedReadsContext);
}

/**
 * One cache per `identity`, which the shell builds from the address, the
 * Server and the User.
 *
 * It is replaced **during render** rather than in an effect, and that is
 * load-bearing: a child's effect runs before its parent's, so a cache cleared
 * in an effect here would be cleared after the Rows below had already filled
 * it, and the first screen after every navigation would read everything twice.
 */
export function useSharedReadsFor(identity: string): SharedReads {
  const current = useRef<{ identity: string; reads: SharedReads } | undefined>(undefined);
  if (current.current === undefined || current.current.identity !== identity) {
    current.current = { identity, reads: createSharedReads() };
  }
  return current.current.reads;
}
