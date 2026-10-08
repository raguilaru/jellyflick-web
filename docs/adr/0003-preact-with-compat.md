# Preact (with preact/compat) instead of React

The UI is built with Preact, which is about 4 KB against React's 45 KB, because bundle size matters on 2020 LG TVs and the project's top priority is staying lightweight. React libraries run through `preact/compat`. To keep a move to React cheap if a library ever demands it, the code avoids React 19-only APIs and Preact-specific features outside of the compat surface. A switch should then mostly mean removing a build alias.

## Considered options

- React: has the most libraries, but is over 10 times the size.
- SolidJS: small and fast, but has fewer libraries and no route to React.
- Svelte 5: its compiled output relies on JavaScript newer than Chromium 68.
- LG Enact: TV-focused, but heavy and tied to LG.
