import { useTranslate } from '../i18n/index';
import type { Section } from './sections';

export type SectionPlaceholderProps = {
  section: Section;
};

/**
 * A section that has its address, its place in the navigation and nothing else
 * yet. Movies and Series are #7, My List is #8 and Search is #9: each replaces
 * this with its own folder under `src/`, so nothing here is worth growing.
 */
export function SectionPlaceholder({ section }: SectionPlaceholderProps) {
  const t = useTranslate();

  return (
    <main class="screen">
      <h1 class="screen__heading">{t(section.labelKey)}</h1>
      <p class="notice">{t('shell.sectionNotBuiltYet')}</p>
    </main>
  );
}

/** An address that is not a section at all, which the SPA fallback allows. */
export function UnknownSection() {
  const t = useTranslate();

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('shell.unknownSectionHeading')}</h1>
      <p class="notice">{t('shell.unknownSection')}</p>
    </main>
  );
}
