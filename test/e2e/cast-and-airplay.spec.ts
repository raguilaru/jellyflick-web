import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Cast in a real browser (#33): a real `<script>` off a real URL, a real
 * `window.chrome` gate, a real `<video>` handed over, and a real session the
 * Server recorded the end of.
 *
 * **This file is the ticket's answer to the one thing that has gone wrong
 * three times.** #29 shipped a subtitle renderer that had never started in a
 * browser; #30 drew nothing and pushed the controls off the screen; #32 let a
 * remote walk out of the player — each with an entirely green unit suite,
 * because the unit journey fakes the device layer. This ticket's version of
 * that failure is a Cast button that loads nothing, or loads it on every page
 * view, and `test/unit/casting-a-title.test.tsx` cannot tell either way: there
 * the sender is a recorder, and `loadCastSender` resolves without a network
 * stack being involved at all.
 *
 * So what is asserted here is only what needs a browser:
 *
 * - **That the SDK is fetched at the press and never before.** The negative is
 *   the more valuable half, and it is a *bundle* claim that no bundle listing
 *   can make — `playing-a-title.spec.ts` makes the same argument about hls.js.
 *   It is also not only about weight here: the script comes off
 *   `gstatic.com`, and most Jellyfin Servers are on a LAN with no route to
 *   the internet, so an eager fetch would have every page load ask the outside
 *   world for something it cannot have.
 * - **That a real `<script>` tag, a real `error` event and a real
 *   `window.__onGCastApiAvailable` behave as `cast-sender.ts` assumes.** There
 *   is no `<script>` loading in happy-dom and no global for one to call back
 *   on, so every line of that file is unexercised by the unit suite.
 * - **That the handover really stops this device**: a `<video>` that is really
 *   paused, and a `/Sessions/Playing/Stopped` the Server really recorded —
 *   once, not twice.
 * - **That AirPlay's WebKit fallback works against a real element and a real
 *   event.** `airplay-on-the-element.test.ts` pins it against an element
 *   shaped by hand, which cannot say whether a real `addEventListener` on a
 *   real `HTMLVideoElement` carries `event.availability` through at all.
 *
 * **The SDK is stubbed, and that line is drawn deliberately.** Google's real
 * `cast_sender.js` needs a Chromecast on the network and a Chrome with the
 * Cast implementation compiled in; no suite can have either. What is *not*
 * stubbed is everything this app owns: the `<script>` that fetches it, the
 * global it answers on, the options it is given, the message it is sent, and
 * the element that stops. The stub is served at the real URL, so even the
 * address is this app's rather than the test's.
 */

const PASSWORD = 'correct horse';

/** The real CAF Web Sender URL, which is what the app must ask for. */
const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js**';

/** What the stub records about how the app drove it, read back off the page. */
type CastRecord = {
  readonly setOptions: { receiverApplicationId?: string; autoJoinPolicy?: string }[];
  readonly sessionsRequested: number;
  readonly messages: { namespace: string; message: unknown }[];
  readonly endings: boolean[];
};

/**
 * A stand-in for Google's SDK, served at Google's own address.
 *
 * It installs the globals the real one installs and answers on the global the
 * real one answers on — which is the half of `cast-sender.ts` that only a
 * browser can run. `isAvailable` is a parameter because `false` is a real
 * answer the real SDK gives (a Chromium build with no Cast in it), and it is
 * the one branch a User sees a message for.
 */
function castSdkStub(options: { available: boolean; requestSessionRejectsWith?: string }): string {
  /*
   * `undefined` is a `requestSession()` that resolves, and a string is the
   * `chrome.cast.ErrorCode` the real SDK rejects with — `cancel` for a picker
   * the User dismissed, and codes like `receiver_unavailable` or `timeout`
   * for a receiver that would not start. Telling those two apart is the whole
   * of #65's first finding, and the bare string is the shape the CAF sender
   * really rejects with.
   */
  const rejection =
    options.requestSessionRejectsWith === undefined
      ? 'return Promise.resolve();'
      : `return Promise.reject(${JSON.stringify(options.requestSessionRejectsWith)});`;
  return `
(function () {
  var record = { setOptions: [], sessionsRequested: 0, messages: [], endings: [] };
  window.__castRecord = record;

  var session = {
    sendMessage: function (namespace, message) {
      record.messages.push({ namespace: namespace, message: message });
      return Promise.resolve();
    },
    getCastDevice: function () {
      return { friendlyName: 'Living Room' };
    },
  };

  var context = {
    setOptions: function (options) {
      record.setOptions.push(options);
    },
    requestSession: function () {
      record.sessionsRequested += 1;
      ${rejection}
    },
    getCurrentSession: function () {
      return session;
    },
    endCurrentSession: function (stopCasting) {
      record.endings.push(stopCasting);
    },
  };

  window.chrome = window.chrome || {};
  window.chrome.cast = { AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' } };
  window.cast = { framework: { CastContext: { getInstance: function () { return context; } } } };

  // The real SDK's own handshake: a global the page installed before this
  // script was appended, called once the SDK has initialised.
  if (typeof window.__onGCastApiAvailable === 'function') {
    window.__onGCastApiAvailable(${String(options.available)});
  }
})();
`;
}

/**
 * Serves the stub at the real URL, and hands back every request the page made
 * for it.
 *
 * The URLs are collected from `page.on('request')` **as well as** from the
 * route, because the two answer different questions: the route only fires for
 * a request that was made, and what the lightness assertion needs to know is
 * that none was.
 */
async function serveCastSdk(
  page: Page,
  options: {
    available?: boolean;
    failToLoad?: boolean;
    /*
     * How many loads fail before the script is served — the household whose
     * internet blinked and came back (#65's second finding). `failToLoad`
     * is the same thing without end.
     */
    failFirstLoads?: number;
    requestSessionRejectsWith?: string;
  } = {},
): Promise<string[]> {
  const asked: string[] = [];
  let failuresLeft = options.failFirstLoads ?? 0;
  page.on('request', (request) => {
    if (request.url().includes('gstatic.com')) asked.push(request.url());
  });
  await page.route(CAST_SDK_URL, (route) => {
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      return route.abort('failed');
    }
    if (options.failToLoad === true) {
      /*
       * A LAN with no route out, which is most of what Jellyfin is used for.
       * An aborted request fires the `<script>`'s own `error` event — the
       * thing `cast-sender.ts` resolves `false` from, and the thing no unit
       * test can produce.
       */
      return route.abort('failed');
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: castSdkStub({
        available: options.available ?? true,
        ...(options.requestSessionRejectsWith === undefined
          ? {}
          : { requestSessionRejectsWith: options.requestSessionRejectsWith }),
      }),
    });
  });
  return asked;
}

