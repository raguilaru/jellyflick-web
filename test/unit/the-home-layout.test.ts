import { describe, expect, it } from 'vitest';
import {
  addableRowKinds,
  addRow,
  DEFAULT_HOME_LAYOUT,
  hideRow,
  moveRow,
  parametersFor,
  parseHomeLayout,
  rowKeyOf,
  serialiseHomeLayout,
  showRow,
  visibleRows,
  type HomeLayout,
} from '../../src/home/home-layout';

/** A layout's Rows by kind, which is how every rule below is read. */
function kinds(layout: HomeLayout): string[] {
  return layout.map((row) => row.kind);
}

/** A layout's Rows by key, which is how a parameterised Row is told apart. */
function keys(layout: HomeLayout): string[] {
  return layout.map((row) => rowKeyOf(row));
}

/**
 * The Home Layout's rules, as a User experiences them: what a new User gets,
 * and what survives the round trip to the Server.
 *
 * The seam is the module's exported functions. They are pure, so every rule is
 * checked here rather than through the editor, which only has to press them.
 */

describe('a new User’s Home Layout', () => {
  it('is Continue Watching, My List, New on Jellyflick, Watch Again, Because You Watched', () => {
    expect(DEFAULT_HOME_LAYOUT.map((row) => row.kind)).toEqual([
      'continue-watching',
      'my-list',
      'new-on-jellyflick',
      'watch-again',
      'because-you-watched',
    ]);
  });

  it('shows every Row it holds', () => {
    expect(DEFAULT_HOME_LAYOUT.every((row) => row.hidden !== true)).toBe(true);
  });

  it('is what a User who has never saved one reads', () => {
    expect(parseHomeLayout(undefined)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout('')).toEqual(DEFAULT_HOME_LAYOUT);
  });
});

