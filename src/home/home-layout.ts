/**
 * The Home Layout: which Rows a User has on Home, in their order, and which of
 * them are hidden (stories 48, 49 and 50).
 *
 * A layout *is* its ordered list of Rows, so there is no wrapper object to keep
 * in step with it. Every rule here is a pure function of a layout, which is why
 * the editor holds no rules of its own and the store holds no opinions about
 * what a layout means.
 *
 * It is stored on the Server, as one `CustomPrefs` string, by
 * `src/settings/client-settings.ts` — never in device storage, because a User's
 * Home has to follow them to every device.
 */

/**
 * The Rows a User can have. Each is one feature's own ticket; a kind with no
 * loader yet is simply not drawn, which is why this list can name Rows that do
 * not exist today without Home pretending they do.
 */
export type HomeRowKind =
  | 'continue-watching'
  | 'my-list'
  | 'new-on-jellyflick'
  | 'watch-again'
  | 'because-you-watched'
  | 'genre'
  | 'collection';

export const HOME_ROW_KINDS: readonly HomeRowKind[] = [
  'continue-watching',
  'my-list',
  'new-on-jellyflick',
  'watch-again',
  'because-you-watched',
  'genre',
  'collection',
];

/**
 * The kinds that mean nothing without a choice: which genre, which Collection
 * (#15, stories 44 and 45). A User can have several of each — one Row per
 * genre they like — which is why a Row is identified by its kind *and* its
 * parameter rather than by its kind alone.
 *
 * Whether any choice is **left** to add is the Server's answer and not a
 * layout's, so these kinds are always among `addableRowKinds`: the editor
 * subtracts `parametersFor` from what the Server offers and is the one place
 * that knows there is nothing left.
 */
export const PARAMETERISED_ROW_KINDS: readonly HomeRowKind[] = ['genre', 'collection'];

export function isParameterised(kind: HomeRowKind): boolean {
  return PARAMETERISED_ROW_KINDS.indexOf(kind) !== -1;
}

export type HomeRow = {
  readonly kind: HomeRowKind;
  /**
   * Absent means the Row is shown. A hidden Row keeps its place in the list, so
   * showing it again puts it back where it was rather than at the end.
   */
  readonly hidden?: boolean;
  /**
   * Which genre, or which Collection, for a Row that needs saying: a genre
   * *name*, which is what `/Items?genres=` matches on, or a Collection's item
   * id. Half of a parameterised Row's identity — see `rowKeyOf`.
   */
  readonly parameter?: string;
};

/** A Home Layout: the Rows a User has, in the order Home draws them. */
export type HomeLayout = readonly HomeRow[];

/**
 * What identifies one Row in a layout: its kind, and its parameter where it has
 * one. An unparameterised Row's key is simply its kind, so "one Continue
 * Watching" and "one Comedy Row, beside one Thriller Row" are the same rule
 * read twice rather than two rules.
 *
 * A kind never contains a colon, so no two (kind, parameter) pairs can share a
 * key. It is never split back apart: a key is only ever compared.
 */
export type HomeRowKey = string;

export function rowKeyOf(row: Pick<HomeRow, 'kind' | 'parameter'>): HomeRowKey {
  return row.parameter === undefined ? row.kind : `${row.kind}:${row.parameter}`;
}

/**
 * What a new User lands on before they have customised anything (story 50):
 * resume first, then the Titles they chose, then what is new, then the two
 * suggestion Rows. Only the Rows whose feature exists are drawn, so this is the
 * order Home grows into as the later tickets land.
 */
export const DEFAULT_HOME_LAYOUT: HomeLayout = [
  { kind: 'continue-watching' },
  { kind: 'my-list' },
  { kind: 'new-on-jellyflick' },
  { kind: 'watch-again' },
  { kind: 'because-you-watched' },
];

/** The Rows a layout draws, in order. */
export function visibleRows(layout: HomeLayout): HomeLayout {
  return layout.filter((row) => row.hidden !== true);
}

/** Whether a layout already holds this Row, hidden or not. */
export function hasRow(layout: HomeLayout, key: HomeRowKey): boolean {
  return layout.some((row) => rowKeyOf(row) === key);
}

/**
 * The Rows a User can still add: the kinds not in their layout at all, plus
 * every kind they can have more than one of. A hidden Row is not among them —
 * it is shown again rather than added twice.
 */
export function addableRowKinds(layout: HomeLayout): readonly HomeRowKind[] {
  return HOME_ROW_KINDS.filter((kind) => isParameterised(kind) || !hasRow(layout, kind));
}

/**
 * The choices a layout has already used for one kind, in its own order: the
 * genres a User already has a Row for, or the Collections. The editor offers
 * the Server's list minus these, so one genre cannot be added twice.
 */
