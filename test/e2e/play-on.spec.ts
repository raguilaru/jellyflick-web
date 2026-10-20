import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Play On in a real browser (#34): a control a remote can reach, a panel a
 * remote cannot walk out of, a real `<video>` that really stops, and a row of
 * buttons measured against a real 390px screen.
 *
 * **This file is the ticket's answer to the thing that has gone wrong four
 * times.** #29 shipped a subtitle renderer that had never started in a
 * browser; #30 drew nothing and pushed the controls off the screen; #32 let a
 * remote walk out of the player; #33's Cast button never appeared at all in
 * plain Chromium. Every one of them had an entirely green unit suite, and the
 * cause is structural: happy-dom gives every box a zero size, so nothing there
 * can be measured or reached by direction.
 *
 * Play On's own version of that failure is the smallest and likeliest of the
 * four: **it adds one more button to the options row**, which is exactly what
 * #44 shipped as a 635px row on a 375px screen with every e2e assertion
 * passing. So what is asserted here is only what needs a browser:
 *
 * - **That the new control's own right edge is inside the viewport**, which is
 *   #56's rule and not the same claim as "the document does not scroll":
 *   Playwright scrolls a control into view before touching it, and a clipped
 *   control does not lengthen the document, so both the press and the
 *   scroll-width assertion are blind to it. The *only* assertion that sees it
 *   is the control's own box against the viewport's width.
 * - **That a remote reaches the control and then the rows.** A new focusable
 *   thing over the picture and a whole new dialog of them is #40's and #31's
 *   territory, and `focusableItems()` drops zero-sized elements, so in
 *   happy-dom the arrow keys move nothing and every journey test passes
 *   regardless of whether this is reachable at all.
 * - **That focus comes back out of the panel with it.** #53 is the same defect
 *   in `TrackPicker`: Done closes the dialog, the focused button goes with it,
 *   and the browser hands focus to the document — from where the arrow keys
 *   walk the title page *behind* the picture. It cannot be seen in happy-dom
 *   for the same zero-size reason.
 * - **That the handover really stops this device**: a `<video>` that is really
 *   paused, and a `/Sessions/Playing/Stopped` the Server really recorded —
 *   once, not twice.
 *
 * **Nothing is stubbed here**, and that is Play On's own advantage over Cast:
 * there is no SDK, no receiver and no `window` to fake. The other Jellyfin app
 * is a seeded session on the fake Server, which answers `GET /Sessions` and
 * both command families for real.
 */

const PASSWORD = 'correct horse';

/** A television in the next room, as `GET /Sessions` answers with it. */
const LIVING_ROOM = {
  Id: 'session-living-room',
  DeviceId: 'device-living-room',
  DeviceName: 'Living Room TV',
  Client: 'Jellyfin Android TV',
  UserId: 'user-rafael',
  UserName: 'Rafael',
  SupportsRemoteControl: true,
  SupportsMediaControl: true,
  PlayableMediaTypes: ['Video', 'Audio'],
};

type Write = { method: string; path: string; body: Record<string, unknown> };

async function writesUnder(request: APIRequestContext, prefix: string): Promise<Write[]> {
  const writes = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)).json()) as Write[];
  return writes.filter((write) => write.path.startsWith(prefix));
}

/**
 * This device's own playback reports, by exact path. The prefix is shared with
 * the `PlayNow` that hands the Title over — `POST /Sessions/{id}/Playing` —
 * so a prefix match would count that as a start of our own.
 */
async function reportsAt(request: APIRequestContext, path: string): Promise<Write[]> {
  return (await writesUnder(request, path)).filter((write) => write.path === path);
}

async function seedTheLivingRoom(page: Page): Promise<void> {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await page.request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { sessions: [LIVING_ROOM] },
  });
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
  // The URL, not the `h1`: the Billboard draws a name in an `h1` too.
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

/** Presses one button inside a dialog, by direction, as a remote would. */
async function pressInDialog(page: Page, dialog: string, name: string | RegExp): Promise<void> {
  const button = page
    .getByRole('dialog', { name: dialog })
    .getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
  await expect(button).toBeVisible();
  await reachByArrowKeys(page, button);
  await button.press('Enter');
}

