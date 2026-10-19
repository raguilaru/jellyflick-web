import { useEffect, useState } from 'preact/hooks';
import type { TitleDetails } from '../catalogue/catalogue';
import type { DeviceLayer } from '../device/types';
import { Billboard } from '../home/billboard';
import { CardActionsProvider } from '../home/card-actions';
import { rowKeyOf } from '../home/home-layout';
import { HomeRowFor } from '../home/home-rows';
import { useTranslate } from '../i18n/index';
import { Player } from '../playback/player';
import type { Session, SignedInUser } from '../session/session';
import { resolvePlayTarget, type PlayTarget } from '../title/play-target';
import { sectionLayoutFor, type TitleSection } from './sections';
import { loadTopGenres } from './top-genres';

/**
 * The Movies and Series sections (#23): Home's composition, narrowed to one
 * kind of Title.
 *
 * One component for both, because the two screens differ in exactly one fact
 * — which kind they are about — and a second copy of this file would be two
 * places for every later change to Home's composition to be made.
 *
 * - **The layout is fixed and is not the User's** (AC 1). There is no stored
 *   layout behind it and the Home Layout editor neither offers it nor knows
 *   about it: a section is a view of one kind of library, not a second Home.
 *   `sectionLayoutFor` is the whole of it, and every Row in it is drawn by
 *   Home's own registry, so a Row's rules are inherited rather than restated.
 * - **The genre Rows are the library's own** (AC 2). Nobody chose them, so the
 *   library is asked which genres most of its Movies — or its Series — are in.
 * - **The Billboard is Spotlight of that kind**, and the pick is held in the
 *   shell beside Home's, which is why nothing here reads it: opening a title
 *   page unmounts this screen, and the featured Title must be the same one on
 *   the way back. See `src/home/use-billboard.ts`.
 * - **The section names itself at level 1 and the Billboard at level 2**, so a
 *   screen reader has one answer to what the page is. On Home it is the other
 *   way round, because there the Billboard *is* what the screen is about.
 * - **What a card's Play is playing is the screen's**, as it is on Home and
 *   for the same reason: the pointer leaves an enlarged card the moment it
 *   moves towards the picture, so the card cannot be what holds the player.
 */

export type MoviesAndSeriesScreenProps = {
  section: TitleSection;
  user: SignedInUser;
  session: Session;
  device: DeviceLayer;
};

export function MoviesAndSeriesScreen({
  section,
  user,
  session,
  device,
}: MoviesAndSeriesScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const genres = useTopGenres(gateway, section, user.userId);

  /** What the player over the section is playing, and nothing when there is none. */
  const [playing, setPlaying] = useState<PlayTarget | undefined>(undefined);
  /** Said when a card's Series turns out to have no Episode to play. */
  const [nothingToPlay, setNothingToPlay] = useState(false);

  const rows = sectionLayoutFor(genres);
  /**
   * The kind is in the key as well as the User and the Server: the two
   * sections are two addresses and one component, so without it a Row would
   * carry Movies' answer into Series.
   */
  const readKey = `${gateway.serverAddress}|${user.userId}|${section.kind}`;

  return (
    <main class="screen">
      <h1 class="screen__heading">{t(section.labelKey)}</h1>

      <Billboard gateway={gateway} userId={user.userId} device={device} headingLevel={2} />

      <CardActionsProvider
        actions={{
          gateway,
          userId: user.userId,
          device,
          play: (details: TitleDetails) => {
            setNothingToPlay(false);
            void resolvePlayTarget(gateway, details, t).then((target) => {
              if (target === undefined) setNothingToPlay(true);
              else setPlaying(target);
            });
          },
        }}
      >
        {rows.map((row) => (
          <HomeRowFor
            key={rowKeyOf(row)}
            row={row}
            gateway={gateway}
            readKey={readKey}
            titleKind={section.kind}
          />
        ))}
      </CardActionsProvider>

      {/* The same message the Billboard and Home show for the same answer. */}
      {nothingToPlay ? (
        <p class="notice notice--problem" role="alert">
          {t('billboard.nothingToPlay')}
        </p>
      ) : null}

      {playing === undefined ? null : (
        <Player
          key={playing.itemId}
          gateway={gateway}
          device={device}
          userId={user.userId}
          itemId={playing.itemId}
          titleName={playing.name}
          {...(playing.resumeTicks === undefined ? {} : { resumeTicks: playing.resumeTicks })}
          {...(playing.seriesId === undefined ? {} : { seriesId: playing.seriesId })}
          onPlayNext={setPlaying}
          onClose={() => {
            setPlaying(undefined);
          }}
        />
      )}
    </main>
  );
}

/**
 * The section's genre Rows, read once per (Server, User, kind).
 *
 * They start empty, so the section draws its three fixed Rows immediately and
 * the genres arrive under them — the alternative is holding the whole screen
 * back for a query none of the Rows above it is waiting on.
 */
function useTopGenres(
  gateway: ReturnType<Session['gateway']>,
  section: TitleSection,
  userId: string,
): readonly string[] {
  const [genres, setGenres] = useState<readonly string[]>([]);
  const serverAddress = gateway.serverAddress;

  useEffect(() => {
    let abandoned = false;
    setGenres([]);
    void loadTopGenres(gateway, { kind: section.kind }).then((loaded) => {
      if (abandoned) return;
      setGenres(loaded);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so what the read is *about* is
    // the dependency, as every Row on Home does it.
  }, [serverAddress, userId, section.kind]);

  return genres;
}
