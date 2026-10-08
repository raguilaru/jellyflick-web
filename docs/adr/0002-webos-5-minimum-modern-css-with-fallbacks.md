# LG webOS 5 is the oldest TV target; write modern CSS with plain fallbacks

The future TV version targets LG webOS 5 (2020, Chromium 68) and later, so TVs from 2016 to 2019 aren't supported. Supporting them would have forced the whole app onto 2014–2017-era JavaScript and CSS. Chromium 68 still lacks CSS the UI would naturally use, such as scroll snap, `clamp()`, flexbox `gap`, `aspect-ratio`, `:focus-visible`, container queries and `dvh` units. We write modern CSS anyway and give old TVs a plain fallback, which can look slightly less polished. A modern feature is allowed only where that fallback still looks acceptable, so container queries and `dvh` are avoided in favour of simpler techniques. JavaScript is transpiled for Chromium 68 at build time.

## Considered options

- Write for Chromium 68 everywhere: rejected, because it would hold back the web version for a TV that doesn't exist yet.
- Raise the minimum to webOS 22 (Chromium 87): would drop most of the fallbacks, but loses 2020–2021 TVs.
- Defer the TV minimum until the port: rejected, because the port would then become a CSS rewrite rather than "small tweaks".
