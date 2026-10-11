import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso/router';
import type { Artwork, TitleDetails } from '../catalogue/catalogue';
import { cardForTitle, Row } from '../home/row';
import { useTranslate, type Translate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { MyListToggle } from '../my-list/my-list-toggle';
import type { Session } from '../session/session';
import { useWidePointer } from '../shell/layout';
import { loadTitlePage, titlePathFor, type TitlePageResult } from './title-page';

/**
 * The title page: everything the app knows about one Title, and everything a
 * User can do to it short of playing it (#17).
 *
 * **A pop-up where there is a wide pointer, a full page everywhere else**, which
 * is `useWidePointer()` — a phone and a TV both get the page. The pop-up is
 * `position: fixed`, which is not only a look: `spatial-navigation.ts` tries the
 * page's own flow before anything fixed, and *from* inside something fixed the
 * fixed thing is the flow, so the arrow keys stay inside the pop-up without a
 * line of focus trapping here. #7 arranged that rule for exactly this screen.
 *
 * **It is still one address and one route, not an overlay over a live Home.**
 * `preact-iso`'s `Router` renders only the route that matches, so opening a
 * title page unmounts the screen behind it: the pop-up is a dialog shape over
 * the app's own background rather than over the Home that was there a moment
 * ago. The alternative — hoisting an overlay outside the `Router` and freezing
 * the previous route — would make the title page the one screen in the app that
 * is not a route, and Back would have to mean something different inside it.
 * Back is the browser's back button here as everywhere, and Home comes back
 * from the Server, which `architecture.md` already says every section does.
 *
 * Nothing on this page is a second way to do something that exists: My List is
 * `MyListToggle` over the shell's one store (#13), the card mapping is
 * `cardForTitle` (#24), and the Row is the Row (#7).
 */

export type TitleScreenProps = {
  /** The Server this Title is read from. */
  session: Session;
};

export function TitleScreen({ session }: TitleScreenProps) {
  const t = useTranslate();
  const { params } = useRoute();
  const titleId = params.itemId ?? '';
  const gateway = session.gateway();
  const wide = useWidePointer();
  const result = useTitlePage(gateway, titleId);

  return (
    <main class={wide ? 'screen title title--popup' : 'screen title'}>
      {result === undefined ? (
        <p class="notice">{t('title.loading')}</p>
      ) : result.outcome === 'unavailable' ? (
        <p class="notice notice--problem" role="alert">
          {t('title.unavailable')}
        </p>
      ) : result.outcome === 'not-found' ? (
        <p class="notice">{t('title.notFound')}</p>
      ) : (
        <TitlePage gateway={gateway} result={result} />
      )}
    </main>
  );
}

/** One Title, once the Server has said what it is. */
function TitlePage({
  gateway,
  result,
}: {
  gateway: JellyfinGateway;
  result: Extract<TitlePageResult, { outcome: 'title' }>;
}) {
  const t = useTranslate();
  const { route } = useLocation();
  const { details, page } = result;
  const { title } = details;
  const card = cardForTitle(gateway, title);
  const watched = useWatched(gateway, title.itemId, details.watched);

  return (
    <article class="title__sheet">
      {details.backdrop === undefined ? null : (
        <img
          class="title__backdrop"
          src={artworkUrl(gateway, details.backdrop, 'Backdrop', BACKDROP_WIDTH)}
          alt=""
        />
      )}

      {/* The name is the heading whether or not there is a logo: a logo is an
          image of the name, so a screen reader and a test both want the words,
          and the image stands in front of them for a User who can see it. */}
      <h1 class="title__heading">
        {details.logo === undefined ? (
          title.name
        ) : (
          <img
            class="title__logo"
            src={artworkUrl(gateway, details.logo, 'Logo', LOGO_WIDTH)}
            alt={title.name}
          />
        )}
      </h1>

      <p class="title__facts">
        {factsOf(details, t).map((fact) => (
          <span class="title__fact" key={fact}>
            {fact}
          </span>
        ))}
      </p>

      <p class="title__actions">
        {/* Present and pressable, and it is the player tickets (#25 → #28)
            that give it something to do. */}
        <button type="button" class="button button--primary">
          {t('title.play')}
        </button>
        {/* The remote and the keyboard reach My List here, which is what a
            card's hover-only toggle cannot give them (story 70). */}
        <MyListToggle card={card} />
        <button
          type="button"
          class="button button--quiet"
          aria-pressed={watched.watched}
          onClick={watched.toggle}
        >
          {watched.watched
            ? t('title.markNotWatched', { name: title.name })
            : t('title.markWatched', { name: title.name })}
        </button>
      </p>

      {watched.unsaved ? (
        <p class="notice notice--problem" role="alert">
          {t('title.watchedUnsaved')}
        </p>
      ) : null}

      {details.overview === undefined ? null : (
        <p class="title__overview">{details.overview}</p>
      )}

      <dl class="title__details">
        <Detail label={t('title.cast')} value={details.cast.map((person) => person.name)} />
        <Detail label={t('title.audio')} value={languageNames(details.audioLanguages, t)} />
        <Detail label={t('title.subtitles')} value={languageNames(details.subtitleLanguages, t)} />
        <Detail label={t('title.collection')} value={page.collections} />
      </dl>

      {page.similar.length === 0 ? null : (
        <Row
          heading={t('title.moreLikeThis')}
          cards={page.similar}
          onCardPress={(pressed) => {
            // Another title page, as its own history entry, so Back steps back
            // through the Titles a User looked at.
            route(titlePathFor(pressed.titleId));
          }}
          cardControl={(pressed) => <MyListToggle card={pressed} />}
        />
      )}
    </article>
  );
}

/**
 * One labelled list of things — the cast, the languages, the Collection. A list
 * with nothing in it is left out of the document altogether rather than drawn
 * with an empty value: a label with nothing after it reads as a Title with no
 * cast, which is not the same as a Server that did not say (story 81's rule,
 * applied past the ratings).
 */
function Detail({ label, value }: { label: string; value: readonly string[] }) {
  if (value.length === 0) return null;
  return (
    <>
      <dt class="title__label">{label}</dt>
      {/* Commas rather than `Intl.ListFormat`, which is Chrome 72 and above the
          floor. ADR 0002's own advice: write the line by hand. */}
      <dd class="title__value">{value.join(', ')}</dd>
    </>
  );
}

/**
 * The one-line facts above the description, in the order a Title is usually
 * read: when, who for, how long, what kind, and how well thought of. Every one
 * the Server left out is simply not in the line — story 81, which the Server
 * helps with for `CommunityRating` and not at all for the other two.
 */
function factsOf(details: TitleDetails, t: Translate): readonly string[] {
  const facts: string[] = [];
  if (details.year !== undefined) facts.push(String(details.year));
  if (details.ageRating !== undefined) facts.push(details.ageRating);
  if (details.runtimeMinutes !== undefined) {
    facts.push(t('title.runtime', { minutes: details.runtimeMinutes }));
  }
  if (details.genres.length > 0) facts.push(details.genres.join(', '));
  if (details.criticRating !== undefined) {
    facts.push(t('title.criticRating', { score: details.criticRating }));
  }
  if (details.communityRating !== undefined) {
    facts.push(t('title.communityRating', { score: details.communityRating }));
  }
  return facts;
}

function languageNames(codes: readonly string[], t: Translate): readonly string[] {
  return codes.map((code) => t('title.language', { code }));
}

/** How wide the artwork is asked for, which is what a 4K TV wants of each. */
const BACKDROP_WIDTH = 1920;
const LOGO_WIDTH = 480;

function artworkUrl(
  gateway: JellyfinGateway,
  artwork: Artwork,
  imageType: 'Backdrop' | 'Logo',
  maxWidth: number,
): string {
  return gateway.itemImageUrl(artwork.itemId, imageType, {
    tag: artwork.imageTag,
    maxWidth,
  });
}

/**
 * Reads the page, and reads it again when the address or the Server changes —
 * which is what pressing a card in More like this does, without unmounting this
 * screen.
 */
function useTitlePage(
  gateway: JellyfinGateway,
  titleId: string,
): TitlePageResult | undefined {
  const [result, setResult] = useState<TitlePageResult | undefined>(undefined);

  useEffect(() => {
    let abandoned = false;
    setResult(undefined);
    void loadTitlePage(gateway, titleId).then((loaded) => {
      if (abandoned) return;
      setResult(loaded);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so the address it talks to is the
    // dependency rather than the object itself.
  }, [gateway.serverAddress, titleId]);

  return result;
}

/**
 * Whether this User has watched the Title, and the one press that changes it
 * (story 78).
 *
 * The change shows before the Server has agreed to it and is taken back if the
 * Server refuses, with a line that says so — the same bargain My List makes,
 * and for the same reason: a change that reverted itself silently would look
 * like the app losing track. It is local to this screen rather than a store,
 * because nothing else on the screen shows a watched state yet; Continue
 * Watching (#12) and the enlarged card (#21) are what would make it one.
 */
function useWatched(
  gateway: JellyfinGateway,
  titleId: string,
  fromTheServer: boolean,
): { watched: boolean; unsaved: boolean; toggle: () => void } {
  const [watched, setWatched] = useState(fromTheServer);
  const [unsaved, setUnsaved] = useState(false);
  // Which Title the state belongs to, so More like this moving this screen to
  // another Title does not carry the last one's watched state with it.
  const shownFor = useRef(titleId);
  if (shownFor.current !== titleId) {
    shownFor.current = titleId;
    setWatched(fromTheServer);
    setUnsaved(false);
  }

  const toggle = (): void => {
    const wanted = !watched;
    setWatched(wanted);
    setUnsaved(false);
    void (wanted ? gateway.markPlayed(titleId) : gateway.markUnplayed(titleId)).then(
      () => undefined,
      () => {
        // The Server refused it, so the screen goes back to what the Server
        // holds rather than claiming a change it does not have.
        setWatched(!wanted);
        setUnsaved(true);
      },
    );
  };

  return { watched, unsaved, toggle };
}
