import { useTranslate } from '../i18n/index';
import {
  addableRowKinds,
  addRow,
  hideRow,
  moveRow,
  showRow,
  type HomeRow,
  type HomeRowKind,
} from '../home/home-layout';
import { isRowBuilt, ROW_NAME_KEYS } from '../home/home-rows';
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
 */

/** The editor's own address. Not in `SECTIONS`; see the note above. */
export const HOME_LAYOUT_PATH = '/settings/home-layout';

export function HomeLayoutScreen() {
  const t = useTranslate();
  const { settings, loaded, saveFailed, change } = useSettings();
  const layout = settings.homeLayout;

  const rename = (kind: HomeRowKind): string => t(ROW_NAME_KEYS[kind]);
  const addable = addableRowKinds(layout);

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
        {layout.map((row, index) => (
          <li class="layout-row" key={row.kind}>
            <span class="layout-row__name">{rename(row.kind)}</span>
            <LayoutRowNote row={row} />
            <span class="layout-row__buttons">
              <button
                type="button"
                class="button button--quiet"
                disabled={index === 0}
                onClick={() => change({ homeLayout: moveRow(layout, row.kind, 'up') })}
              >
                {t('homeLayout.moveUp', { row: rename(row.kind) })}
              </button>
              <button
                type="button"
                class="button button--quiet"
                disabled={index === layout.length - 1}
                onClick={() => change({ homeLayout: moveRow(layout, row.kind, 'down') })}
              >
                {t('homeLayout.moveDown', { row: rename(row.kind) })}
              </button>
              <button
                type="button"
                class="button button--quiet"
                onClick={() =>
                  change({
                    homeLayout:
                      row.hidden === true
                        ? showRow(layout, row.kind)
                        : hideRow(layout, row.kind),
                  })
                }
              >
                {row.hidden === true
                  ? t('homeLayout.show', { row: rename(row.kind) })
                  : t('homeLayout.hide', { row: rename(row.kind) })}
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h2 class="layout-add__heading">{t('homeLayout.addHeading')}</h2>
      {addable.length === 0 ? (
        <p class="notice">{t('homeLayout.nothingToAdd')}</p>
      ) : (
        <p class="layout-add">
          {addable.map((kind) => (
            <button
              type="button"
              class="button"
              key={kind}
              onClick={() => change({ homeLayout: addRow(layout, kind) })}
            >
              {t('homeLayout.add', { row: rename(kind) })}
            </button>
          ))}
        </p>
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