function castRecord(page: Page): Promise<CastRecord | undefined> {
  return page.evaluate(
    () => (window as unknown as { __castRecord?: CastRecord }).__castRecord,
  );
}

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/** Where the `<video>` has got to, which is the proof it really decoded. */
function positionIn(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? -1 : video.currentTime;
  });
}

function pausedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? false : video.paused;
  });
}

/**
 * Arrival, playing and then paused with the controls up — the same helper
 * every browser test of the player uses, and paused for the same reason: the
 * committed file runs for six seconds, and a Title left running would end and
 * close the player part-way through walking a menu with the arrow keys.
 */
async function playAndPauseArrival(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  // The URL, not the `h1`: the Billboard draws a name in an `h1` too, and
  // three tickets in a row were caught looking at Home and not knowing.
  await expect(page).toHaveURL(/\/title\/movie-arrival$/);

  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible();
  await expect.poll(() => positionIn(page), { timeout: 20_000 }).toBeGreaterThan(0.8);
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();
}

/**
 * Opens the playback options by direction alone (#40's rule for a new
 * focusable thing over the picture), retrying because visible is not settled —
 * #30's flake, in the one place this ticket was told to expect it.
 */
async function openPlaybackOptions(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: 'Playback options for Arrival' });
  const menu = page.getByRole('dialog', { name: 'Playback options' });
  await expect(open).toBeVisible({ timeout: 30_000 });

  await expect(async () => {
    if (!(await menu.isVisible())) {
      await reachByArrowKeys(page, open);
      await open.press('Enter');
    }
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Presses one button inside the menu, by direction, as a remote would. */
async function pressInOptions(page: Page, name: string): Promise<void> {
  const button = page
    .getByRole('dialog', { name: 'Playback options' })
    .getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  await reachByArrowKeys(page, button);
  await button.press('Enter');
}

type Write = { method: string; path: string; body: Record<string, unknown> };

async function writesTo(request: APIRequestContext, path: string): Promise<Write[]> {
  const writes = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)).json()) as Write[];
  return writes.filter((write) => write.path === path);
}

