import { useTranslate } from '../i18n/index';
import { CardArtwork } from '../home/row';
import { MyListToggle } from './my-list-toggle';
import { useMyList } from './use-my-list';

/**
 * The My List page: everything in My List as a grid, where a Row shows only as
 * much as fits on one line (story 58).
 *
 * The grid is a list of the same cards a Row shows, laid out as a grid rather
 * than a strip, so nothing scrolls sideways and a long list wraps down the page.
 * Each card is a focus stop, and the arrow keys find them by geometry with no
 * help from here: a grid has no "where focus was" memory to keep, because the
 * page is the grid and leaving it unmounts it.
 *
 * Unlike a Row's card, the My List toggle here is drawn all the time and *is*
 * a focus stop. This page is for managing the list, so taking something out of
 * it has to work with a remote and a keyboard, and arriving at a card's remove
 * button with the arrow keys is the point rather than a nuisance.
 */
export function MyListScreen() {
  const t = useTranslate();
  const myList = useMyList();
  const state = myList.state();
  const titles = state.outcome === 'list' ? state.titles : undefined;

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('nav.myList')}</h1>

      {myList.unsaved() ? <p class="notice notice--problem">{t('myList.unsaved')}</p> : null}

      {titles === undefined ? (
        state.outcome === 'loading' ? (
          <p class="notice">{t('myList.loading')}</p>
        ) : (
          <p class="notice notice--problem" role="alert">
            {t('myList.unavailable')}
          </p>
        )
      ) : titles.length === 0 ? (
        <p class="notice">{t('myList.empty')}</p>
      ) : (
        <ul class="grid" aria-label={t('nav.myList')}>
          {titles.map((card) => (
            <li class="card card--managed" key={card.titleId} aria-label={card.name} tabIndex={0}>
              <CardArtwork card={card} />
              <span class="card__name">{card.name}</span>
              <MyListToggle card={card} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
