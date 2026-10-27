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
 * Home there — see `HOME_SECTION_IDS` below — because four items is as many as
 * a bottom bar holds comfortably.
 */
export const BOTTOM_BAR_SECTION_IDS: readonly SectionId[] = ['home', 'search', 'my-list'];

/**
 * The sections Home links to itself, at phone width only: the two the bottom
 * bar has no room for (#51).
 *
 * This is the other half of `BOTTOM_BAR_SECTION_IDS`, and the pair of lists is
 * the whole of how a phone reaches every section. It is deliberately not a
 * fifth bar item — story 61's four items are asserted by
 * `moving-around-the-app` in both suites — and deliberately not drawn on a
 * wide screen, where the top bar already carries both and a second copy of a
 * link would be a second stop for a screen reader.
 */
export const HOME_SECTION_IDS: readonly SectionId[] = ['movies', 'series'];

export function sectionsFor(ids: readonly SectionId[]): readonly Section[] {
  return ids.map(sectionFor);
}

/**
 * One section by its id. A section whose screen is its own module names itself
 * this way, so its address is still written only here.
 */
export function sectionFor(id: SectionId): Section {
  const section = SECTIONS.find((candidate) => candidate.id === id);
  if (section === undefined) throw new Error(`No section is called ${id}.`);
  return section;
}