/**
 * The state is put back and both logs forgotten after every test: closing the
 * player reports a stop behind the User, which can land after this hook and
 * leave the next test a resume point nobody chose — on a six-second file, near
 * the end. #52's shape in the browser suite.
 */
test.afterEach(async ({ request }: { request: APIRequestContext }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
});

/**
 * The negative, and the assertion this file exists for as much as any:
 * **nothing asks `gstatic.com` for anything until a User presses Cast.**
 *
 * It cannot be stated anywhere else. A bundle listing cannot say it — the
 * script is not in the bundle at all, it is a tag `cast-sender.ts` appends —
 * and the unit suite cannot say it either, because there `loadCastSender`
 * resolves a recorder and no URL is ever involved. Only a browser that was
 * watched making requests can.
 *
 * **What it does not catch, measured rather than assumed.** Making
 * `browser.ts` import `cast-sender.ts` statically leaves this test green, and
 * that is correct rather than a gap: the `<script>` is appended inside
 * `createCastSender`, so a module in the main bundle still fetches gstatic
 * only on the press. The two claims are separate, and only one of them is a
 * network fact —
 *
 * - **nothing fetches gstatic until the press**, which is this test, and is
 *   what matters to a Server on a LAN with no route out;
 * - **`cast-sender.ts` is its own chunk**, which is a *build* fact and belongs
 *   where `image-subtitles.test.tsx` puts the same claim: the bundle numbers
 *   in the ticket's report. The sender is a kilobyte either way, so this one
 *   is about tidiness, where the first is about the app working at all.
 */
test('asks gstatic for nothing until a User presses Cast', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  const asked = await serveCastSdk(page);

  await signIn(page);
  // Signing in, Home, and a title page: nothing here is a reason to fetch an
  // SDK, and a LAN with no internet reaches all three.
  expect(asked).toEqual([]);

  await playAndPauseArrival(page);
  expect(asked).toEqual([]);

  // The menu the control lives in is not the press either: opening it is how
  // a User looks at what is on offer.
  await openPlaybackOptions(page);
  expect(asked).toEqual([]);
  // And the control really is there, so the zero above is about laziness and
  // not about a feature that was never drawn — this browser has
  // `window.chrome`, which is the device layer's own cheap gate.
  await expect(
    page.getByRole('dialog', { name: 'Playback options' }).getByRole('button', { name: 'Cast' }),
  ).toBeVisible();

  await pressInOptions(page, 'Cast');

  // The press, and only the press.
  await expect.poll(() => asked.length, { timeout: 20_000 }).toBe(1);
  expect(asked[0]).toContain('/cv/js/sender/v1/cast_sender.js');
  // With the framework, not the base API alone: `loadCastFramework=1` is what
  // puts `cast.framework` on the page, and `cast-sender.ts` uses nothing else.
  expect(asked[0]).toContain('loadCastFramework=1');
});

/**
 * The whole path, in a browser: a real `<script>` loaded, a real global called
 * back on, the receiver the Server named, Jellyfin's message, and a `<video>`
 * that really stopped.
 */
