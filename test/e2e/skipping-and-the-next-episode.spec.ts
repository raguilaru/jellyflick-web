import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Skipping an intro or the credits, and the next Episode (#31), in a real
 * browser decoding real bytes.
 *
 * What only this suite can say is the part the ticket's last box asks for: the
 * picture **really moved** when Skip Intro was pressed, the offer appeared and
 * went away against a clock nobody set by hand, an Episode **really ran out**,
 * and a remote can reach every new button by direction alone. happy-dom gives
 * every element a zero-sized box, so none of that is observable in
 * `test/unit/skipping-and-the-next-episode.test.tsx`, which covers what a User
 * sees and what the Server is asked.
 *
 * The markers are seeded **inside the six seconds the fake really serves**
 * (`test/fake-jellyfin/media/test-video.webm`), because the Server's claim
 * about how long an Episode is and the file it hands over are two different
 * things here on purpose: the library says Bluey's Episodes are seven minutes
 * and the bytes are six seconds of VP9. A marker at five minutes would be a
 * marker no browser ever reaches.
 */

const PASSWORD = 'correct horse';

/**
 * Intro from half a second to two seconds, credits from three and a half to
 * five — both inside the real file, and the credits short of its end so the
 * Episode still runs out by itself afterwards.
 */
const MARKERS = {
  'episode-bluey-s1e1': [
    { Type: 'Intro', StartTicks: 5_000_000, EndTicks: 20_000_000 },
    { Type: 'Outro', StartTicks: 35_000_000, EndTicks: 50_000_000 },
  ],
};

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
});

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/**
 * Plays Bluey from its own page, which by #18's rule is `s1e1` — the first
 * unwatched Episode of a Series nobody has started. Enter throughout, so a
 * remote could have done all of it.
 */
async function playBluey(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Bluey' })
    .press('Enter');
  await expect(page.getByRole('heading', { name: 'Bluey', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(
    page.getByRole('region', { name: 'Playing Bluey: The Magic Xylophone' }),
  ).toBeVisible();
}

/** Where the `<video>` has got to, which is the proof it really decoded. */
function positionIn(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? -1 : video.currentTime;
  });
}

/** Holds the picture still, so two readings that have to agree can be taken. */
async function pause(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Pause Bluey: The Magic Xylophone' }).press('Enter');
  await expect(
    page.getByRole('button', { name: 'Play Bluey: The Magic Xylophone' }),
  ).toBeVisible();
}

const skipIntro = (page: Page) =>
  page.getByRole('button', { name: 'Skip the intro of Bluey: The Magic Xylophone' });
const skipCredits = (page: Page) =>
  page.getByRole('button', { name: 'Skip the credits of Bluey: The Magic Xylophone' });

async function seedMarkers(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, { data: { mediaSegments: MARKERS } });
}

test('skips an intro, and the picture really moves', async ({ page, request }) => {
  await seedMarkers(request);
  await signIn(page);
  await playBluey(page);

  // The offer arrives on its own, from the position the element reports.
  await expect(skipIntro(page)).toBeVisible();

  /*
   * **Paused before the arrow keys are walked**, which is the suite's standing
   * rule about reading a moving number (`architecture.md`): the intro marker is
   * a second and a half of real playback, and a search for a button by
   * direction takes longer than that on throttled hardware. An earlier version
   * of this test walked the keys while the file played and failed because the
   * offer it was walking towards had expired — which is a fact about the
   * marker, not about whether a remote can reach the button.
   */
  await pause(page);

  /*
   * Reached by direction alone, from wherever the player put focus — which is
   * the ticket's second box, and the half of it no unit test can see. The
   * button sits outside the controls on purpose, so this is also the check
   * that putting it there did not take it off the arrow keys' map.
   */
  await reachByArrowKeys(page, skipIntro(page));
  await skipIntro(page).press('Enter');

  // Two seconds is where the Server said the intro ends, and the element is
  // the only thing that can say the picture went there.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  // And the offer is gone, because the marker it belonged to is behind them.
  await expect(skipIntro(page)).toBeHidden();
});

test('offers Skip Credits in the credits and nowhere else', async ({ page, request }) => {
  await seedMarkers(request);
  await signIn(page);
  await playBluey(page);

  // Not while the intro is the marker being played: one offer at a time.
  await expect(skipIntro(page)).toBeVisible();
  await expect(skipCredits(page)).toBeHidden();

  // Left alone, the file plays on into the credits marker at three and a half
  // seconds, which is the clock doing the work rather than a test setting a
  // position by hand.
  await expect(skipCredits(page)).toBeVisible({ timeout: 15_000 });
  await expect(skipIntro(page)).toBeHidden();

  await skipCredits(page).press('Enter');
  // Five seconds is the end of the marker. The seek is clamped a second short
  // of the file's end like every other (`scrubbing.ts`), so this lands at the
  // end of the Episode rather than firing `ended` from under the press.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(4.5);
});

