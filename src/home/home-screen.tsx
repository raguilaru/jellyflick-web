import { useTranslate } from '../i18n/index';
import type { Session, SignedInUser } from '../session/session';
import { HOME_LAYOUT_PATH } from '../settings/home-layout-screen';
import { useSettings } from '../settings/settings-provider';
import { visibleRows } from './home-layout';
import { HomeRowFor, isRowBuilt } from './home-rows';

export type HomeScreenProps = {
  user: SignedInUser;
  session: Session;
};

/**
 * Where a signed-in User lands: their Rows, in their order.
 *
 * Which Rows those are is the User's Home Layout, kept on the Server so it
 * follows them to every device (#10). Home reads it from the settings the shell
 * holds rather than from the Server itself, so an edit shows here at once.
 *
 * A Row whose feature is not built yet is left out rather than drawn empty —
 * see `home-rows.tsx`. The Billboard above the Rows is #16.
 */
export function HomeScreen({ user, session }: HomeScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const { settings, loaded } = useSettings();

  const rows = visibleRows(settings.homeLayout).filter((row) => isRowBuilt(row.kind));

  return (
    <main class="screen">
      <p class="notice">{t('home.signedInAs', { name: user.name })}</p>

      <p class="home__edit">
        <a class="button button--quiet" href={HOME_LAYOUT_PATH}>
          {t('homeLayout.heading')}
        </a>
      </p>

      {rows.map((row) => (
        <HomeRowFor
          key={row.kind}
          kind={row.kind}
          gateway={gateway}
          readKey={`${gateway.serverAddress}|${user.userId}`}
        />
      ))}

      {/* Nothing to draw is only worth saying once the layout has been read:
          before that the User is looking at the defaults, not at their Home. */}
      {rows.length === 0 && loaded ? <p class="notice">{t('home.empty')}</p> : null}
    </main>
  );
}
