# MDBList API — external ratings

Part of the Jellyflick API research. Index: [`jellyfin-api.md`](./jellyfin-api.md). Which ratings Jellyfin itself provides (`CriticRating`, `CommunityRating`, `OfficialRating`, `ProviderIds`) is covered in `jellyfin-api.md` §17.

## Primary sources used

| Source | What it is |
| --- | --- |
| **MDBList's own OpenAPI schema** — <https://api.mdblist.com/schema/> | The live, machine-readable spec behind the Swagger UI at <https://api.mdblist.com/docs/>. `openapi: 3.0.3`, `info.title: "MDBList API"`, `info.version: 1.0.0`. This is the authority for everything below. (Note: `https://api.mdblist.com/openapi.json` 404s — the schema is at `/schema/`.) |
| **MDBList docs — API page** — <https://docs.mdblist.com/docs/api> | Base URL, where to get a key, tier rate limits. |
| **The live API's own error responses** | Used to confirm the auth mechanism (see below). |

## 19. The endpoint

### Base URL

```
https://api.mdblist.com
```

### Single lookup by IMDb or TMDb id — this is the one we want

```
GET /{media_provider}/{media_type}/{media_id}/
```

`operationId: root_retrieve`, summary "Get Media Info", description "Resolve a single movie or show by provider ID."

| Path param | Enum (exact, from the schema) |
| --- | --- |
| `media_provider` | **`imdb`, `mal`, `mdblist`, `tmdb`, `trakt`, `tvdb`** |
| `media_type` | **`any`, `movie`, `show`** |
| `media_id` | string — the id from that provider |

| Query param | Enum |
| --- | --- |
| `append_to_response` | `episode_ratings`, `extra`, `keyword`, `recommendations`, `review` (comma-separated) |

**Note the trailing slash** in the route template — it is part of the path.

Concrete calls:

```
GET https://api.mdblist.com/imdb/movie/tt0133093/?apikey=KEY
GET https://api.mdblist.com/tmdb/movie/603/?apikey=KEY
GET https://api.mdblist.com/imdb/show/tt0903747/?apikey=KEY
GET https://api.mdblist.com/imdb/any/tt0133093/?apikey=KEY
```

Jellyflick should prefer `imdb` with `BaseItemDto.ProviderIds.Imdb` and fall back to `tmdb` with `ProviderIds.Tmdb`. Map Jellyfin's `BaseItemKind` to `media_type`: `Movie` → `movie`, `Series` → `show`; use `any` when unsure.

### Batch lookup

```
POST /{media_provider}/{media_type}/
```

`operationId: root_create`, summary "Get Media Info Batch". Body:

```json
{ "ids": [603, 24428], "append_to_response": ["keyword", "review"] }
```

(`ids` required, `integer[]` — so this form is TMDb-shaped; `append_to_response` here is an **array** with only `keyword`/`review` allowed.) Returns an array of objects.

The schema notes that "a few POST batch-lookup endpoints count as reads" against the 5-minute limit rather than as writes — this is one of them.

### Batch "just the ratings" lookup — useful for compact card ratings

```
POST /rating/{media_type}/{return_rating}
```

`operationId` summary "Get Ratings", description "Batch lookup ratings for a set of IDs. The path selects both the media type and the rating source to return."

| Path param | Enum (exact) |
| --- | --- |
| `media_type` | `movie`, `show` |
| **`return_rating`** | **`audience`, `imdb`, `letterboxd`, `mal`, `metacritic`, `rogerebert`, `score`, `score_average`, `tmdb`, `tomatoes`, `trakt`** |

Body:

```json
{ "ids": ["603", "24428"], "provider": "tmdb" }
```

`ids` required (`string[]`), `provider` is `tmdb` (default) or `imdb`.

**ID limits, documented in the description: max 10 ids per request for regular users, max 100 for Supporters.**

Response: `{ provider_id: string, provider_rating: number, mediatype: string, ratings: object[] }`.

### The documented rating sources

> **⚠️ This table is NOT the `ratings[]` element vocabulary, and #45 was filed because it was read as one.**
> `return_rating` is a **path/query parameter of the list and batch-ratings endpoints** — it chooses which rating a *list* is sorted, filtered or returned by. The `source` strings inside a single lookup's `ratings[]` are a different, measured set, listed under "Response shape — single lookup" below.
>
> The one that bit: this table's **`audience`** does not exist as a `ratings[]` source. Rotten Tomatoes' audience score is **`popcorn`** there, and `tomatoes` is the critics' tomatometer. #20 coded `audience` from this table, so the audience badge was silently never drawn until #45 (`decisions.md` §15). **Read the measured list below before coding against any name in this table.**