describe('a Home Layout read back from the Server', () => {
  it('comes back as it was saved', () => {
    const layout: HomeLayout = [{ kind: 'new-on-jellyflick' }, { kind: 'my-list', hidden: true }];

    expect(parseHomeLayout(serialiseHomeLayout(layout))).toEqual(layout);
  });

  it('falls back to the default when the stored value is not a layout at all', () => {
    expect(parseHomeLayout('not json')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout('{"rows":[]}')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout('42')).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('drops a Row this version of Jellyflick does not know, keeping the rest', () => {
    // A newer Jellyflick, or a hand-edited pref, must not empty Home.
    expect(parseHomeLayout('[{"kind":"holograms"},{"kind":"my-list"}]')).toEqual([
      { kind: 'my-list' },
    ]);
  });

  it('keeps one entry per Row, so a Row cannot appear twice', () => {
    expect(parseHomeLayout('[{"kind":"my-list"},{"kind":"my-list","hidden":true}]')).toEqual([
      { kind: 'my-list' },
    ]);
  });

  it('is the default rather than an empty Home when every Row in it is unknown', () => {
    expect(parseHomeLayout('[{"kind":"holograms"}]')).toEqual(DEFAULT_HOME_LAYOUT);
  });
});

describe('hiding a Row', () => {
  const layout: HomeLayout = [
    { kind: 'continue-watching' },
    { kind: 'my-list' },
    { kind: 'new-on-jellyflick' },
  ];

  it('takes it off Home', () => {
    expect(kinds(visibleRows(hideRow(layout, 'my-list')))).toEqual([
      'continue-watching',
      'new-on-jellyflick',
    ]);
  });

  it('keeps its place, so showing it again puts it back where it was', () => {
    const hidden = hideRow(layout, 'my-list');

    expect(kinds(showRow(hidden, 'my-list'))).toEqual(kinds(layout));
    expect(kinds(visibleRows(showRow(hidden, 'my-list')))).toEqual(kinds(layout));
  });

  it('leaves it off the Rows a User can add, because it is shown again instead', () => {
    expect(addableRowKinds(hideRow(layout, 'my-list'))).not.toContain('my-list');
  });
});

describe('adding a Row', () => {
  const layout: HomeLayout = [{ kind: 'my-list' }];

  it('offers the Rows the layout does not hold', () => {
    expect(addableRowKinds(layout)).toEqual([
      'continue-watching',
      'new-on-jellyflick',
      'watch-again',
      'because-you-watched',
      'genre',
      'collection',
    ]);
  });

  it('puts the new Row at the end, shown', () => {
    const added = addRow(layout, 'watch-again');

    expect(kinds(added)).toEqual(['my-list', 'watch-again']);
    expect(kinds(visibleRows(added))).toEqual(['my-list', 'watch-again']);
  });

  it('cannot put the same Row on Home twice', () => {
    expect(kinds(addRow(layout, 'my-list'))).toEqual(['my-list']);
  });

  it('offers only the Rows a User can have more than one of once the rest are on Home', () => {
    // A genre and a Collection Row are never used up: there is always another
    // genre to add one for. Whether any choice is *left* is the Server's
    // answer, and so the editor's to work out — see `parametersFor` below.
    expect(addableRowKinds(DEFAULT_HOME_LAYOUT)).toEqual(['genre', 'collection']);
  });
});

/**
 * Genre and Collection Rows (#15, stories 44 and 45). A User can have several
 * of each, so a Row is identified by its kind *and* its parameter — which is
 * what `rowKeyOf` is, and what every rule above takes.
 */
describe('a Row that needs a choice', () => {
  it('is told apart from another of its kind by its parameter', () => {
    const layout = addRow(addRow([], 'genre', 'Comedy'), 'genre', 'Thriller');

    expect(keys(layout)).toEqual(['genre:Comedy', 'genre:Thriller']);
  });

  it('cannot be added twice for the same choice', () => {
    const layout = addRow(addRow([], 'genre', 'Comedy'), 'genre', 'Comedy');

    expect(keys(layout)).toEqual(['genre:Comedy']);
  });

  it('says which choices a layout has already used, so the rest can be offered', () => {
    const layout = addRow(addRow(addRow([], 'genre', 'Comedy'), 'collection', 'boxset-1'), 'genre', 'Drama');

    expect(parametersFor(layout, 'genre')).toEqual(['Comedy', 'Drama']);
    expect(parametersFor(layout, 'collection')).toEqual(['boxset-1']);
  });

  it('is hidden, shown and moved by itself, leaving the other of its kind alone', () => {
    const layout = addRow(addRow([], 'genre', 'Comedy'), 'genre', 'Thriller');

    const hidden = hideRow(layout, 'genre:Comedy');
    expect(keys(visibleRows(hidden))).toEqual(['genre:Thriller']);

    expect(keys(visibleRows(showRow(hidden, 'genre:Comedy')))).toEqual([
      'genre:Comedy',
      'genre:Thriller',
    ]);
    expect(keys(moveRow(layout, 'genre:Thriller', 'up'))).toEqual([
      'genre:Thriller',
      'genre:Comedy',
    ]);
  });

  it('keeps its choice through the round trip to the Server', () => {
    const layout: HomeLayout = [
      { kind: 'genre', parameter: 'Comedy' },
      { kind: 'collection', parameter: 'boxset-crime-classics', hidden: true },
    ];

    expect(parseHomeLayout(serialiseHomeLayout(layout))).toEqual(layout);
  });

  it('is dropped when the stored Row names no choice at all', () => {
    // A genre Row with no genre has nothing to show, so it is dropped the way
    // an unknown kind is rather than drawn empty.
    expect(parseHomeLayout('[{"kind":"genre"},{"kind":"my-list"}]')).toEqual([
      { kind: 'my-list' },
    ]);
  });
});

describe('reordering Rows', () => {
  const layout: HomeLayout = [
    { kind: 'continue-watching' },
    { kind: 'my-list' },
    { kind: 'new-on-jellyflick' },
  ];

  it('moves a Row one place up', () => {
    expect(kinds(moveRow(layout, 'my-list', 'up'))).toEqual([
      'my-list',
      'continue-watching',
      'new-on-jellyflick',
    ]);
  });

  it('moves a Row one place down', () => {
    expect(kinds(moveRow(layout, 'my-list', 'down'))).toEqual([
      'continue-watching',
      'new-on-jellyflick',
      'my-list',
    ]);
  });

  it('leaves a Row at either end where it is', () => {
    expect(kinds(moveRow(layout, 'continue-watching', 'up'))).toEqual(kinds(layout));
    expect(kinds(moveRow(layout, 'new-on-jellyflick', 'down'))).toEqual(kinds(layout));
  });

  it('moves a hidden Row too, and keeps it hidden', () => {
    const hidden = hideRow(layout, 'my-list');

    const moved = moveRow(hidden, 'my-list', 'up');
    expect(kinds(moved)).toEqual(['my-list', 'continue-watching', 'new-on-jellyflick']);
    expect(kinds(visibleRows(moved))).toEqual(['continue-watching', 'new-on-jellyflick']);
  });
});

describe('adding a Row that needs a parameter', () => {
  /**
   * A genre or Collection Row *is* its parameter: `parseHomeLayout` drops one
   * stored without it, so a Row added this way would be on Home until the User
   * reloaded and then silently gone. The editor's picker cannot produce it, but
   * nothing stopped another caller from doing so.
   */
  it('refuses a genre or Collection Row with no parameter', () => {
    expect(addRow([], 'genre')).toEqual([]);
    expect(addRow([], 'collection')).toEqual([]);
  });

  it('still adds one that names its genre', () => {
    expect(addRow([], 'genre', 'Comedy')).toEqual([{ kind: 'genre', parameter: 'Comedy' }]);
  });
});
