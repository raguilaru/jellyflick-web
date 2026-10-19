import type { HomeLayout } from '../home/home-layout';
import type { TitleKind } from '../jellyfin/gateway';
import { sectionFor, type Section } from '../shell/sections';

/**
 * The two sections that are about one kind of Title: Movies and Series (#23).
 *
 * They are Home's own composition narrowed to a kind — a Billboard over a
 * handful of Rows — and the narrowing is the only thing that makes them two
 * screens rather than one. Everything here is a fact rather than a component,
 * so the Billboard the shell holds can read it without reaching for the screen
 * that draws it.
 */

export type TitleSection = Section & {
  /** Which kind of Title the whole section is about. */
  readonly kind: TitleKind;
};

export const TITLE_SECTIONS: readonly TitleSection[] = [
  { ...sectionFor('movies'), kind: 'Movie' },
  { ...sectionFor('series'), kind: 'Series' },
];

/** The section at an address, or nothing when the address is not one of them. */
export function titleSectionAt(path: string): TitleSection | undefined {
  return TITLE_SECTIONS.find((section) => section.path === path);
}

/**
 * The Rows a section draws, in order — **fixed, and not the User's to
 * change** (#23's first acceptance box).
 *
 * It is a `HomeLayout` and not a shape of its own, so that every Row is drawn
 * by the registry in `src/home/home-rows.tsx` and a section inherits a Row's
 * rules rather than restating them. What it is *not* is a stored layout: there
 * is no `jf.` key behind it, nothing writes it, and the Home Layout editor
 * neither offers it nor knows about it. A User who hides Continue Watching on
 * Home still has it here, which is the point of a section being a view of the
 * library rather than a second Home.
 *
 * The genres are the library's own, ranked (`top-genres.ts`), so the order is
 * the household's rather than anybody's choice.
 */
export function sectionLayoutFor(genres: readonly string[]): HomeLayout {
  return [
    { kind: 'continue-watching' },
    { kind: 'new-on-jellyflick' },
    { kind: 'my-list' },
    ...genres.map((genre) => ({ kind: 'genre' as const, parameter: genre })),
  ];
}
