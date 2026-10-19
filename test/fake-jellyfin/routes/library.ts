import type { FakeRoute } from '../routing.ts';
import { userForAccessToken, userForToken } from './users.ts';
import { TEST_VIDEO, WEBM } from './videos.ts';

/**
 * `LibraryController`: the one endpoint of it this app uses, which is
 * `GET /Items/{itemId}/Download` — Download File (#19, stories 76 and 77).
 *
 * Three of the real controller's habits are what a client has to cope with,
 * and all three are here:
 *
 * - **It is authorised, unlike the video stream beside it.** The real one
 *   carries `[Authorize(Policy = Policies.Download)]`, and that policy maps to
 *   exactly `PermissionKind.EnableContentDownloading`
 *   (`jellyfin-playback.md` §15). A User the Server does not allow gets a
 *   **403**, not a 404, so a client that drew the button anyway finds out.
 * - **The token may arrive in the query.** An `<a href>` cannot send an
 *   `Authorization` header, so `?ApiKey=` is the only way a download link can
 *   carry one — the real Server accepts it on every endpoint, and the two
 *   places this app uses it are here and a `<video src>`.
 * - **An item with no file is a 404.** Nothing is wrong with the Server or the
 *   request; there is simply nothing to send, which is why `CanDownload` says
 *   so in advance rather than letting a User press a button that fails.
 *
 * The bytes are the same committed test video every other byte-serving route
 * answers with — see "The fake Jellyfin serves real video" in
 * `docs/architecture.md`. No range support: a download is not a seek.
 */
export const libraryRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Items/:itemId/Download',
    handle: (request, state, params) => {
      // Either way a token can arrive: the header every XHR sends, and the
      // query an anchor has to use.
      const user =
        userForAccessToken(request.query.get('ApiKey') ?? '', state) ??
        userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      if (!user.Policy.EnableContentDownloading) {
        return {
          status: 403,
          body: { error: `${user.Name} is not allowed to download content.` },
        };
      }

      const itemId = params.itemId ?? '';
      const item = state.items.find((candidate) => candidate.Id === itemId);
      if (item === undefined) {
        return { status: 404, body: { error: `No item ${itemId}.` } };
      }
      if (item.media === undefined) {
        return { status: 404, body: { error: `No file behind ${itemId}.` } };
      }

      return {
        status: 200,
        bytes: TEST_VIDEO,
        contentType: WEBM,
        // The real Server names the original file, which is what gives the
        // browser something better than the item id to save it as.
        headers: {
          'Content-Disposition': `attachment; filename="${item.Name}.${item.media.Container ?? 'mkv'}"`,
        },
      };
    },
  },
];
