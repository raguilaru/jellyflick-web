import { useRef, useState } from 'preact/hooks';
import type { Artwork, EpisodeDetails } from '../catalogue/catalogue';
import { CardProgress } from '../home/row';
import { useTranslate, type Translate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import type { SeriesSeason } from './series';

/**
 * A Series' Seasons and Episodes on its title page (#18, story 71): the picker,
 * the list under it, and the one press that marks an Episode watched.
 *
 * Every rule about *which* Episode is in `series.ts`; this draws the answer.
 *
 * **The arrow keys need nothing of their own here.** The picker is a group of
 * buttons, reached geometrically the way Search's genre chips are — Left and
 * Right step along the Seasons — and it is deliberately **not** a
 * `data-focus-group`: a Season is picked once and there is nothing to come back
 * to. The Episodes are a *vertical* list, which is what lets each one carry two
 * focus stops where a card in a horizontal Row cannot (see `src/navigation/`):
 * Down steps through the Episode and then its watched toggle, which is the
 * geometry `nearest.ts` already gives, rather than reading a line of cards.
 *
 * **Which Season is shown to begin with is the Season the User is up to**, not
 * the first: it is where Play would start, so the list opens on the Episode the
 * page's own Play button means.
 */

export type SeriesEpisodesProps = {
  gateway: JellyfinGateway;
  seasons: readonly SeriesSeason[];
  /** The Episode Play would start, which is the Season shown first. */
  upTo?: EpisodeDetails;
  /** Plays one Episode: the page owns the player, as it does for a Movie. */
  onPlayEpisode: (episode: EpisodeDetails) => void;
};

export function SeriesEpisodes({ gateway, seasons, upTo, onPlayEpisode }: SeriesEpisodesProps) {
  const t = useTranslate();
  const chosen = useChosenSeason(seasons, upTo);
  const watched = useEpisodesWatched(gateway);

  if (seasons.length === 0) return <p class="notice">{t('title.noEpisodes')}</p>;

  const season = seasons.find((candidate) => candidate.id === chosen.id) ?? seasons[0];
  if (season === undefined) return null;

  return (
    <section class="series">
      {/*
        One Season is always chosen, so these are toggle buttons rather than
        tabs: `aria-pressed` says which, and the arrow keys reach each one
        without the roving tabindex a tablist would want.
      */}
      <div class="series__seasons" role="group" aria-label={t('title.seasons')}>
        {seasons.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            class="button button--quiet series__season"
            aria-pressed={candidate.id === season.id}
            onClick={() => {
              chosen.choose(candidate.id);
            }}
          >
            {nameOfSeason(candidate, t)}
          </button>
        ))}
      </div>

      <ol class="series__episodes" aria-label={t('title.episodes')}>
        {season.episodes.map((detail) => (
          <li class="episode" key={detail.episode.itemId}>
            <button
              type="button"
              class="episode__press"
              onClick={() => {
                onPlayEpisode(detail);
              }}
            >
              {detail.thumbnail === undefined ? null : (
                <img
                  class="episode__still"
                  src={stillUrl(gateway, detail.thumbnail)}
                  alt=""
                />
              )}
              <span class="episode__name">
                {t('title.episodeName', {
                  ...(detail.episode.episodeNumber === undefined
                    ? {}
                    : { number: detail.episode.episodeNumber }),
                  name: detail.episode.name,
                })}
              </span>
              {detail.runtimeMinutes === undefined ? null : (
                <span class="episode__length">
                  {t('title.runtime', { minutes: detail.runtimeMinutes })}
                </span>
              )}
            </button>

            {/* The same bar a card carries, and for the same reason: how much
                is left is the point of it, so it is a `progressbar` and not a
                styled `<div>`. A next-up Episode has no bar at all here —
                unlike on a card, where a bar at zero is what says the Episode
                is the one coming up. */}
            <CardProgress progress={detail.playback.progress} />

            {detail.overview === undefined ? null : (
              <p class="episode__overview">{detail.overview}</p>
            )}

            <button
              type="button"
              class="button button--quiet episode__watched"
              aria-pressed={watched.isWatched(detail)}
              onClick={() => {
                watched.toggle(detail);
              }}
            >
              {watched.isWatched(detail)
                ? t('title.markNotWatched', { name: detail.episode.name })
                : t('title.markWatched', { name: detail.episode.name })}
            </button>
          </li>
        ))}
      </ol>

      {watched.unsaved ? (
        <p class="notice notice--problem" role="alert">
          {t('title.watchedUnsaved')}
        </p>
      ) : null}
    </section>
  );
}

