import { useTranslate } from '../i18n/index';
import type { Section } from './sections';

export type SectionLinkProps = {
  section: Section;
  /** The address the User is on: an exact match is the section they are in. */
  currentPath: string;
  /** The bar's own class for its links. */
  class: string;
};

/**
 * A link to one section. A real `href`, so the browser's own navigation, the
 * middle-click and "copy link address" all work; the router intercepts the
 * click and turns it into a `pushState`.
 */
export function SectionLink({ section, currentPath, class: className }: SectionLinkProps) {
  const t = useTranslate();
  const current = currentPath === section.path;

  return (
    <a
      class={current ? `${className} ${className}--current` : className}
      href={section.path}
      aria-current={current ? 'page' : undefined}
    >
      {t(section.labelKey)}
    </a>
  );
}