/** Opens the Play On panel from a paused player, by direction throughout. */
async function openPlayOn(page: Page): Promise<void> {
  await openPlaybackOptions(page);
  await pressInDialog(page, 'Playback options', 'Play on');
  await expect(page.getByRole('dialog', { name: 'Play on another app' })).toBeVisible();
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
 * **The measurement this ticket exists to pass, and the one no unit test can
 * make.** Play On adds a fifth button to the options menu's bottom row, and
 * that row is the one #44 shipped 635px wide on a 375px screen with every
 * assertion green — because Playwright scrolls a control into view before
 * touching it, so a press proves nothing about where the control is.
 *
 * #56 is the other half, filed an hour before this ticket: a control clipped
 * by the edge of the screen **does not lengthen the document**, so even the
 * scroll-width assertion is blind to it. Both are asserted here, because they
 * fail in different ways —
 *
 * - every control's **own right edge** inside the viewport, which is the only
 *   assertion that sees a clipped button;
 * - the document not scrolling sideways, which is #44's assertion and catches
 *   the different bug of a panel that is simply too wide.
 */
test('the options row and the Play On panel fit the screen they are drawn on', async ({ page }) => {
  await seedTheLivingRoom(page);
  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);

  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('No viewport to measure against.');

  /** Every button in a dialog, by its own right edge and its own left one. */
  async function edgesIn(dialog: string): Promise<{ name: string; left: number; right: number }[]> {
    const buttons = page.getByRole('dialog', { name: dialog }).getByRole('button');
    const count = await buttons.count();
    const edges: { name: string; left: number; right: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      const box = await button.boundingBox();
      if (box === null) continue;
      edges.push({
        name: (await button.textContent()) ?? '?',
        left: box.x,
        right: box.x + box.width,
      });
    }
    return edges;
  }

  const inOptions = await edgesIn('Playback options');
  // The control really is there, so the measurement below is about a button
  // that exists rather than about one that was never drawn — #33's own trap.
  expect(inOptions.some((edge) => edge.name.includes('Play on'))).toBe(true);
  for (const edge of inOptions) {
    expect(edge.left, `${edge.name} starts off the left of the screen`).toBeGreaterThanOrEqual(0);
    expect(edge.right, `${edge.name} runs off the right of the screen`).toBeLessThanOrEqual(
      viewport.width,
    );
  }

  await pressInDialog(page, 'Playback options', 'Play on');
  await expect(page.getByRole('dialog', { name: 'Play on another app' })).toBeVisible();
  // The list has arrived, so the row being measured is the real one and not
  // the "Looking for other Jellyfin apps…" notice.
  await expect(
    page.getByRole('dialog', { name: 'Play on another app' }).getByRole('button', {
      name: /Living Room TV/,
    }),
  ).toBeVisible();

  for (const edge of await edgesIn('Play on another app')) {
    expect(edge.left, `${edge.name} starts off the left of the screen`).toBeGreaterThanOrEqual(0);
    expect(edge.right, `${edge.name} runs off the right of the screen`).toBeLessThanOrEqual(
      viewport.width,
    );
  }

  // #44's assertion as well, which catches the different failure of a panel
  // too wide for the screen rather than a control clipped by it.
  const overflowing = await page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    return scrollWidth > clientWidth + 1;
  });
  expect(overflowing).toBe(false);
});

/**
 * The whole path in a browser, driven **only by direction keys**: a remote
 * reaches the control, reaches the row, and the `<video>` really stops.
 *
 * The reachability half is #31's and #40's lesson and cannot be stated
 * anywhere else — `focusableItems()` drops zero-sized elements, so in
 * happy-dom the arrow keys move nothing and the unit journey is green whether
 * a remote can reach any of this or not.
 */
