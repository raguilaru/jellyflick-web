import { useEffect, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import { MyListToggle } from '../my-list/my-list-toggle';
import { useMyList } from '../my-list/use-my-list';
import type { RowCard } from './row';
import type { Session, SignedInUser } from '../session/session';
import { loadNewOnJellyflick, type NewOnJellyflickResult } from './new-on-jellyflick';
import { Row } from './row';

export type HomeScreenProps = {
  user: SignedInUser;
  session: Session;
};

/**
 * Where a signed-in User lands: the New on Jellyflick Row, the My List Row
 * below it, and for now nothing above them. The Billboard is its own ticket,
 * and so is the Home Layout (#10) that will let a User choose which Rows are
 * here and in what order — until it lands, this is the default Layout, written
 * out.
 *
 * Every card carries the My List toggle, which is how a Title gets into My List
 * in the first place (stories 40 and 52).
 */
export function HomeScreen({ user, session }: HomeScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const myList = useMyList();
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

  const control = (card: RowCard) => <MyListToggle card={card} />;
  const myListState = myList.state();

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
        <Row
          heading={t('home.newOnJellyflick')}
          cards={newOnJellyflick.titles}
          cardControl={control}
        />
      )}

      {/*
        An empty My List is where every User starts, and a Row saying so on
        every visit to Home would be in the way — the My List page is where it
        explains itself. A Server that will not say what is in the list is the
        same: Home shows the rest of itself and the page carries the problem.
        The heading is the section's own name, so there is one string for both.
      */}
      {myListState.outcome === 'list' && myListState.titles.length > 0 ? (
        <Row heading={t('nav.myList')} cards={myListState.titles} cardControl={control} />
      ) : null}
    </main>
  );
}