test('loads the SDK on demand and hands the Title to the receiver', async ({ page, request }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  // The receiver this User's **own account** names, which is `decisions.md`
  // §8's requirement and what #35 made the fake able to serve.
  await page.request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { userConfiguration: { 'user-rafael': { CastReceiverId: '6F511C87' } } },
  });
  await serveCastSdk(page);

  await signIn(page);
  await playAndPauseArrival(page);
  const wasAt = await positionIn(page);
  expect(wasAt).toBeGreaterThan(0.5);

  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  /*
   * **The SDK really initialised.** This is the assertion the unit suite
   * cannot reach at all: it means a `<script>` was appended to a real
   * document, fetched over a real network stack, executed, and called
   * `window.__onGCastApiAvailable` — a global installed *before* the tag, in
   * the order the real SDK requires.
   */
  /*
   * Polled on the **message**, which is the last thing the press does, and
   * then the whole record is read once. Polling an earlier step and reading a
   * later one is a race that passes by luck: it was written that way first,
   * and a deliberate break caught it reading `messages` before the send had
   * settled, with nothing wrong but the test.
   */
  await expect.poll(async () => (await castRecord(page))?.messages.length ?? 0, {
    timeout: 30_000,
  }).toBe(1);
  const record = await castRecord(page);
  expect(record?.setOptions.length).toBe(1);
  expect(record?.setOptions[0]?.receiverApplicationId).toBe('6F511C87');
  // Origin-scoped auto-join, so a reload during a cast rejoins the session it
  // left rather than opening a second one.
  expect(record?.setOptions[0]?.autoJoinPolicy).toBe('origin_scoped');
  expect(record?.sessionsRequested).toBe(1);

  // One PlayNow, on Jellyfin's own namespace.
  expect(record?.messages.length).toBe(1);
  expect(record?.messages[0]?.namespace).toBe('urn:x-cast:com.connectsdk');
  const message = record?.messages[0]?.message as {
    command: string;
    options: { items: { Id: string }[]; startPositionTicks: number };
    userId: string;
    accessToken: string;
    deviceId: string;
    serverAddress: string;
    serverId: string;
  };
  expect(message.command).toBe('PlayNow');
  expect(message.options.items).toEqual([{ Id: 'movie-arrival' }]);
  // From where the User had got to, which is the element's own position in
  // ticks rather than a number held beside it.
  expect(message.options.startPositionTicks).toBeGreaterThan(5_000_000);
  /*
   * The credentials the receiver reports progress to Jellyfin with — the
   * fourth acceptance criterion. `serverId` comes off the real
   * `/System/Info/Public`, so this is also the only test that says the extra
   * call is really made and really answered.
   */
  expect(message.userId).toBe('user-rafael');
  expect(message.serverAddress).toBe(FAKE_JELLYFIN_URL);
  expect(message.accessToken).not.toBe('');
  expect(message.deviceId).not.toBe('');
  expect(message.serverId).not.toBe('');

  // A User can see where it went.
  await expect(page.getByText('Casting to Living Room.')).toBeVisible();
  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toHaveCount(0);

  /*
   * **And this device really stopped.** A real `<video>` that is really paused
   * — happy-dom's `paused` is a field a test can set, and a browser's is the
   * decoder's own answer — and exactly **one** `/Sessions/Playing/Stopped`
   * the Server recorded, at the position the User reached. Two would be the
   * bug the handover exists to prevent: the receiver opens a session of its
   * own, and a resume point belonging to whichever stopped last.
   */
  expect(await pausedIn(page)).toBe(true);
  await expect
    .poll(async () => (await writesTo(request, '/Sessions/Playing/Stopped')).length, {
      timeout: 30_000,
    })
    .toBe(1);
  const stopped = (await writesTo(request, '/Sessions/Playing/Stopped'))[0];
  expect(stopped?.body.ItemId).toBe('movie-arrival');
  expect(stopped?.body.PositionTicks as number).toBeGreaterThan(5_000_000);
  expect(stopped?.body.Failed).toBe(false);

  /*
   * Stopping ends the session on the receiver as well as disconnecting from
   * it — `true` is "stop casting", and a User who pressed Stop wants the
   * television to stop rather than keep playing with nothing driving it.
   */
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Stop casting');
  await expect.poll(async () => (await castRecord(page))?.endings ?? [], { timeout: 20_000 })
    .toEqual([true]);
  await expect(page.getByText('Casting to Living Room.')).toHaveCount(0);
  // The Title is still open here: ending a cast is not closing the player.
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  // And still one stop, not two: the close reports nothing a handover already
  // reported, which is `reporting.ts`'s once-only `stopped`.
  expect((await writesTo(request, '/Sessions/Playing/Stopped')).length).toBe(1);
});

