import { useEffect, useRef, useState } from 'preact/hooks';
import type { TitleDetails } from '../catalogue/catalogue';
import type { DeviceLayer } from '../device/types';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { planPlayback } from '../playback/planning';
import { Player } from '../playback/player';
import { attachPlaybackSource } from '../playback/video-source';
import { useSettings } from '../settings/settings-provider';
import { resolvePlayTarget, type PlayTarget } from '../title/play-target';
import { loadBillboardTrailer } from './billboard-sources';
import { useOpenTitle } from './open-title';
import { useBillboard } from './use-billboard';

/**
 * The Billboard: the one Title at the top of Home, large (#16, stories 22 to
 * 27).
 *
 * Which Title it is, and when that changes, is `use-billboard.ts` — the pick is
 * held above the router so a trip to the title page cannot disturb it. This
 * file is only what a User sees:
 *
 * - **The backdrop is the Billboard**, with the Title's logo and words over it.
 *   A Title with no logo is headed by its own name **in the logo font**, so the
 *   heading still reads as artwork rather than as a heading whose image failed
 *   (story 23).
 * - **The trailer is an improvement on the backdrop, never a replacement for
 *   it.** The backdrop stays in the document underneath, so a trailer that
 *   never arrives, is turned off, or will not play leaves a Billboard that
 *   looks finished rather than an empty player (story 25).
 * - **It makes no sound by itself.** The trailer starts muted after a short
 *   delay and the User can unmute it, pause it, or turn the whole thing off in
 *   their settings (stories 24, 26 and 27).
 * - **Play and More info are the two things to do**, and neither is a second
 *   way to do something: Play opens the same player the title page's does, and
 *   More info opens the same title page a card does.
 */

/**
 * How long the backdrop is left alone before the trailer starts. Long enough
 * that a User passing through Home — on their way to Search, or to a Title they
 * already had in mind — never sets a video going at all.
 */
export const BILLBOARD_TRAILER_DELAY_MS = 1200;

/** How wide a backdrop is asked for: a 1080p screen, and no wider. */
const BACKDROP_WIDTH = 1920;

/** How wide a logo is asked for. A logo is artwork, not a full-bleed picture. */
const LOGO_WIDTH = 600;

export type BillboardProps = {
  gateway: JellyfinGateway;
  /** Whose playback this is, for the trailer and for Play. */
  userId: string;
  /** Where the trailer's capabilities and the player's keys come from. */
  device: DeviceLayer;
  /**
   * What level the featured Title's name is a heading at. Level 1 on Home,
   * where the Billboard *is* what the screen is about; level 2 in the Movies
   * and Series sections (#23), where the screen is about the section and the
   * section's own name is its level 1. Two level-1 headings in one `<main>`
   * would leave a screen reader with two answers to "what is this page".
   */
  headingLevel?: 1 | 2;
};

export function Billboard({ gateway, userId, device, headingLevel }: BillboardProps) {
  const t = useTranslate();
  const { result } = useBillboard();

  // Still reading. Nothing is drawn rather than a placeholder the size of a
  // Billboard: Home's Rows are worth more than a grey box above them.
  if (result === undefined) return null;

  if (result.outcome === 'unavailable') {
    return (
      <p class="notice notice--problem" role="alert">
        {t('billboard.unavailable')}
      </p>
    );
  }
  // A library with nothing that can be drawn as a Billboard. An ordinary state
  // — a brand new Server, or one whose Titles have no artwork yet — so Home
  // simply starts at its Rows.
  if (result.outcome === 'empty') return null;

  return (
    <FeaturedTitle
      feature={result.feature}
      gateway={gateway}
      userId={userId}
      device={device}
      {...(headingLevel === undefined ? {} : { headingLevel })}
    />
  );
}

