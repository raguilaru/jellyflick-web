import { useEffect, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import type { Session, SignedInUser } from '../session/session';
import { loadNewOnJellyflick, type NewOnJellyflickResult } from './new-on-jellyflick';
import { Row } from './row';

export type HomeScreenProps = {
  user: SignedInUser;
  session: Session;
};

/**
 * Where a signed-in User lands: the New on Jellyflick Row, and for now nothing
 * above it. The Billboard, the other Rows and the Home Layout are each their
 * own ticket. The wordmark and the navigation around this screen are the
 * shell's.
 */
export function HomeScreen({ user, session }: HomeScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const [newOnJellyflick, setNewOnJellyflick] = useState<NewOnJellyflickResult | undefined>(
    undefined,
  );

  useEffect(() => {
    let abandoned = false;
    setNewOnJellyflick(undefined);
    void loadNewOnJellyflick(gateway).then((result) => {
      if (abandoned) return;
      setNewOnJellyflick(result);
    });
    return () => {
      abandoned = true;
    };
    // What is new is new to one User on one Server, so it is read again when
    // either changes. The gateway is rebuilt on every render, which is why the
    // address is the dependency rather than the gateway itself.
  }, [gateway.serverAddress, user.userId]);

  return (
    <main class="screen">
      <p class="notice">{t('home.signedInAs', { name: user.name })}</p>

      {newOnJellyflick === undefined ? (
        <p class="notice">{t('home.rowLoading')}</p>
      ) : newOnJellyflick.outcome === 'unavailable' ? (
        <p class="notice notice--problem" role="alert">
          {t('home.newOnJellyflick.unavailable')}
        </p>
      ) : newOnJellyflick.titles.length === 0 ? (
        // An empty Row would look like something still loading, so Home says
        // what is actually the case.
        <p class="notice">{t('home.newOnJellyflick.empty')}</p>
      ) : (
        <Row heading={t('home.newOnJellyflick')} cards={newOnJellyflick.titles} />
      )}
    </main>
  );
}