The `return_rating` enum above is the most authoritative list of source identifiers MDBList publishes *for those parameters*. Cross-checked against the `sort` enums on `GET /lists/{listid}/items` and `GET /catalog/movie`, which use the internal column names:

| Source | `return_rating` value | `sort` value |
| --- | --- | --- |
| IMDb | `imdb` | `imdbrating` (also `imdbvotes`, `imdbpopular`) |
| TMDb | `tmdb` | `tmdbpopular` |
| **Rotten Tomatoes — critics** | **`tomatoes`** | `rtomatoes` |
| **Rotten Tomatoes — audience** | **`audience`** *(this parameter only — the `ratings[]` source is **`popcorn`**)* | `rtaudience` |
| **Metacritic** | **`metacritic`** | `metacritic` |
| **Letterboxd** | **`letterboxd`** | `letterrating` (also `lettervotes`) |
| **Trakt** | **`trakt`** | *(not in the sort enum)* |
| Roger Ebert | `rogerebert` | `rogerebert` |
| MyAnimeList | `mal` | `myanimelist` |
| MDBList score | `score` | `score` |
| MDBList average score | `score_average` | `score_average` |

**All four sources story 80 asks for are confirmed available, and #45 confirmed each one against a real response — under the `ratings[]` names, which for the audience score is `popcorn` and not this table's `audience`: Rotten Tomatoes audience (`popcorn`), Metacritic (`metacritic`), Letterboxd (`letterboxd`), Trakt (`trakt`).**

### How the API key is passed

From `components.securitySchemes` in the schema, and confirmed by the live API's own error text:

```json
"apiKey":     { "type": "apiKey", "in": "query", "name": "apikey",
                "description": "API key passed as a query parameter: ?apikey=YOUR_KEY" },
"bearerAuth": { "type": "http", "scheme": "bearer",
                "description": "OAuth 2.0 access token: Authorization: Bearer YOUR_TOKEN" }
```

Both the single and batch media endpoints declare `security: [{apiKey: []}, {bearerAuth: []}]` — either works.

Confirmed live:

```
$ curl https://api.mdblist.com/imdb/movie/tt0133093/
{"error":"Authentication required. Provide either 'Authorization: Bearer <token>' header or '?apikey=<key>' parameter"}

$ curl 'https://api.mdblist.com/imdb/movie/tt0133093/?apikey=test'
{"error":"Invalid API key"}
```

