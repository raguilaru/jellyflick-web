import { useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { MyListToggle } from '../my-list/my-list-toggle';
import { useSettings } from '../settings/settings-provider';
import {
  continueWatchingRow,
  loadContinueWatching,
  withHiddenSeries,
  withoutHiddenSeries,
  type ContinueWatchingEntry,
  type ContinueWatchingRead,
} from './continue-watching';
import { useOpenTitle } from './home-rows';
import { Row, type RowCard } from './row';

/**
 * The Continue Watching Row on Home (#12, stories 35 to 39).
 *
 * The Server is read once per (Server, User) and the answer is kept as it came:
 * what the User then takes out of the Row changes *their* list, which is theirs
 * and is applied here at once rather than waited for. `continue-watching.ts`
 * holds every rule, so this component is the Server's answer, the User's list
 * and a Row.
 *
 * An empty Row draws nothing at all, where New on Jellyflick says so in words.
 * The difference is the one My List made: a User who has watched nothing yet is
 * every new User, and a notice on Home on every visit would be in the way. A
 * Server that will not answer *is* worth saying, because a Row that quietly
 * vanished would look like the app having forgotten what they were watching.
 */
export type ContinueWatchingRowProps = {
  gateway: JellyfinGateway;
  /** Changes when the User or the Server does, so the Row reads itself again. */
  readKey: string;
};

export function ContinueWatchingRow({ gateway, readKey }: ContinueWatchingRowProps) {
  const t = useTranslate();
  const openTitle = useOpenTitle();
  const { settings, change, saveFailed } = useSettings();
  const [read, setRead] = useState<ContinueWatchingRead | undefined>(undefined);
  /**
   * What the User has taken out since the Server answered. The Server's copy of
   * the Row is a read old enough to still hold it, and reading again to find
   * out what it already knows would be a round trip in front of the User.
   */
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [resetFailed, setResetFailed] = useState(false);

  useEffect(() => {
    let abandoned = false;
    setRead(undefined);
    setRemoved([]);
    setResetFailed(false);
    void loadContinueWatching(gateway).then((loaded) => {
      if (abandoned) return;
      setRead(loaded);
    });
    return () => {
      abandoned = true;
    };
    // What a User is watching belongs to one User on one Server, which is what
    // `readKey` carries: the gateway itself is rebuilt on every render.
  }, [readKey]);

  const row = useMemo(
    () =>
      read === undefined || read.outcome !== 'read'
        ? undefined
        : continueWatchingRow({ gateway, read, hidden: settings.hiddenSeries, removed }),
    [read, settings.hiddenSeries, removed, gateway.serverAddress],
  );

  /**
   * A hidden Series that has come back is a record that has done its job, and
   * leaving it would hide the Series again the next time its next Episode came
   * round. Writing it back changes `hiddenSeries`, which is what stops this
   * running twice.
   */
  const spent = row?.hiddenToForget ?? [];
  const spentKey = spent.join('|');
  useEffect(() => {
    if (spentKey === '') return;
    change({ hiddenSeries: withoutHiddenSeries(settings.hiddenSeries, spentKey.split('|')) });
    // Keyed by the records themselves rather than by the array, which is a new
    // object on every render.
  }, [spentKey]);

  const remove = (entry: ContinueWatchingEntry): void => {
    // A Series goes on the User's own list, so its next Episode stops being
    // offered until they play another one (stories 38 and 39). An Episode's own
    // resume point is the Server's, below: both happen for a part-watched
    // Episode, because clearing the point alone would leave the Server offering
    // that very Episode as the one to watch next.
    if (entry.seriesId !== undefined) {
      change({
        hiddenSeries: withHiddenSeries(settings.hiddenSeries, {
          seriesId: entry.seriesId,
          hiddenAt: entry.activityAt,
        }),
      });
    }

    if (!entry.resumable) return;
    // Taken off the Row at once and told to the Server behind it. Only the
    // position is sent, so the watched state and the play count are left
    // exactly as they were (story 37).
    setRemoved((taken) => [...taken, entry.itemId]);
    setResetFailed(false);
    void gateway
      .saveUserItemData({ itemId: entry.itemId, playbackPositionTicks: 0 })
      .catch(() => {
        // A change that reverted itself silently would look like the app losing
        // track, so the card comes back and the Row says why.
        setRemoved((taken) => taken.filter((itemId) => itemId !== entry.itemId));
        setResetFailed(true);
      });
  };

  if (read === undefined) return <p class="notice">{t('home.rowLoading')}</p>;
  if (read.outcome === 'unavailable') {
    return (
      <p class="notice notice--problem" role="alert">
        {t('continueWatching.unavailable')}
      </p>
    );
  }

  const entries = row?.entries ?? [];
  const unsaved = resetFailed || saveFailed;
  // Nothing to carry on with draws no Row — but a failed write still has
  // something to say, even if it was the last card on the Row.
  if (entries.length === 0 && !unsaved) return null;

  return (
    <>
      {unsaved ? (
        <p class="notice notice--problem" role="alert">
          {t('continueWatching.unsaved')}
        </p>
      ) : null}
      {entries.length === 0 ? null : (
        <Row
          heading={t('home.row.continueWatching')}
          cards={entries.map((entry) => entry.card)}
          onCardPress={openTitle}
          cardControl={(card) => {
            const entry = entries.find((candidate) => candidate.card.titleId === card.titleId);
            return (
              <>
                <MyListToggle card={card} />
                {entry === undefined ? null : (
                  <RemoveFromContinueWatching entry={entry} onRemove={remove} />
                )}
              </>
            );
          }}
        />
      )}
    </>
  );
}

/**
 * The control that takes one entry out of the Row (stories 37 and 38).
 *
 * It is drawn while the pointer is over the card and is deliberately not a
 * focus stop, exactly as the My List toggle beside it is: the arrow keys read a
 * Row as a line of cards, and a second stop inside each card would break that
 * (`base.css` and `src/navigation/`). The enlarged hover card (#21) is where a
 * remote finally reaches a card's controls, this one included.
 */
function RemoveFromContinueWatching({
  entry,
  onRemove,
}: {
  entry: ContinueWatchingEntry;
  onRemove: (entry: ContinueWatchingEntry) => void;
}) {
  const t = useTranslate();
  const card: RowCard = entry.card;

  return (
    <button
      type="button"
      class="card__control card__control--remove"
      aria-label={t('continueWatching.remove', { name: card.name })}
      onClick={(event) => {
        // The card around this button is a focus stop that opens the title
        // page, and this press is not a press of that.
        event.stopPropagation();
        onRemove(entry);
      }}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
