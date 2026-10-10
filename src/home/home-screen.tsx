import { useTranslate } from '../i18n/index';
import type { SignedInUser } from '../session/session';

export type HomeScreenProps = {
  user: SignedInUser;
};

/**
 * Where a signed-in User lands. A placeholder on purpose: it shows who is
 * signed in and nothing else, because Home's Billboard and Rows belong to their
 * own tickets. The wordmark and the navigation around it are the shell's.
 */
export function HomeScreen({ user }: HomeScreenProps) {
  const t = useTranslate();
  return (
    <main class="screen screen--centred">
      <p class="notice">{t('home.signedInAs', { name: user.name })}</p>
    </main>
  );
}