function FeaturedTitle({
  feature,
  gateway,
  userId,
  device,
  headingLevel = 1,
}: BillboardProps & { feature: TitleDetails }) {
  const t = useTranslate();
  const openTitle = useOpenTitle();
  /**
   * What the player over the Billboard is playing, and nothing when there is no
   * player. A value rather than a flag for the reason `play-target.ts` gives: a
   * featured Series holds no file, so its Play means an Episode (#18's rule,
   * which this Billboard has to honour too).
   */
  const [playing, setPlaying] = useState<PlayTarget | undefined>(undefined);
  /** Said when a featured Series turns out to have no Episode to play. */
  const [nothingToPlay, setNothingToPlay] = useState(false);
  const { title, backdrop, logo, overview, ageRating } = feature;
  // The tag, not a class: the level is what a screen reader reads, so it has
  // to be the element itself rather than something that merely looks like it.
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section class="billboard" aria-label={t('billboard.region')}>
      {backdrop === undefined ? null : (
        // Decorative: the heading beside it already names the Title, so a
        // screen reader has nothing to gain from the picture.
        <img
          class="billboard__backdrop"
          src={gateway.itemImageUrl(backdrop.itemId, 'Backdrop', {
            tag: backdrop.imageTag,
            maxWidth: BACKDROP_WIDTH,
          })}
          alt=""
        />
      )}

      <BillboardTrailer
        titleId={title.itemId}
        gateway={gateway}
        userId={userId}
        device={device}
      />

      <div class="billboard__words">
        {/* The Title's name, as artwork where the Server has a logo for it and
            in the logo font where it does not. One heading either way, so the
            Title is named once however it is drawn. */}
        <Heading class="billboard__title">
          {logo === undefined ? (
            <span class="billboard__name">{title.name}</span>
          ) : (
            <img
              class="billboard__logo"
              src={gateway.itemImageUrl(logo.itemId, 'Logo', {
                tag: logo.imageTag,
                maxWidth: LOGO_WIDTH,
              })}
              alt={title.name}
            />
          )}
        </Heading>

        {/* Left out rather than drawn empty when the Server did not say, the
            way the title page leaves out a label with nothing after it. */}
        {ageRating === undefined ? null : (
          <p class="billboard__rating">{ageRating}</p>
        )}
        {overview === undefined ? null : (
          <p class="billboard__overview">{overview}</p>
        )}

        <p class="billboard__actions">
          <button
            type="button"
            class="button billboard__play"
            onClick={() => {
              setNothingToPlay(false);
              // A Movie answers at once; only a Series costs a read, and only
              // because its Play means the Episode the User is up to.
              void resolvePlayTarget(gateway, feature, t).then((target) => {
                if (target === undefined) setNothingToPlay(true);
                else setPlaying(target);
              });
            }}
          >
            {t('billboard.play')}
          </button>
          <button
            type="button"
            class="button button--quiet billboard__more-info"
            onClick={() => openTitle({ titleId: title.itemId })}
          >
            {t('billboard.moreInfo')}
          </button>
        </p>
      </div>

      {nothingToPlay ? (
        <p class="notice notice--problem" role="alert">
          {t('billboard.nothingToPlay')}
        </p>
      ) : null}

      {playing === undefined ? null : (
        <Player
          // Keyed on what is playing: see the note at the title page's own
          // Player, which #31 put there for the next Episode's sake.
          key={playing.itemId}
          gateway={gateway}
          device={device}
          userId={userId}
          itemId={playing.itemId}
          titleName={playing.name}
          // Where this User left off: the Billboard's own query read it for a
          // Movie, and `play-target.ts` read the Episode's own for a Series.
          {...(playing.resumeTicks === undefined ? {} : { resumeTicks: playing.resumeTicks })}
          // A Series the Billboard featured binges on from Home, the same as
          // from its title page: `resolvePlayTarget` already answered an
          // Episode, and an Episode knows its Series (#31).
          {...(playing.seriesId === undefined ? {} : { seriesId: playing.seriesId })}
          onPlayNext={setPlaying}
          onClose={() => setPlaying(undefined)}
        />
      )}
    </section>
  );
}

/**
 * The trailer over the backdrop (stories 24, 26 and 27).
 *
 * It is deliberately **not** the player: a trailer on Home is decoration that
 * the User did not ask for, so nothing about it is reported to the Server, it
 * has no controls of its own beyond sound and pause, and it never covers the
 * words. It does share the player's two hard parts — asking the Server how to
 * play something, and getting that into a `<video>` — because those are one
 * correct answer per device and not this screen's to re-derive.
 */