/**
 * **A Server on a LAN with no route to the internet**, which is most of what
 * Jellyfin is used for — and the only test in the project that produces a
 * real `<script>` `error` event.
 *
 * `cast-sender.ts` resolves `false` from that listener rather than throwing,
 * and the player turns it into one message beside the picture. Neither half
 * can be exercised anywhere else: happy-dom loads no scripts, so the listener
 * is dead code to the unit suite.
 */
test('says so beside the picture when gstatic cannot be reached', async ({ page, request }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await serveCastSdk(page, { failToLoad: true });

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toBeVisible({
    timeout: 30_000,
  });

  /*
   * **And nothing was handed over**, which is the half that matters more than
   * the message: a cast that never happened must leave the Title exactly where
   * it was. The player is still here, the element is still the one playing,
   * and the Server has been told of no stop at all.
   */
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByText('Casting to Living Room.')).toHaveCount(0);
  expect((await writesTo(request, '/Sessions/Playing/Stopped')).length).toBe(0);
  // Really still playable: a press of Play moves the element on.
  await page.getByRole('button', { name: 'Play Arrival' }).press('Enter');
  await expect.poll(() => positionIn(page), { timeout: 20_000 }).toBeGreaterThan(1);
});

/**
 * The SDK's other real answer: it loaded, and it says this browser has no Cast
 * in it. `__onGCastApiAvailable(false)` is `decisions.md` §8's "cannot be
 * detected without loading the SDK" arriving the expensive way round, and a
 * User is owed the same one message as any other failure.
 */
test('says so when the SDK loads and reports no Cast available', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await serveCastSdk(page, { available: false });

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toBeVisible({
    timeout: 30_000,
  });
  // The SDK was asked for its options by nobody: a sender that is not
  // available is never configured.
  expect((await castRecord(page))?.setOptions ?? []).toEqual([]);
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
});

/**
 * **#65's first finding, and the one a User felt.** A receiver that will not
 * start — asleep, no receiver app installed, a launch that timed out — used to
 * be read as a dismissed picker and said nothing at all: the menu had already
 * closed, the Title kept playing here, and the press looked like it had simply
 * done nothing.
 *
 * The SDK rejects `requestSession()` for both, so only the error code tells
 * them apart, and only a browser can produce the rejection — happy-dom has no
 * SDK to reject. This is the regression test for the code being read.
 */
test('says so beside the picture when a receiver will not start', async ({ page, request }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await serveCastSdk(page, { requestSessionRejectsWith: 'receiver_unavailable' });

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toBeVisible({
    timeout: 30_000,
  });

  // The picker really was asked, so the silence this replaces was not a
  // feature that never ran: it is a launch that was attempted and failed.
  await expect.poll(async () => (await castRecord(page))?.sessionsRequested ?? 0).toBe(1);
  // And nothing was handed over, exactly as for a gstatic that cannot be
  // reached: the Title is still here and the Server has been told no stop.
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByText('Casting to Living Room.')).toHaveCount(0);
  expect((await writesTo(request, '/Sessions/Playing/Stopped')).length).toBe(0);
});

/**
 * The other half of the same finding, and the reason it cannot simply be
 * "say something whenever `requestSession()` rejects": **a dismissed picker
 * still says nothing.** `cancel` is a User's own decision, and telling them
 * something went wrong would be telling them their choice was an error.
 */
test('says nothing at all when a User dismisses the picker', async ({ page, request }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await serveCastSdk(page, { requestSessionRejectsWith: 'cancel' });

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  await expect.poll(async () => (await castRecord(page))?.sessionsRequested ?? 0).toBe(1);
  /*
   * The menu has closed and the player is back. Waiting for the player to be
   * the thing on screen is what makes the absence below meaningful rather
   * than merely early — the message, if it came, would be beside the picture
   * and would have come by now.
   */
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Playback options' })).toHaveCount(0);
  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toHaveCount(0);
  await expect(page.getByText('Casting to Living Room.')).toHaveCount(0);
  expect((await writesTo(request, '/Sessions/Playing/Stopped')).length).toBe(0);
});

