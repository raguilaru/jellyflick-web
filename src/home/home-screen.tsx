import { useState } from 'preact/hooks';
import type { TitleDetails } from '../catalogue/catalogue';
import type { DeviceLayer } from '../device/types';
import { useTranslate } from '../i18n/index';
import { Player } from '../playback/player';
import type { Session, SignedInUser } from '../session/session';
import { HOME_LAYOUT_PATH } from '../settings/home-layout-screen';
import { useSettings } from '../settings/settings-provider';
import { resolvePlayTarget, type PlayTarget } from '../title/play-target';
import { Billboard } from './billboard';
import { CardActionsProvider } from './card-actions';
import { rowKeyOf, visibleRows } from './home-layout';
import { HomeRowFor, isRowBuilt } from './home-rows';

export type HomeScreenProps = {
  user: SignedInUser;
  session: Session;
  /**
   * For the Billboard: its trailer asks the device what it can play, and its
   * Play button opens the player, which reads the remote's keys (#16).
   */
  device: DeviceLayer;
};

/**
 * Where a signed-in User lands: their Rows, in their order.
 *
 * Which Rows those are is the User's Home Layout, kept on the Server so it
 * follows them to every device (#10). Home reads it from the settings the shell
 * holds rather than from the Server itself, so an edit shows here at once.
 *
 * A Row whose feature is not built yet is left out rather than drawn empty —
 * see `home-rows.tsx`.
 *
 * Above the Rows is the Billboard (#16). Which Title it features is **not**
 * Home's state: it is held in the shell, because opening a title page unmounts
 * Home and the featured Title has to be the same one on the way back — see
 * `use-billboard.ts`.
 *
 * **What a card's Play is playing is Home's**, not the card's (#21). The
 * pointer leaves an enlarged card the moment it moves towards the picture, so
 * the card cannot be what holds the player — the same reason the Billboard
 * holds its own. Home is also where "there is no Episode to play" has somewhere
 * to be said, which a card the pointer has already left does not.
 */
export function HomeScreen({ user, session, device }: HomeScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const { settings, loaded } = useSettings();

  /** What the player over Home is playing, and nothing when there is none. */
  const [playing, setPlaying] = useState<PlayTarget | undefined>(undefined);
  /** Said when a card's Series turns out to have no Episode to play. */
  const [nothingToPlay, setNothingToPlay] = useState(false);

  const rows = visibleRows(settings.homeLayout).filter((row) => isRowBuilt(row.kind));

  return (
    <main class="screen">
      <Billboard gateway={gateway} userId={user.userId} device={device} />

      <p class="notice">{t('home.signedInAs', { name: user.name })}</p>

      <p class="home__edit">
        <a class="button button--quiet" href={HOME_LAYOUT_PATH}>
          {t('homeLayout.heading')}
        </a>
      </p>

      <CardActionsProvider
        actions={{
          gateway,
          userId: user.userId,
          device,
          play: (details: TitleDetails) => {
            setNothingToPlay(false);
            // A Movie answers at once; only a Series costs a read, and only
            // because its Play means the Episode the User is up to. The
            // Billboard's Play makes exactly this call, for exactly this
            // reason (`src/title/play-target.ts`).
            void resolvePlayTarget(gateway, details, t).then((target) => {
              if (target === undefined) setNothingToPlay(true);
              else setPlaying(target);
            });
          },
        }}
      >
        {rows.map((row) => (
          // Keyed by the Row's identity rather than its kind: a User can have
          // several genre Rows, and two of them must not share a key.
          <HomeRowFor
            key={rowKeyOf(row)}
            row={row}
            gateway={gateway}
            readKey={`${gateway.serverAddress}|${user.userId}`}
          />
        ))}
      </CardActionsProvider>

      {/* Nothing to draw is only worth saying once the layout has been read:
          before that the User is looking at the defaults, not at their Home. */}
      {rows.length === 0 && loaded ? <p class="notice">{t('home.empty')}</p> : null}

      {/* The same message the Billboard shows for the same answer, and
          deliberately its key: a featured Series and a Series on a card with no
          Episode to play are one fact said once. */}
      {nothingToPlay ? (
        <p class="notice notice--problem" role="alert">
          {t('billboard.nothingToPlay')}
        </p>
      ) : null}

      {playing === undefined ? null : (
        <Player
          // Keyed on what is playing, as the Billboard's and the title page's
          // are: the next Episode (#31) really is a new player.
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