function BillboardTrailer({
  titleId,
  gateway,
  userId,
  device,
}: {
  titleId: string;
  gateway: JellyfinGateway;
  userId: string;
  device: DeviceLayer;
}) {
  const t = useTranslate();
  const { settings } = useSettings();
  const autoplay = settings.billboardTrailerAutoplay;

  /** The trailer's own item id, once the Server has been asked for one. */
  const [trailerId, setTrailerId] = useState<string | undefined>(undefined);
  /** Whether the delay has passed, which is what puts the video in the document. */
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  /**
   * Whether the User has paused it. It is what they *want*, not what the
   * element is doing: the element may not have a source yet, and a browser may
   * refuse to play without a gesture. An effect below applies this to the
   * element, so pressing the control always does what the control says.
   */
  const [paused, setPaused] = useState(false);
  /** Set once there is something to play, so applying `paused` has a source. */
  const [sourceAttached, setSourceAttached] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);

  // Ask for a trailer, unless the User has turned the whole thing off — in
  // which case there is nothing to ask about.
  useEffect(() => {
    if (!autoplay) {
      setTrailerId(undefined);
      setStarted(false);
      return undefined;
    }

    let abandoned = false;
    setTrailerId(undefined);
    setStarted(false);
    void loadBillboardTrailer(gateway, titleId).then((found) => {
      if (abandoned || found.outcome !== 'trailer') return;
      setTrailerId(found.itemId);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so the Title is the dependency.
  }, [titleId, autoplay]);

  // The short delay. It starts only once there is a trailer to start, so a
  // Title without one costs nothing and a timer is never left for a Billboard
  // that has moved on.
  useEffect(() => {
    if (trailerId === undefined) return undefined;
    const timer = setTimeout(() => {
      setStarted(true);
    }, BILLBOARD_TRAILER_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [trailerId]);

  // Negotiate and attach, once the video is in the document. Nothing is
  // reported to the Server: see the note above.
  useEffect(() => {
    const element = video.current;
    if (!started || trailerId === undefined || element === null) return undefined;

    let abandoned = false;
    let attached: { detach: () => void } | undefined;

    void planPlayback(gateway, { itemId: trailerId, userId, device }).then((attempt) => {
      if (abandoned || attempt.outcome !== 'play') return;
      void attachPlaybackSource(element, attempt.plan, {
        capabilities: device.videoCapabilities(),
      }).then((source) => {
        if (abandoned) {
          // The Billboard moved on while the Server was answering: let go
          // rather than leave an element downloading for nobody.
          source.detach();
          return;
        }
        attached = source;
        setSourceAttached(true);
      });
    });

    return () => {
      abandoned = true;
      setSourceAttached(false);
      attached?.detach();
    };
  }, [started, trailerId, userId, device]);

  // Muting is a property rather than an attribute, so it is set on the element
  // as well as rendered — and it is set every time, because a newly attached
  // source must never arrive unmuted.
  useEffect(() => {
    const element = video.current;
    if (element !== null) element.muted = muted;
  }, [muted, started, sourceAttached]);

  /**
   * What the User wants, applied to the element: playing unless they paused it.
   *
   * It is an effect rather than something the button does directly, so the two
   * can never disagree — the control said "pause" and the element had no
   * source yet, which would otherwise start it instead.
   */
  useEffect(() => {
    const element = video.current;
    if (element === null || !sourceAttached) return;
    if (paused) element.pause();
    else startQuietly(element);
  }, [paused, sourceAttached]);

  if (!started || trailerId === undefined) return null;

  return (
    <>
      {/* Decorative, and hidden from a screen reader: it is the backdrop
          moving, and the Title is named by the heading. */}
      <video
        class="billboard__trailer"
        ref={video}
        // Muted from the very first render, not once an effect has run: a
        // Billboard that made a sound before being quietened would be worse
        // than one that never spoke.
        muted={muted}
        // Never full-screen on a phone just because it started playing.
        playsInline
        aria-hidden="true"
      />
      <p class="billboard__trailer-controls">
        <button
          type="button"
          class="button button--quiet billboard__mute"
          onClick={() => setMuted(!muted)}
        >
          {t(muted ? 'billboard.unmute' : 'billboard.mute')}
        </button>
        <button
          type="button"
          class="button button--quiet billboard__pause"
          onClick={() => setPaused(!paused)}
        >
          {t(paused ? 'billboard.playTrailer' : 'billboard.pauseTrailer')}
        </button>
      </p>
    </>
  );
}

/**
 * Starts the element and swallows a refusal. A browser is entitled to refuse
 * to play without a gesture, and on the Billboard that is not an error worth
 * showing anybody: the backdrop underneath is already the answer.
 */
function startQuietly(element: HTMLVideoElement): void {
  try {
    const started: unknown = element.play();
    if (started instanceof Promise) started.catch(() => undefined);
  } catch {
    // Nothing to do: the backdrop stands.
  }
}