export function parametersFor(layout: HomeLayout, kind: HomeRowKind): readonly string[] {
  return layout
    .filter((row) => row.kind === kind)
    .map((row) => row.parameter)
    .filter((parameter): parameter is string => parameter !== undefined);
}

/**
 * Adds a Row at the end. A Row the layout already holds — the same kind, and
 * the same choice where it has one — changes nothing.
 */
export function addRow(
  layout: HomeLayout,
  kind: HomeRowKind,
  parameter?: string,
): HomeLayout {
  // A genre or Collection Row **is** its parameter: one stored without it is
  // dropped by `parseHomeLayout` on the next read, so it would sit on Home
  // until the User reloaded and then be silently gone. Refused where Rows are
  // made rather than mended where they are read back.
  if (isParameterised(kind) && parameter === undefined) return layout;
  const row: HomeRow = { kind, ...(parameter === undefined ? {} : { parameter }) };
  if (hasRow(layout, rowKeyOf(row))) return layout;
  return [...layout, row];
}

export function hideRow(layout: HomeLayout, key: HomeRowKey): HomeLayout {
  return layout.map((row) => (rowKeyOf(row) === key ? { ...row, hidden: true } : row));
}

/** Shows a hidden Row again, in the place it kept while it was hidden. */
export function showRow(layout: HomeLayout, key: HomeRowKey): HomeLayout {
  return layout.map((row) => {
    if (rowKeyOf(row) !== key) return row;
    // Shown is the absence of `hidden`, not `hidden: false`, so that a layout
    // read back from the Server is the one that was written.
    return {
      kind: row.kind,
      ...(row.parameter === undefined ? {} : { parameter: row.parameter }),
    };
  });
}

export type RowDirection = 'up' | 'down';

/**
 * Moves a Row one place up or down. A Row already at that end of the list stays
 * where it is, so the editor can offer the move without having to know whether
 * it is possible — pressing it is simply a no-op.
 */
export function moveRow(
  layout: HomeLayout,
  key: HomeRowKey,
  direction: RowDirection,
): HomeLayout {
  const from = layout.findIndex((row) => rowKeyOf(row) === key);
  if (from === -1) return layout;
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= layout.length) return layout;

  const moved = [...layout];
  const [row] = moved.splice(from, 1);
  moved.splice(to, 0, row as HomeRow);
  return moved;
}

/** The layout as it is stored, which is one `CustomPrefs` string. */
export function serialiseHomeLayout(layout: HomeLayout): string {
  return JSON.stringify(layout);
}

/**
 * Reads a stored layout, falling back to the default.
 *
 * Nothing stored means a new User. Anything else that cannot be read as a
 * layout — a half-written value, a hand-edited pref, a newer Jellyflick's Rows
 * — is treated the same way, because an empty Home would be a worse answer than
 * the default one. Unknown kinds are dropped individually, so a layout from a
 * newer version keeps the Rows this version does understand.
 */
export function parseHomeLayout(stored: string | null | undefined): HomeLayout {
  if (stored === null || stored === undefined || stored === '') return DEFAULT_HOME_LAYOUT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return DEFAULT_HOME_LAYOUT;
  }
  if (!Array.isArray(parsed)) return DEFAULT_HOME_LAYOUT;

  const rows: HomeRow[] = [];
  for (const candidate of parsed) {
    const row = rowFrom(candidate);
    // One entry per Row: a duplicate would draw the same Row twice and give the
    // editor two things to press for one Row. Two genre Rows for *different*
    // genres are two Rows, which is what makes this the key rather than the
    // kind.
    if (row === undefined || hasRow(rows, rowKeyOf(row))) continue;
    rows.push(row);
  }

  return rows.length === 0 ? DEFAULT_HOME_LAYOUT : rows;
}

function rowFrom(candidate: unknown): HomeRow | undefined {
  if (candidate === null || typeof candidate !== 'object') return undefined;
  const { kind, hidden, parameter } = candidate as Record<string, unknown>;
  if (!isHomeRowKind(kind)) return undefined;
  // A genre Row with no genre, or a Collection Row with no Collection, has
  // nothing to show: it is dropped the way an unknown kind is, rather than
  // drawn empty or guessed at.
  if (isParameterised(kind) && (typeof parameter !== 'string' || parameter === '')) {
    return undefined;
  }
  return {
    kind,
    ...(hidden === true ? { hidden: true } : {}),
    ...(typeof parameter === 'string' ? { parameter } : {}),
  };
}

function isHomeRowKind(value: unknown): value is HomeRowKind {
  return typeof value === 'string' && HOME_ROW_KINDS.indexOf(value as HomeRowKind) !== -1;
}