So: **`?apikey=<key>` (all lowercase) as a query parameter**, or `Authorization: Bearer <token>` for OAuth. The key is obtained free from MDBList Preferences (<https://docs.mdblist.com/docs/api>).

**Architectural consequence.** The host's MDBList key is a container setting (user stories 5, 80) and must not reach the browser. Since the key goes in a *query string*, a naive browser-side call would leak it into logs and referrers. Proxy MDBList through Jellyflick's own server side and let the browser call a Jellyflick route; that also gives us one place to cache.

### Response shape — single lookup

Documented properties of the 200 response ("Media item with ratings and metadata"):

| Field | Type |
| --- | --- |
| `id` | integer (MDBList's own id) |
| `imdb_id` | string |
| `title` | string |
| `year` | integer |
| `type` | string |
| **`score`** | number (the MDBList composite score, 0–100) |
| **`ratings`** | **array of objects** |
| `streams` | array of objects |
| `recommendations` | array of objects (only with `append_to_response=recommendations`) |
| `next_episode` | object, nullable — shows only |
| `last_episode` | object, nullable — shows only |

**`ratings[]` item shape: still undocumented, but now MEASURED (#45).** MDBList's OpenAPI schema types the array elements as a bare `{"type": "object"}` with no properties, and no example anywhere in the schema shows one. The `/docs/score.html` page says only that "the score is calculated using all the ratings average and with a votes baseline" and names no keys. The docs navigation (`/docs/keywords.html`, `/docs/list_types.html`, `/docs/popular_lists.html`, `/docs/score.html`, `/docs/external_lists.html`, `/docs/import_from_names.html`, how-tos, RSS, third-party, `/docs/api`, `/docs/supporter.html`) contains no example response JSON.

So #45 made two real calls with the host's key and kept both answers: `test/fixtures/mdblist-imdb-movie-tt0133093.json` (The Matrix) and `test/fixtures/mdblist-imdb-show-tt0944947.json` (Game of Thrones), behind `test/fixtures/mdblist.ts`. An element is:

```json
{ "source": "popcorn", "value": 85, "score": 85, "votes": 1307885, "url": "/m/matrix" }
```

`value` and `votes` are nullable, `score` is an undocumented 0–100 normalisation of `value` (Letterboxd `4.2` → `84`), and `url` is a path string, a bare number or `null`. The full reading, and what the app does about each part, is `decisions.md` §15. The adapter still skips what it does not recognise, which story 81 ("missing ratings left out") wants anyway.

**The ten `source` values a real `ratings[]` carries** — this, and not the `return_rating` enum below, is the element vocabulary:

`imdb`, `metacritic`, `metacriticuser`, `trakt`, `tomatoes`, `popcorn`, `tmdb`, `letterboxd`, `rogerebert`, `myanimelist`.

The other open shapes, also undocumented and also to verify if needed: `streams[]`, `recommendations[]`, `next_episode`, `last_episode`. For `episode_ratings` the description *does* give the shape:

- Supporters: `{"seasons": [{"season_number", "label", "avg", "episodes": [{"episode_number", "rating", "votes"}]}], "updated_at"}`
- Non-Supporters: `{"seasons": [], "total_rated_episodes", "overall_average", "updated_at"}`

### Rate limits

Verbatim from `info.description` in the schema (<https://api.mdblist.com/schema/>):

> Limits apply per account, shared across all of its API keys and OAuth apps.
>
> - **Daily limit** depends on the account's supporter tier (1,000 requests per day on the free tier) and resets at 00:00 UTC. Successful responses report it in `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix timestamp).
> - **5-minute limit**: at most 1,000 read requests and 300 write requests per 5-minute window, on every tier. Windows are fixed (they start at :00, :05, :10, ...), not rolling. GET requests count as reads, other methods as writes, except a few POST batch-lookup endpoints that count as reads.
>
> Exceeding either limit returns `429 Too Many Requests` with a `Retry-After` header (seconds). The `error` field tells the two apart: `Daily API limit exceeded!` or `API rate limit exceeded!`. Wait for `Retry-After` before retrying instead of retrying in a loop.

Daily caps by tier, from <https://docs.mdblist.com/docs/api>:

| Tier | Requests/day |
| --- | --- |
| Free | 1,000 |
| 1 € | 10,000 |
| 2 € | 25,000 |
| 3 € | 100,000 |
| 5 € VIP | 250,000 |

**Design implications for Jellyflick.** 1,000/day on the free tier is tight for a household browsing a library — a single Home load with a dozen rows showing compact ratings on hover (story 82) could burn through it. Therefore:

- Cache aggressively, server-side, keyed on `{provider}:{id}`. Ratings move slowly; a TTL of hours to a day is fine.
- Fetch ratings **on the title page** (story 82's primary surface) and for the enlarged card only on hover, not eagerly for every card in a row.
- Use `POST /rating/{media_type}/{return_rating}` (10 ids per call for non-Supporters, 100 for Supporters) when several titles are needed at once — but note it returns **one source per call**, so four sources for one batch is four requests. The single `GET /{provider}/{type}/{id}/` returns all sources in one request, which is usually the better trade.
- Honour `Retry-After` and read `X-RateLimit-Remaining`; degrade silently to Jellyfin's own `CriticRating`/`CommunityRating` when the budget is gone. Story 80 already treats MDBList ratings as an optional extra.
- MDBList is optional by design (no host key → no extra ratings), so every call site must already tolerate its absence.

---

## Summary: ratings for a title page

| Shown | Source | Field |
| --- | --- | --- |
| Rotten Tomatoes critic score | **Jellyfin** | `BaseItemDto.CriticRating` (0–100) |
| IMDb / TMDb community score | **Jellyfin** | `BaseItemDto.CommunityRating` (0–10; **absent when 0**) |
| Age rating | **Jellyfin** | `BaseItemDto.OfficialRating` |
| RT audience, Metacritic, Letterboxd, Trakt | **MDBList** | `GET /{imdb|tmdb}/{movie|show}/{id}/?apikey=…` → `ratings[]`, sources `popcorn` / `metacritic` / `letterboxd` / `trakt` (item shape measured in #45, §19 above) |

The join key is `BaseItemDto.ProviderIds.Imdb` (preferred) or `.Tmdb` — exact spellings, see `jellyfin-api.md` §17.