/**
 * What the player is told it is playing: the Series and then the Episode. It is
 * here rather than in the screen because it is the one thing both the page's
 * Play button and a press in the list need to agree on.
 */
export function playingNameOf(
  seriesName: string,
  episode: EpisodeDetails,
  t: Translate,
): string {
  return t('title.episodePlaying', { series: seriesName, episode: episode.episode.name });
}

/** A Season's name: the Server's own, or its number when it holds no item. */
function nameOfSeason(season: SeriesSeason, t: Translate): string {
  if (season.name !== undefined) return season.name;
  if (season.seasonNumber !== undefined) {
    return t('title.seasonNumber', { number: season.seasonNumber });
  }
  return t('title.otherEpisodes');
}

/** How wide an Episode's still is asked for, which is a list row's worth. */
const STILL_WIDTH = 320;

function stillUrl(gateway: JellyfinGateway, thumbnail: Artwork): string {
  return gateway.itemImageUrl(thumbnail.itemId, 'Primary', {
    tag: thumbnail.imageTag,
    maxWidth: STILL_WIDTH,
  });
}

/**
 * Which Season the list is showing. It is screen state and not an address, the
 * call Search's genres made (#24): Back is the browser's back button everywhere
 * in this app, and a Season that pushed a history entry would make Back mean
 * "the Season before this one" on a page Back is supposed to close.
 *
 * Until the User picks one it is the Season holding the Episode they are up to,
 * recomputed as the page's answer arrives — so the list is never showing
 * Season 1 of a show somebody is half way through.
 */
function useChosenSeason(
  seasons: readonly SeriesSeason[],
  upTo: EpisodeDetails | undefined,
): { id: string | undefined; choose: (id: string) => void } {
  const [picked, setPicked] = useState<string | undefined>(undefined);
  // Which Series' choice this is, so pressing a card in More like this does not
  // carry the last Series' Season over to the next one.
  const seriesOfChoice = useRef(upTo?.episode.series.itemId);
  if (seriesOfChoice.current !== upTo?.episode.series.itemId) {
    seriesOfChoice.current = upTo?.episode.series.itemId;
    setPicked(undefined);
  }

  if (picked !== undefined) return { id: picked, choose: setPicked };

  const holdingUpTo = seasons.find((season) =>
    season.episodes.some((detail) => detail.episode.itemId === upTo?.episode.itemId),
  );
  return { id: holdingUpTo?.id, choose: setPicked };
}

/**
 * Whether each Episode has been watched, and the one press that changes it
 * (story 78, this time per Episode).
 *
 * It is local to this list rather than a store, as the Title's own watched mark
 * is (#17): the change shows before the Server has agreed to it and is taken
 * back with a line that says so. What the Server said is the Episode's own
 * `playback.played`, so this holds only the Episodes a User has pressed —
 * which means a page re-read picks up the Server's answer by itself.
 */
function useEpisodesWatched(gateway: JellyfinGateway): {
  isWatched: (detail: EpisodeDetails) => boolean;
  unsaved: boolean;
  toggle: (detail: EpisodeDetails) => void;
} {
  const [pressed, setPressed] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [unsaved, setUnsaved] = useState(false);

  const isWatched = (detail: EpisodeDetails): boolean =>
    pressed.get(detail.episode.itemId) ?? detail.playback.played;

  const remember = (itemId: string, value: boolean | undefined): void => {
    // Computed from the map as it is, not from the one this render saw: two
    // presses in one tick would otherwise lose the first.
    setPressed((before) => {
      const next = new Map(before);
      if (value === undefined) next.delete(itemId);
      else next.set(itemId, value);
      return next;
    });
  };

  const toggle = (detail: EpisodeDetails): void => {
    const itemId = detail.episode.itemId;
    const wanted = !isWatched(detail);
    remember(itemId, wanted);
    setUnsaved(false);
    void (wanted ? gateway.markPlayed(itemId) : gateway.markUnplayed(itemId)).then(
      () => undefined,
      () => {
        // The Server refused it, so the Episode goes back to what the Server
        // said rather than claiming a change the Server does not have —
        // forgetting the press, not storing its opposite.
        remember(itemId, undefined);
        setUnsaved(true);
      },
    );
  };

  return { isWatched, unsaved, toggle };
}