/**
 * **#65's second finding.** The load promise is cached so two presses in
 * flight share one `<script>`, and it used to cache failures too — so a
 * household whose internet blinked got the same message on every later press,
 * without a single request being attempted, until they reloaded the page.
 *
 * The first load is aborted and the second served. Two presses, two real
 * requests to gstatic, and the second one casts.
 */
test('retries the SDK on a later press after a load that failed', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  const asked = await serveCastSdk(page, { failFirstLoads: 1 });

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => asked.length, { timeout: 20_000 }).toBe(1);

  // The internet came back. The same press again, with nothing reloaded.
  await openPlaybackOptions(page);
  await pressInOptions(page, 'Cast');

  /*
   * **A second real request**, which is the whole finding: the cached failure
   * used to short-circuit here and never reach the network at all.
   */
  await expect.poll(() => asked.length, { timeout: 20_000 }).toBe(2);
  await expect(page.getByText('Casting to Living Room.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Jellyflick could not reach a Cast device.')).toHaveCount(0);
});

/**
 * AirPlay's **WebKit fallback**, against a real `HTMLVideoElement` and a real
 * event (#33, `decisions.md` §8).
 *
 * The standard Remote Playback API is what `air-play.ts` prefers and what a
 * current Safari takes; the fallback is for older ones, and it is the half
 * with the trap in it — `event.availability` is the string `"not-available"`,
 * which is truthy. This deletes `remote` from the prototype so the fallback is
 * the path taken, installs the WebKit pair, and then dispatches Safari's own
 * event on the element the player is really using.
 *
 * It is a stand-in for Safari and says so. What it is **not** standing in for
 * is this app's own code: a real element, a real `addEventListener`, a real
 * `dispatchEvent` carrying a real `availability` property, and the real
 * control appearing and disappearing with it. The unit test's element is
 * shaped by hand and cannot say that a browser carries the property through.
 */
test('offers AirPlay through the WebKit fallback once a target exists', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

  await page.addInitScript(() => {
    // The standard API is what Chromium has, so it has to go for the fallback
    // to be the path under test.
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).remote;
    (window as unknown as Record<string, unknown>).WebKitPlaybackTargetAvailabilityEvent =
      function () {
        /* Safari's constructor, present only so detection finds it. */
      };
    (
      HTMLVideoElement.prototype as unknown as Record<string, unknown>
    ).webkitShowPlaybackTargetPicker = function () {
      (window as unknown as { __airPlayPicked?: number }).__airPlayPicked =
        ((window as unknown as { __airPlayPicked?: number }).__airPlayPicked ?? 0) + 1;
    };
  });

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);

  const airPlay = page
    .getByRole('dialog', { name: 'Playback options' })
    .getByRole('button', { name: 'AirPlay', exact: true });

  // Nothing yet: Safari has the API, and there is nowhere to send it.
  await expect(airPlay).toHaveCount(0);

  /** Safari's own event, with the string availability it really carries. */
  const announce = (availability: string): Promise<void> =>
    page.evaluate((state) => {
      const video = document.querySelector('video');
      if (video === null) return;
      const event = new Event('webkitplaybacktargetavailabilitychanged');
      Object.defineProperty(event, 'availability', { value: state });
      video.dispatchEvent(event);
    }, availability);

  await announce('available');
  await expect(airPlay).toBeVisible({ timeout: 20_000 });

  await reachByArrowKeys(page, airPlay);
  await airPlay.press('Enter');
  // Safari's own picker, opened on the element — the third acceptance
  // criterion, and all of it this app is responsible for.
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as { __airPlayPicked?: number }).__airPlayPicked ?? 0),
      { timeout: 20_000 },
    )
    .toBe(1);

  /*
   * **And the Title is still playing here**, which is the difference from Cast
   * that is worth asserting rather than describing: AirPlay routes the element
   * Safari is already decoding, so there is no handover and this session keeps
   * reporting. A player that handed over for AirPlay too would stop a Title
   * that then played nowhere.
   */
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();

  // The string, not its truthiness: `"not-available"` takes the control away.
  await openPlaybackOptions(page);
  await announce('not-available');
  await expect(airPlay).toHaveCount(0);
});