test('counts the next Episode in, and a remote can cancel it', async ({ page }) => {
  await signIn(page);
  await playBluey(page);

  /*
   * The six seconds run out by themselves: this is the one test in the suite
   * that watches a file to its end, and it is what makes "at the end of an
   * Episode" a real moment rather than a dispatched event.
   */
  const offer = page.getByRole('region', { name: 'The next Episode' });
  await expect(offer).toBeVisible({ timeout: 20_000 });
  await expect(offer).toContainText('Next: Bluey: Hotel');
  // Rafael's account says to start the next one, so there is a countdown.
  await expect(offer).toContainText('Starting in');

  // Focus came in with the offer, which is what gives a User holding a remote
  // ten seconds to reach it rather than ten seconds to find it.
  await expect(offer.locator(':focus')).toBeVisible();

  const cancel = page.getByRole('button', { name: 'Do not play Bluey: Hotel' });
  await reachByArrowKeys(page, cancel);
  await cancel.press('Enter');

  /*
   * Story 89: cancelling **stays at the end**. The Episode that finished is
   * still what the player is headed with, the controls are still up because
   * there is nothing playing behind them, and the title page is one press of
   * Close away.
   */
  await expect(offer).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Playing Bluey: The Magic Xylophone' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();

  // And it stays cancelled: the countdown that was running does not come back.
  await page.waitForTimeout(3_000);
  await expect(page.getByRole('region', { name: 'Playing Bluey: Hotel' })).toBeHidden();
});

test('starts the next Episode when the countdown runs out', async ({ page, request }) => {
  await signIn(page);
  await playBluey(page);

  await expect(page.getByRole('region', { name: 'The next Episode' })).toBeVisible({
    timeout: 20_000,
  });

  // Ten seconds of countdown, left to run. Nothing is pressed from here on,
  // which is the whole of story 88: a household bingeing touches nothing.
  await expect(page.getByRole('region', { name: 'Playing Bluey: Hotel' })).toBeVisible({
    timeout: 25_000,
  });

  // Each Episode is its own session on the Server: a resume point per Episode
  // rather than one for the Series.
  await expect
    .poll(
      async () => {
        const writes = (await (
          await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)
        ).json()) as { path: string; body: { ItemId?: string } }[];
        return writes
          .filter((write) => write.path === '/Sessions/Playing')
          .map((write) => write.body.ItemId);
      },
      { timeout: 15_000 },
    )
    .toEqual(['episode-bluey-s1e1', 'episode-bluey-s1e2']);
});

/**
 * The third acceptance box, read off the User's **Jellyfin account** rather
 * than off anything Jellyflick stores: `EnableNextEpisodeAutoPlay`, which the
 * settings screen draws as "Start the next one" against "Ask me each time".
 * This is the second of those two.
 */
test('asks instead of counting down when the account says to ask', async ({ page, request }) => {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { userConfiguration: { 'user-rafael': { EnableNextEpisodeAutoPlay: false } } },
  });
  await signIn(page);
  await playBluey(page);

  const offer = page.getByRole('region', { name: 'The next Episode' });
  await expect(offer).toBeVisible({ timeout: 20_000 });
  await expect(offer).toContainText('Next: Bluey: Hotel');
  await expect(offer).not.toContainText('Starting in');

  // Nothing starts on its own — well past the ten seconds a countdown runs.
  await page.waitForTimeout(13_000);
  await expect(page.getByRole('region', { name: 'Playing Bluey: Hotel' })).toBeHidden();

  // And pressing it is how the next Episode starts for this household.
  await page.getByRole('button', { name: 'Play Bluey: Hotel now' }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Bluey: Hotel' })).toBeVisible();
});

/**
 * The row of new buttons, measured rather than looked at: Playwright scrolls an
 * element into view before pressing it, so every other test here would pass
 * with the offer running off the side of the screen. #35 shipped exactly that
 * bug with a green suite, which is why this test exists at all.
 */
test('keeps the next-Episode offer inside the screen', async ({ page }) => {
  await signIn(page);
  await playBluey(page);

  const offer = page.getByRole('region', { name: 'The next Episode' });
  await expect(offer).toBeVisible({ timeout: 20_000 });

  const viewport = page.viewportSize();
  const box = await offer.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  // And inside the player's own picture area rather than over the controls.
  const controls = await page.locator('.player__controls').boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((controls?.y ?? 0) + 1);

  for (const name of ['Play Bluey: Hotel now', 'Do not play Bluey: Hotel']) {
    const button = await page.getByRole('button', { name }).boundingBox();
    expect(button, name).not.toBeNull();
    expect(button?.x ?? -1, name).toBeGreaterThanOrEqual(0);
    expect((button?.x ?? 0) + (button?.width ?? 0), name).toBeLessThanOrEqual(
      (viewport?.width ?? 0) + 1,
    );
  }
});

/** The same measurement for the Skip button, which sits in the other corner. */
test('keeps the Skip button inside the screen', async ({ page, request }) => {
  await seedMarkers(request);
  await signIn(page);
  await playBluey(page);

  await expect(skipIntro(page)).toBeVisible();
  await pause(page);

  const viewport = page.viewportSize();
  const box = await skipIntro(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  const controls = await page.locator('.player__controls').boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((controls?.y ?? 0) + 1);
});