test('a remote reaches the other app, and this device really stops', async ({ page, request }) => {
  await seedTheLivingRoom(page);
  await signIn(page);
  await playAndPauseArrival(page);

  const reached = await positionIn(page);
  expect(reached).toBeGreaterThan(0.8);

  await openPlayOn(page);
  // The list came off the Server, and the row says what that app is playing.
  const row = page
    .getByRole('dialog', { name: 'Play on another app' })
    .getByRole('button', { name: /Living Room TV/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Nothing playing');

  await pressInDialog(page, 'Play on another app', /Living Room TV/);

  // The `PlayNow` the Server really received, with the position this device
  // really reached — every argument a query parameter, and no body at all.
  await expect
    .poll(async () => (await writesUnder(request, '/Sessions/session-living-room/Playing')).length, {
      timeout: 20_000,
    })
    .toBe(1);
  const [sent] = await writesUnder(request, '/Sessions/session-living-room/Playing');
  expect(sent?.path).toContain('playCommand=PlayNow');
  expect(sent?.path).toContain('itemIds=movie-arrival');
  expect(sent?.body).toBe(undefined);

  // **The handover, against a real element.** The picture here is really
  // paused, not merely marked so by a fake.
  await expect.poll(() => pausedIn(page), { timeout: 20_000 }).toBe(true);

  /*
   * And the Server has **one** stop for this session, not two. `stopped` is
   * once-only in `reporting.ts`, and the close that follows must report
   * nothing again — a claim that needs a real player really closing.
   *
   * Polled rather than read once, and that is not boilerplate: `handOver`
   * pauses the element **before** it awaits the stop report, so the paused
   * picture above is observable a round trip before the write is. Read once,
   * this passed on `desktop` and `keyboard-only` and failed on `phone` for no
   * reason that had anything to do with a phone.
   */
  async function stopsSoFar(): Promise<Write[]> {
    return (await writesUnder(request, '/Sessions/Playing/Stopped')).filter(
      (write) => write.path === '/Sessions/Playing/Stopped',
    );
  }
  await expect.poll(async () => (await stopsSoFar()).length, { timeout: 20_000 }).toBe(1);
  const stops = await stopsSoFar();
  // At a position the `<video>` had really decoded its way to, which is what
  // makes the other room pick the Title up where this User left it.
  const at = Number(stops[0]?.body.PositionTicks ?? 0) / 10_000_000;
  expect(at).toBeGreaterThan(0.5);

  // Where the Title went, said beside the picture.
  await expect(page.getByText('Playing on Living Room TV.')).toBeVisible();
});

/**
 * **Focus comes back out of the panel with it**, which is #53's defect met
 * before it could be shipped again: the press that opened this panel was on a
 * button the panel is drawn over, every choice in it closes it, and a browser
 * then hands focus to the document — from where the arrow keys walk the
 * **title page behind the picture**, because the flow rule can only keep focus
 * in an overlay focus is already in (#40).
 *
 * It is unsayable in happy-dom, where every box is zero-sized and the arrow
 * keys move nothing at all. Asserted as the rule rather than the geometry: the
 * focused element after Done is inside the player, wherever the player is.
 */
test('closing the Play On panel leaves focus inside the player', async ({ page }) => {
  await seedTheLivingRoom(page);
  await signIn(page);
  await playAndPauseArrival(page);
  await openPlayOn(page);

  await pressInDialog(page, 'Play on another app', 'Done');
  await expect(page.getByRole('dialog', { name: 'Play on another app' })).toBeHidden();

  const where = await page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return 'the document';
    return active.closest('.player') === null ? 'outside the player' : 'inside the player';
  });
  expect(where).toBe('inside the player');
});

/**
 * Driving the other app, in a browser, and then **leaving the room**: the
 * commands land, and closing this player does not switch the other one off.
 *
 * That last clause is where Play On and Cast part company on purpose — #33
 * ends a Cast session when the player closes, because a Chromecast left with
 * nothing driving it has no controls of its own. The app in the next room has
 * its own screen and quite possibly somebody in front of it.
 */
