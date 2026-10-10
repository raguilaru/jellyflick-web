import { useEffect, useState } from 'preact/hooks';
import { Row } from '../home/row';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { loadGenres, titlesInGenre, type GenresResult, type TitlesResult } from './search';

/**
 * Browsing by genre, for the User who does not know what they want (story 60).
 *
 * The genres come from the Server's own `/Genres`, so nothing here reads every
 * Title to work out what there is. Picking one is the screen's state and not an
 * address of its own: Back is the browser's back button everywhere in this app,
 * and a genre that pushed a history entry would make Back mean "the genre
 * before this one" on a screen whose other half is a text field. "All genres"
 * is the way out instead, and it is a focus stop like everything else.
 */

export type GenresProps = {
  gateway: JellyfinGateway;
};

export function BrowseByGenre({ gateway }: GenresProps) {
  const t = useTranslate();
  const genres = useGenres(gateway);
  const [chosen, setChosen] = useState<string | undefined>(undefined);

  if (chosen !== undefined) {
    return <OneGenre gateway={gateway} genre={chosen} onLeave={() => setChosen(undefined)} />;
  }

  if (genres === undefined) return <p class="notice">{t('search.genresLoading')}</p>;
  if (genres.outcome === 'unavailable') {
    return (
      <p class="notice notice--problem" role="alert">
        {t('search.genresUnavailable')}
      </p>
    );
  }
  if (genres.genres.length === 0) return <p class="notice">{t('search.genresEmpty')}</p>;

  const headingId = 'search-genres';
  return (
    <section class="genres" aria-labelledby={headingId}>
      <h2 class="row__heading" id={headingId}>
        {t('search.genresHeading')}
      </h2>
      {/*
        A list, so the genres are one thing a screen reader can step through.
        Deliberately *not* a focus group: a genre is picked once and there is
        nothing to come back to, and the arrows reach each one geometrically,
        the way they reach the links in a navigation bar.
      */}
      <ul class="genres__list" aria-labelledby={headingId}>
        {genres.genres.map((genre) => (
          <li key={genre}>
            <button
              type="button"
              class="button button--quiet genres__genre"
              onClick={() => {
                setChosen(genre);
              }}
            >
              {genre}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One genre's Titles, as a strip headed by the genre's own name. */
function OneGenre({
  gateway,
  genre,
  onLeave,
}: {
  gateway: JellyfinGateway;
  genre: string;
  onLeave: () => void;
}) {
  const t = useTranslate();
  const titles = useTitlesInGenre(gateway, genre);

  return (
    <div class="stack">
      <button type="button" class="button button--quiet genres__leave" onClick={onLeave}>
        {t('search.allGenres')}
      </button>
      {titles === undefined ? (
        <p class="notice">{t('search.searching')}</p>
      ) : titles.outcome === 'unavailable' ? (
        <p class="notice notice--problem" role="alert">
          {t('search.genreUnavailable', { genre })}
        </p>
      ) : titles.titles.length === 0 ? (
        <p class="notice">{t('search.genreEmpty', { genre })}</p>
      ) : (
        // The genre's own name heads the strip, so the screen says which one is
        // being browsed without a second label for it.
        <Row heading={genre} cards={titles.titles} />
      )}
    </div>
  );
}

function useGenres(gateway: JellyfinGateway): GenresResult | undefined {
  const [genres, setGenres] = useState<GenresResult | undefined>(undefined);

  useEffect(() => {
    let abandoned = false;
    setGenres(undefined);
    void loadGenres(gateway).then((found) => {
      if (abandoned) return;
      setGenres(found);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so the address is the dependency.
  }, [gateway.serverAddress]);

  return genres;
}

function useTitlesInGenre(gateway: JellyfinGateway, genre: string): TitlesResult | undefined {
  const [titles, setTitles] = useState<TitlesResult | undefined>(undefined);

  useEffect(() => {
    let abandoned = false;
    setTitles(undefined);
    void titlesInGenre(gateway, genre).then((found) => {
      if (abandoned) return;
      setTitles(found);
    });
    return () => {
      abandoned = true;
    };
  }, [gateway.serverAddress, genre]);

  return titles;
}
