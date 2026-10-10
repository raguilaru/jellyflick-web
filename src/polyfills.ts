/**
 * Shims for the handful of things Chromium 68 lacks and this app uses. Each is
 * installed only when it is missing, so a newer engine pays nothing but a check.
 *
 * `lib` stays at ES2020 on purpose, so the compiler still refuses the methods
 * this app must not use. That is why each shim is installed through `define`
 * rather than by assigning a typed property.
 *
 * Deliberately NOT shimmed, because Chromium 68 already has them:
 * `AbortController` (66), `ResizeObserver` (64), `IntersectionObserver` (51),
 * `requestIdleCallback` (47), `TextDecoder` (38), `CSS.supports` (28).
 *
 * Deliberately NOT shimmed, because the app must not use them: `Object.hasOwn`
 * (93), `Promise.any` (85), `structuredClone` (98), `WeakRef` (84),
 * `Array.prototype.at` (92), `findLast` (97), `crypto.randomUUID` (92),
 * `Error.cause` (93). ESLint bans the first three; the rest are a review matter.
 */

/** Installs `name` on `target` when it is absent. */
function define(target: object, name: string, value: unknown): void {
  if (name in target) return;
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
}

type UnknownArray = unknown[] & { flat(depth?: number): unknown[] };

define(Array.prototype, 'flat', function flat(this: UnknownArray, depth = 1): unknown[] {
  return depth < 1
    ? this.slice()
    : this.reduce<unknown[]>(
        (acc, value) =>
          acc.concat(Array.isArray(value) ? (value as UnknownArray).flat(depth - 1) : value),
        [],
      );
});

define(
  Array.prototype,
  'flatMap',
  function flatMap(
    this: UnknownArray,
    callback: (value: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ): unknown[] {
    return (this.map(callback, thisArg) as UnknownArray).flat();
  },
);

define(Object, 'fromEntries', function fromEntries(entries: Iterable<[PropertyKey, unknown]>) {
  const out: Record<PropertyKey, unknown> = {};
  for (const [key, value] of entries) out[key] = value;
  return out;
});

define(
  String.prototype,
  'replaceAll',
  function replaceAll(this: string, find: string | RegExp, replacement: string): string {
    if (find instanceof RegExp) return this.replace(find, replacement);
    return this.split(String(find)).join(replacement);
  },
);

define(
  String.prototype,
  'matchAll',
  function* matchAll(this: string, pattern: RegExp): Generator<RegExpExecArray> {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const scanner = new RegExp(pattern.source, flags);
    let match = scanner.exec(this);
    while (match !== null) {
      yield match;
      if (match[0] === '') scanner.lastIndex += 1;
      match = scanner.exec(this);
    }
  },
);

define(Promise, 'allSettled', function allSettled(promises: Iterable<unknown>) {
  return Promise.all(
    Array.from(promises, (promise) =>
      Promise.resolve(promise).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      ),
    ),
  );
});

define(window, 'globalThis', window);

define(
  Element.prototype,
  'toggleAttribute',
  function toggleAttribute(this: Element, name: string, force?: boolean): boolean {
    const shouldHave = force ?? !this.hasAttribute(name);
    if (shouldHave) this.setAttribute(name, '');
    else this.removeAttribute(name);
    return shouldHave;
  },
);

export {};
