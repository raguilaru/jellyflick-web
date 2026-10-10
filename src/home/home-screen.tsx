import { useTranslate } from '../i18n/index';
import type { SignedInUser } from '../session/session';

export type HomeScreenProps = {
  user: SignedInUser;
};

/**
 * Where a signed-in User lands. A placeholder on purpose: it shows who is
 * signed in and nothing else, because the app shell, the navigation and Home's
 * Billboard and Rows each belong to their own ticket.
 */
export function HomeScreen({ user }: HomeScreenProps) {
  const t = useTranslate();
  return (
    <main class="screen screen--centred">
      <h1 class="wordmark">{t('app.name')}</h1>
      <p class="notice">{t('home.signedInAs', { name: user.name })}</p>
    </main>
  );
}