test('pauses the other app, and leaves it playing when this player closes', async ({
  page,
  request,
}) => {
  await seedTheLivingRoom(page);
  await signIn(page);
  await playAndPauseArrival(page);
  await openPlayOn(page);
  await pressInDialog(page, 'Play on another app', /Living Room TV/);
  await expect(page.getByText('Playing on Living Room TV.')).toBeVisible();

  // The panel is now the remote, and says what the other app is playing —
  // read back off the Server rather than assumed from what was sent.
  const panel = page.getByRole('dialog', { name: 'Play on another app' });
  await expect(panel).toContainText('Playing Arrival');

  await pressInDialog(page, 'Play on another app', 'Pause');
  await expect
    .poll(
      async () =>
        (await writesUnder(request, '/Sessions/session-living-room/Playing/Pause')).length,
      { timeout: 20_000 },
    )
    .toBe(1);
  // The one button now offers the opposite, because the Server says so.
  await expect(panel.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();

  await pressInDialog(page, 'Play on another app', 'Done');
  await page.getByRole('button', { name: 'Close', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeHidden();

  // Nothing stopped the other room, then or since.
  await page.waitForTimeout(250);
  expect(await writesUnder(request, '/Sessions/session-living-room/Playing/Stop')).toEqual([]);
});

/**
 * **Coming back, and being reported again** (#59): the whole round trip in a
 * browser — hand the Title to the next room, stop it there, press Play here,
 * and watch the Server hear about this device a second time.
 *
 * It earns a browser for the reason the hand-over test above does, and more so:
 * what was broken is a *spent reporter*, so what proves it fixed is a real
 * `<video>` really decoding again while a real Server records a **new** play
 * session for it. The position it resumes from, and the one it then reports, are
 * facts about an element that has really moved.
 *
 * The first assertion of the pair is #33's own invariant, and it is the reason
 * this is a new session rather than a repeatable `stopped`: **one**
 * `/Sessions/Playing/Stopped` for the playback that was given away, however
 * much happens here afterwards.
 */
test('playing here again after the hand-over is a new session the Server hears', async ({
  page,
  request,
}) => {
  await seedTheLivingRoom(page);
  await signIn(page);
  await playAndPauseArrival(page);

  await openPlayOn(page);
  await pressInDialog(page, 'Play on another app', /Living Room TV/);
  await expect(page.getByText('Playing on Living Room TV.')).toBeVisible();
  await expect.poll(() => pausedIn(page), { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => (await reportsAt(request, '/Sessions/Playing/Stopped')).length, {
    timeout: 20_000,
  }).toBe(1);
  const handedOverAt =
    Number((await reportsAt(request, '/Sessions/Playing/Stopped'))[0]?.body.PositionTicks ?? 0) /
    10_000_000;
  expect(handedOverAt).toBeGreaterThan(0.5);

  // Stop the other app, which brings the panel back to the list and leaves the
  // Title here, paused where the User left it — #34's deliberate behaviour.
  await pressInDialog(page, 'Play on another app', 'Stop');
  await expect(page.getByText('Playing on Living Room TV.')).toBeHidden();
  await pressInDialog(page, 'Play on another app', 'Done');
  await expect(page.getByRole('dialog', { name: 'Play on another app' })).toBeHidden();

  // One playback so far, and one stop for it.
  expect((await reportsAt(request, '/Sessions/Playing')).length).toBe(1);

  const play = page.getByRole('button', { name: 'Play Arrival' });
  await reachByArrowKeys(page, play);
  await play.press('Enter');

  // A second play session: before #59 this was nothing at all, for ever.
  await expect
    .poll(async () => (await reportsAt(request, '/Sessions/Playing')).length, { timeout: 30_000 })
    .toBe(2);
  // And still one stop for the session that was handed away.
  expect((await reportsAt(request, '/Sessions/Playing/Stopped')).length).toBe(1);

  // Really decoding again, and from where the hand-over left it rather than
  // from the beginning: this is the User's place being owed back to them.
  await expect.poll(() => pausedIn(page), { timeout: 20_000 }).toBe(false);
  await expect
    .poll(() => positionIn(page), { timeout: 20_000 })
    .toBeGreaterThan(handedOverAt + 0.2);

  /*
   * The consequence a User pays for, which is the resume point: a progress
   * report past the position the hand-over left behind. Pausing is what sends
   * one at once — the player reports a change of play state immediately, where
   * the position creeping along is throttled to ten seconds and this file is
   * six seconds long.
   */
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect
    .poll(
      async () =>
        (await reportsAt(request, '/Sessions/Playing/Progress')).some(
          (write) => Number(write.body.PositionTicks ?? 0) / 10_000_000 > handedOverAt + 0.2,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
});
