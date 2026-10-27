import { useEffect, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import {
  addableRowKinds,
  addRow,
  hideRow,
  isParameterised,
  moveRow,
  parametersFor,
  rowKeyOf,
  showRow,
  type HomeLayout,
  type HomeRow,
  type HomeRowKind,
} from '../home/home-layout';
import {
  isRowBuilt,
  ROW_CHOICE_HEADING_KEYS,
  ROW_CHOICE_KEYS,
  ROW_NAME_KEYS,
} from '../home/home-rows';
import {
  loadCollectionChoices,
  loadGenreChoices,
  type RowChoice,
  type RowChoicesResult,
} from '../home/suggestion-rows';
import type { JellyfinGateway } from '../jellyfin/gateway';
import type { Session } from '../session/session';
import { HOME_PATH } from '../shell/sections';
import { useSettings } from './settings-provider';

/**
 * The Home Layout editor: add, hide and reorder the Rows on Home (story 48).
 *
 * **Its address is not a section.** `src/shell/sections.ts` is the one list of
 * sections and this is not one of them — it is a screen reached from Home and
 * from the settings screen (#11), so it has its own route and no place in
 * either navigation bar.
 *
 * **Reordering is two buttons, not a drag.** A drag cannot be done with a
 * remote, and story 64 says every screen is usable with arrows, Enter and Back.
 * Buttons work with all three inputs at once: the arrow keys reach them because
 * `src/navigation/` reaches anything focusable, a finger and a mouse press them
 * the same way, and nothing here has to take the arrow keys away from the
 * navigator — which it must not do, because then Up and Down could not leave
 * the screen.
 *
 * Every change is saved as it is made, so there is no Save button to leave
 * unpressed. The settings provider holds the copy both screens read.
 *
 * **Some Rows need a choice before they can be added** (#15, stories 44 and
 * 45): which genre, which Collection. That choice is the Server's to offer, so
 * this is the one settings screen that reads the library — the genres and the
 * Collections, once, when it opens. They are what the picker offers, and they
 * are also how a Collection Row already in the layout gets its name, since
 * what is stored for one is an id.
 */

/** The editor's own address. Not in `SECTIONS`; see the note above. */
export const HOME_LAYOUT_PATH = '/settings/home-layout';

export type HomeLayoutScreenProps = {
  session: Session;
};

export function HomeLayoutScreen({ session }: HomeLayoutScreenProps) {
  const t = useTranslate();
  const { settings, loaded, saveFailed, change } = useSettings();
  const layout = settings.homeLayout;
  const choices = useRowChoices(session.gateway());
  /** Which kind's choices are open, if the User is picking one. */
  const [picking, setPicking] = useState<HomeRowKind | undefined>(undefined);

  /**
   * What a Row is called: its choice where it has a name of its own, and the
   * kind's name otherwise. A genre Row *is* its genre; a Collection Row stores
   * an id, so its name comes from what the Server said the Collections are —
   * and falls back to the plain kind name until that read lands.
   */
  const nameOf = (row: HomeRow): string => {
    if (row.parameter === undefined) return t(ROW_NAME_KEYS[row.kind]);
    if (row.kind === 'genre') return row.parameter;
    const known = choiceNameOf(choices[row.kind], row.parameter);
    return known ?? t(ROW_NAME_KEYS[row.kind]);
  };

  const addable = addableRowKinds(layout).filter(
    // A kind whose choices are all used up is nothing to offer. Whether any
    // are left is the Server's answer, so only this screen can tell — and
    // while that read is in flight the control stays offered rather than
    // appearing under the User's hands a moment later.
    (kind) => !isParameterised(kind) || canStillAdd(choices[kind], layout, kind),
  );

  // Nothing to press until the Server has answered. The provider starts on the
  // default layout, so buttons drawn before the read lands are buttons for
  // somebody else's Home: a press then would save the defaults, plus that one
  // change, over what the User really has. #13 found this as a lost press.
  if (!loaded) {
    return (
      <main class="screen">
        <h1 class="screen__heading">{t('homeLayout.heading')}</h1>
        <p class="screen__lead">{t('homeLayout.explanation')}</p>
        <p class="notice">{t('settings.loading')}</p>
      </main>
    );
  }

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('homeLayout.heading')}</h1>
      <p class="screen__lead">{t('homeLayout.explanation')}</p>

      {saveFailed ? (
        <p class="notice notice--problem" role="alert">
          {t('homeLayout.notSaved')}
        </p>
      ) : null}

      <ul class="layout-rows">
        {layout.map((row, index) => {
          // A Row is addressed by its identity, not its kind: two genre Rows
          // are two Rows, and pressing Hide on one must not hide the other.
          const key = rowKeyOf(row);
          const name = nameOf(row);
          return (
            <li class="layout-row" key={key}>
              <span class="layout-row__name">{name}</span>
              <LayoutRowNote row={row} />
              <span class="layout-row__buttons">
                <button
                  type="button"
                  class="button button--quiet"
                  disabled={index === 0}
                  onClick={() => change({ homeLayout: moveRow(layout, key, 'up') })}
                >
                  {t('homeLayout.moveUp', { row: name })}
                </button>
                <button
                  type="button"
                  class="button button--quiet"
                  disabled={index === layout.length - 1}
                  onClick={() => change({ homeLayout: moveRow(layout, key, 'down') })}
                >
                  {t('homeLayout.moveDown', { row: name })}
                </button>
                <button
                  type="button"
                  class="button button--quiet"
                  onClick={() =>
                    change({
                      homeLayout:
                        row.hidden === true ? showRow(layout, key) : hideRow(layout, key),
                    })
                  }
                >
                  {row.hidden === true
                    ? t('homeLayout.show', { row: name })
                    : t('homeLayout.hide', { row: name })}
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <h2 class="layout-add__heading">{t('homeLayout.addHeading')}</h2>
      {addable.length === 0 ? (
        <p class="notice">{t('homeLayout.nothingToAdd')}</p>
      ) : (
        <p class="layout-add">
          {addable.map((kind) =>
            isParameterised(kind) ? (
              // A Row that needs a choice is not added by this press: it opens
              // the choices, and picking one is what adds it.
              <button
                type="button"
                class="button"
                key={kind}
                onClick={() => setPicking(picking === kind ? undefined : kind)}
              >
                {t(ROW_CHOICE_KEYS[kind] ?? ROW_NAME_KEYS[kind])}
              </button>
            ) : (
              <button
                type="button"
                class="button"
                key={kind}
                onClick={() => change({ homeLayout: addRow(layout, kind) })}
              >
                {t('homeLayout.add', { row: t(ROW_NAME_KEYS[kind]) })}
              </button>
            ),
          )}
        </p>
      )}

      {picking === undefined ? null : (
        <RowChoices
          kind={picking}
          result={choices[picking]}
          taken={parametersFor(layout, picking)}
          onChoose={(choice) => {
            change({ homeLayout: addRow(layout, picking, choice.value) });
            // The choice is made, so the list has done its job and closes.
            setPicking(undefined);
          }}
          onLeave={() => setPicking(undefined)}
        />
      )}

      <p class="layout-done">
        {/* A real link, so Back and the browser's own navigation both work. */}
        <a class="button button--primary" href={HOME_PATH}>
          {t('homeLayout.done')}
        </a>
      </p>
    </main>
  );
}

/**
 * The choices for one kind of Row: the genres, or the Collections, minus the
 * ones this layout already has a Row for (#15).
 *
 * It is a list of buttons rather than a `<select>`, like everything else on
 * this screen: a remote can reach a button, and `src/navigation/` reaches
 * anything focusable, where a native dropdown on a TV is its own problem.
 * Deliberately not a focus group — a choice is made once and there is nothing
 * to come back to, which is the rule the genre chips in Search follow too.
 */
function RowChoices({
  kind,
  result,
  taken,
  onChoose,
  onLeave,
}: {
  kind: HomeRowKind;
  result: RowChoicesResult | undefined;
  /** The choices this layout has already used, which are not offered again. */
  taken: readonly string[];
  onChoose: (choice: RowChoice) => void;
  onLeave: () => void;
}) {
  const t = useTranslate();
  const headingId = `layout-choices-${kind}`;

  const body = () => {
    if (result === undefined) return <p class="notice">{t('homeLayout.choicesLoading')}</p>;
    if (result.outcome === 'unavailable') {
      return (
        <p class="notice notice--problem" role="alert">
          {t('homeLayout.choicesUnavailable')}
        </p>
      );
    }

    const left = result.choices.filter((choice) => taken.indexOf(choice.value) === -1);
    if (left.length === 0) return <p class="notice">{t('homeLayout.noChoicesLeft')}</p>;

    return (
      <ul class="layout-choices__list" aria-labelledby={headingId}>
        {left.map((choice) => (
          <li key={choice.value}>
            <button type="button" class="button button--quiet" onClick={() => onChoose(choice)}>
              {t('homeLayout.add', { row: choice.name })}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section class="layout-choices" aria-labelledby={headingId}>
      <h3 class="layout-choices__heading" id={headingId}>
        {t(ROW_CHOICE_HEADING_KEYS[kind] ?? ROW_NAME_KEYS[kind])}
      </h3>
      {body()}
      <button type="button" class="button button--quiet" onClick={onLeave}>
        {t('homeLayout.choiceCancel')}
      </button>
    </section>
  );
}

/** What a choice is called, for a Row that stores an id rather than a name. */
function choiceNameOf(result: RowChoicesResult | undefined, value: string): string | undefined {
  if (result === undefined || result.outcome === 'unavailable') return undefined;
  return result.choices.find((choice) => choice.value === value)?.name;
}

/**
 * Whether a kind has any choice left to add. A read still in flight, or one the
 * Server refused, counts as "yes": the control stays where it is and says what
 * happened when it is pressed, rather than vanishing from under the User.
 */
function canStillAdd(
  result: RowChoicesResult | undefined,
  layout: HomeLayout,
  kind: HomeRowKind,
): boolean {
  if (result === undefined || result.outcome === 'unavailable') return true;
  const taken = parametersFor(layout, kind);
  return result.choices.some((choice) => taken.indexOf(choice.value) === -1);
}

/**
 * The genres and the Collections, read once when the editor opens.
 *
 * Both, always, rather than only when the picker is opened: a Collection Row
 * already in the layout is named from this, so the list is what the screen
 * reads for itself and not only for the picker.
 */
function useRowChoices(
  gateway: JellyfinGateway,
): Partial<Record<HomeRowKind, RowChoicesResult>> {
  const [genre, setGenre] = useState<RowChoicesResult | undefined>(undefined);
  const [collection, setCollection] = useState<RowChoicesResult | undefined>(undefined);

  useEffect(() => {
    let abandoned = false;
    setGenre(undefined);
    setCollection(undefined);
    void loadGenreChoices(gateway).then((loaded) => {
      if (!abandoned) setGenre(loaded);
    });
    void loadCollectionChoices(gateway).then((loaded) => {
      if (!abandoned) setCollection(loaded);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so the address is the dependency.
  }, [gateway.serverAddress]);

  return {
    ...(genre === undefined ? {} : { genre }),
    ...(collection === undefined ? {} : { collection }),
  };
}

/**
 * What is worth saying about a Row beyond its name: that it is hidden, or that
 * its feature is not built yet, which is why hiding it changes nothing on Home.
 */
function LayoutRowNote({ row }: { row: HomeRow }) {
  const t = useTranslate();

  if (!isRowBuilt(row.kind)) {
    return <span class="layout-row__note">{t('homeLayout.notBuiltYet')}</span>;
  }
  if (row.hidden === true) return <span class="layout-row__note">{t('homeLayout.hidden')}</span>;
  return null;
}
