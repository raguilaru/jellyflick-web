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
  | 'because-you-watched';

export const HOME_ROW_KINDS: readonly HomeRowKind[] = [
  'continue-watching',
  'my-list',
  'new-on-jellyflick',
  'watch-again',
  'because-you-watched',
];

export type HomeRow = {
  readonly kind: HomeRowKind;
  /**
   * Absent means the Row is shown. A hidden Row keeps its place in the list, so
   * showing it again puts it back where it was rather than at the end.
   */
  readonly hidden?: boolean;
  /**
   * Which genre, or which Collection, for a Row that needs saying. Nothing
   * reads it yet — genre and Collection Rows are #15 — but it is stored and
   * round-tripped, so adding them is not a change of format.
   */
  readonly parameter?: string;
};

/** A Home Layout: the Rows a User has, in the order Home draws them. */
export type HomeLayout = readonly HomeRow[];

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

/** Whether a layout already holds a Row of this kind, hidden or not. */
export function hasRow(layout: HomeLayout, kind: HomeRowKind): boolean {
  return layout.some((row) => row.kind === kind);
}

/**
 * The Rows a User can still add: the kinds not in their layout at all. A hidden
 * Row is not among them — it is shown again rather than added twice.
 */
export function addableRowKinds(layout: HomeLayout): readonly HomeRowKind[] {
  return HOME_ROW_KINDS.filter((kind) => !hasRow(layout, kind));
}

/** Adds a Row at the end. A kind the layout already holds changes nothing. */
export function addRow(layout: HomeLayout, kind: HomeRowKind): HomeLayout {
  if (hasRow(layout, kind)) return layout;
  return [...layout, { kind }];
}

export function hideRow(layout: HomeLayout, kind: HomeRowKind): HomeLayout {
  return layout.map((row) => (row.kind === kind ? { ...row, hidden: true } : row));
}

/** Shows a hidden Row again, in the place it kept while it was hidden. */
export function showRow(layout: HomeLayout, kind: HomeRowKind): HomeLayout {
  return layout.map((row) => {
    if (row.kind !== kind) return row;
    const { hidden: _hidden, ...shown } = row;
    return shown;
  });
}

export type RowDirection = 'up' | 'down';

/**
 * Moves a Row one place up or down. A Row already at that end of the list stays
 * where it is, so the editor can offer the move without having to know whether
 * it is possible — pressing it is simply a no-op.
 */
export function moveRow(layout: HomeLayout, kind: HomeRowKind, direction: RowDirection): HomeLayout {
  const from = layout.findIndex((row) => row.kind === kind);
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
    // editor two things to press for one Row.
    if (row === undefined || hasRow(rows, row.kind)) continue;
    rows.push(row);
  }

  return rows.length === 0 ? DEFAULT_HOME_LAYOUT : rows;
}

function rowFrom(candidate: unknown): HomeRow | undefined {
  if (candidate === null || typeof candidate !== 'object') return undefined;
  const { kind, hidden, parameter } = candidate as Record<string, unknown>;
  if (!isHomeRowKind(kind)) return undefined;
  return {
    kind,
    ...(hidden === true ? { hidden: true } : {}),
    ...(typeof parameter === 'string' ? { parameter } : {}),
  };
}

function isHomeRowKind(value: unknown): value is HomeRowKind {
  return typeof value === 'string' && HOME_ROW_KINDS.indexOf(value as HomeRowKind) !== -1;
}
