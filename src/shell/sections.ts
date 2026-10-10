import type { MessageKey } from '../i18n/index';

/**
 * The sections of the app, and the one place their addresses are written.
 *
 * Every section has its own address, so it can be bookmarked, shared and
 * reloaded, and so Back means "the section I came from". Home is the root.
 */
export type SectionId = 'home' | 'movies' | 'series' | 'my-list' | 'search';

export type Section = {
  readonly id: SectionId;
  /** The address, with no trailing slash. */
  readonly path: string;
  readonly labelKey: MessageKey;
};

export const HOME_PATH = '/';

export const SECTIONS: readonly Section[] = [
  { id: 'home', path: HOME_PATH, labelKey: 'nav.home' },
  { id: 'movies', path: '/movies', labelKey: 'nav.movies' },
  { id: 'series', path: '/series', labelKey: 'nav.series' },
  { id: 'my-list', path: '/my-list', labelKey: 'nav.myList' },
  { id: 'search', path: '/search', labelKey: 'nav.search' },
];

/**
 * What the phone's bottom bar carries, in order: Home, Search and My List, with
 * the User's picture after them (story 61). Movies and Series are reached from
 * Home there, because four items is as many as a bottom bar holds comfortably.
 */
export const BOTTOM_BAR_SECTION_IDS: readonly SectionId[] = ['home', 'search', 'my-list'];

/**
 * One section's address. A screen's own route reads it from here rather than
 * writing the path again, so a section's address stays written once.
 */
export function pathOf(id: SectionId): string {
  return sectionsFor([id])[0]?.path ?? HOME_PATH;
}

export function sectionsFor(ids: readonly SectionId[]): readonly Section[] {
  return ids.map((id) => {
    const section = SECTIONS.find((candidate) => candidate.id === id);
    if (section === undefined) throw new Error(`No section is called ${id}.`);
    return section;
  });
}
