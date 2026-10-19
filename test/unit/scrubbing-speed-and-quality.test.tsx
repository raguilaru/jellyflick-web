import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { MAX_QUALITY_STORAGE_KEY } from '../../src/playback/max-quality';
import type { DeviceStorage } from '../../src/device/types';
import type { CapabilityProfileName } from '../device/profiles';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeWrites,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
  savesHaveSettled,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The four things #32 adds to a playing Title: a thumbnail while scrubbing, a
 * speed, picture-in-picture where the device has it, and a maximum quality
 * this device remembers.
 *
 * The journey is the seam for all four, because each one's promise is about
 * what a User ends up with rather than about a number: the thumbnail is
 * **the right thumbnail for the moment under the pointer**, the speed is the
 * element really playing faster, the ceiling is the **Server** being told a
 * smaller number, and picture-in-picture is a control that is simply not
 * there on a device that has none. The arithmetic underneath is pinned
 * separately in `trickplay-thumbnails.test.ts`, the ceiling's effect on the
 * profile in `the-device-profile.test.ts`, and the endpoints in
 * `gateway.test.ts`.
 *
 * **What no test here can say** is whether the thumbnail is in the right place
 * on the screen: happy-dom gives every box a zero size, so a preview centred
 * on a bar of no width is at zero and so is one that is broken. That is
 * `test/e2e/trickplay-speed-and-quality.spec.ts`, which measures it against
 * the bar in a browser that has layout.
 */

afterEach(resetFakeState);

/*
 * **The settle goes here, in `beforeEach`, and not in `afterEach`** (#46,
 * #52). A playback stop report is sent behind the User from an effect cleanup
 * that nothing awaits, and the unmount that fires it is Testing Library's
 * `cleanup` — registered in `test/setup.ts`, so Vitest runs it *after* this
 * file's own `afterEach`. By then the write has not been made yet. Settling
 * here, before the log is forgotten, is the only place that catches it.
 */
beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await savesHaveSettled();
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

async function signIn(profile: CapabilityProfileName, storage: DeviceStorage): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ profile, storage })}
      messages={en}
    />,
  );
  // A TV offers Quick Connect before a password (#9).
  if (profile === 'webos-5-like') {
    fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
  }
  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in as Rafael.');
}

function pressCard(rowName: string, name: string): void {
  const row = screen.getByRole('list', { name: rowName });
  const card = Array.from(row.querySelectorAll('.card')).find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  );
  if (card === undefined) throw new Error(`No card for ${name}.`);
  fireEvent.click(card);
}

/**
 * Plays one Title and waits for it to be going.
 *
 * Arrival is the Title with trickplay data on this Server; The Unfinished has
 * none at all — but it also has no file, so "a Title the Server generated no
 * thumbnails for" is **Paddington**, which plays and has none.
 */
async function play(
  name = 'Arrival',
  options: { profile?: CapabilityProfileName; storage?: DeviceStorage } = {},
): Promise<void> {
  await signIn(options.profile ?? 'modern-desktop-browser', options.storage ?? inMemoryDeviceStorage());
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', name);
  await screen.findByRole('heading', { name, level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: `Playing ${name}` });
  /*
   * **Drawn is not ready.** The controls appear while the negotiation is
   * still in flight, and until the Server has answered there is nothing to
   * pause, nothing to seek and nothing to set a quality on — so every control
   * here is `disabled`, and a press on a disabled button does nothing at all
   * and says nothing about it. Waiting for the button to be *enabled* is what
   * makes this helper mean "it is playing", and it is the same trap #30's
   * burned-in test met from the other end.
   */
  await waitFor(() => {
    const options = screen.getByRole('button', { name: `Playback options for ${name}` });
    expect((options as HTMLButtonElement).disabled).toBe(false);
  });
}

function video(): HTMLVideoElement {
  const found = document.querySelector('video');
  if (found === null) throw new Error('The player has no video element.');
  return found as HTMLVideoElement;
}

function seekBar(): HTMLElement {
  return screen.getByRole('slider');
}

/** The thumbnail over the bar, if the player drew one. */
function preview(): HTMLElement | null {
  return document.querySelector('.player__preview');
}

async function openOptions(name = 'Arrival'): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: `Playback options for ${name}` }));
  return await screen.findByRole('dialog', { name: en['player.optionsLabel'] });
}

function groupNamed(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

/** Every `PlaybackInfo` the Server has been asked, newest last. */
async function negotiations(): Promise<Record<string, unknown>[]> {
  const requests = await fakeRequests();
  return requests
    .filter((request) => request.method === 'POST' && request.path.includes('/PlaybackInfo'))
    .map((request) => (request.body ?? {}) as Record<string, unknown>);
}

function last<T>(items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[items.length - 1];
}

describe('thumbnails while scrubbing', () => {
  it('asks the Server for the trickplay field, which it does not send unasked', async () => {
    await play();

    await waitFor(async () => {
      const asked = (await fakeRequests()).find((request) =>
        request.path.includes('fields=Trickplay'),
      );
      expect(asked?.path).toContain('ids=movie-arrival');
    });
  });

  it('draws the thumbnail for the moment a pointer is over, not for the playhead', async () => {
    await play();
    await waitFor(() => seekBar());

    // happy-dom gives every box a zero size, so the fraction a press lands on
    // cannot come from geometry. The bar is told how wide it is instead, which
    // is the one thing a browser would have supplied.
    seekBar().getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 0, height: 10, right: 1000, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    /*
     * A fifth of the way along a 116-minute Title is about 1392 seconds, which
     * is far past the sixth and last thumbnail the fake holds — so it clamps
     * to that one: tile image 0, column 2 of row 1 in a 3 x 2 sheet. The
     * 320-wide set is chosen and drawn at 240, which is three quarters, so
     * every number below is §13's offset times 0.75.
     */
    fireEvent.mouseMove(seekBar(), { clientX: 200 });

    await waitFor(() => {
      expect(preview()).not.toBeNull();
    });
    const style = preview()?.getAttribute('style') ?? '';
    expect(style).toContain('/Videos/movie-arrival/Trickplay/320/0.jpg');
    expect(style).toContain('background-size: 720px 270px');
    expect(style).toContain('background-position: -480px -135px');
    expect(style).toContain('width: 240px; height: 135px');
  });

  it('takes the thumbnail away when the pointer leaves the bar', async () => {
    await play();
    await waitFor(() => seekBar());
    fireEvent.mouseMove(seekBar(), { clientX: 10 });
    fireEvent.mouseLeave(seekBar());

    await waitFor(() => {
      expect(preview()).toBeNull();
    });
  });

  it('shows a remote the thumbnail for where it is, because a remote cannot hover', async () => {
    await play();
    await waitFor(() => seekBar());

    fireEvent.focus(seekBar());

    await waitFor(() => {
      expect(preview()).not.toBeNull();
    });
    // The playhead is at the start, so it is the first thumbnail of the first
    // tile image — the one a Title opens on.
    expect(preview()?.getAttribute('style')).toContain('background-position: 0px 0px');
  });

  it('draws nothing at all for a Title the Server generated no thumbnails for', async () => {
    await play('Paddington');
    await waitFor(() => seekBar());

    fireEvent.focus(seekBar());
    fireEvent.mouseMove(seekBar(), { clientX: 100 });

    // Not "waits and hopes": the request that would have found them has been
    // made and answered by the time the controls are up.
    await waitFor(async () => {
      expect(
        (await fakeRequests()).some((request) => request.path.includes('fields=Trickplay')),
      ).toBe(true);
    });
    expect(preview()).toBeNull();
  });
});

describe('the playback speed', () => {
  it('plays the element faster, and says which rate is chosen', async () => {
    await play();
    await openOptions();

    fireEvent.click(within(groupNamed(en['player.speedHeading'])).getByRole('button', { name: '1.5×' }));

    await waitFor(() => {
      expect(video().playbackRate).toBe(1.5);
    });
    // `defaultPlaybackRate` as well, so a source attached later opens at the
    // speed the User chose rather than snapping back to one.
    expect(video().defaultPlaybackRate).toBe(1.5);

    await openOptions();
    expect(
      within(groupNamed(en['player.speedHeading'])).getByRole('button', {
        name: '1.5×',
        pressed: true,
      }),
    ).toBeTruthy();
  });

  it('stays in effect across a re-negotiation, which a change of sound track is', async () => {
    await play();
    await openOptions();
    fireEvent.click(within(groupNamed(en['player.speedHeading'])).getByRole('button', { name: '0.5×' }));
    await waitFor(() => {
      expect(video().playbackRate).toBe(0.5);
    });

    // Choosing French asks the Server again and attaches a new source, which
    // is where a rate held only on the element would be lost.
    fireEvent.click(await screen.findByRole('button', { name: 'Audio and subtitles for Arrival' }));
    fireEvent.click(
      within(await screen.findByRole('group', { name: en['player.audioTracks'] })).getByRole(
        'button',
        { name: 'French' },
      ),
    );

    await waitFor(async () => {
      expect(await negotiations()).toHaveLength(2);
    });
    await waitFor(() => {
      expect(video().playbackRate).toBe(0.5);
    });
  });
});

describe('the playback options menu', () => {
  /**
   * Found in a browser, by #32's own e2e, and invisible to every assertion
   * that was green before it.
   *
   * Every choice in this menu closes it, which takes the focused button away
   * with it — and a browser then hands focus to the **document**. From there
   * the arrow keys are not inside the player at all, so the next press walks
   * the title page behind the picture: on a 390px screen the e2e watched a
   * remote land on My List, Mark as watched and then the suggestion Row,
   * while the player sat open in front of it. That is #40's defect arriving by
   * a different road, and the rule it breaks is #26's — a control a User
   * cannot see must not be where the arrow keys are.
   */
  it('hands focus back to the control it was opened from', async () => {
    await play();
    const opener = await screen.findByRole('button', { name: 'Playback options for Arrival' });
    /*
     * Focused first, which a browser does for itself and `fireEvent` does
     * not: a press — by pointer or by Enter on a remote — leaves focus on the
     * button pressed, and "what had focus when the menu opened" is the whole
     * of what the menu gives back.
     */
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: en['player.optionsLabel'] });

    fireEvent.click(
      within(groupNamed(en['player.speedHeading'])).getByRole('button', { name: '1.5×' }),
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it('leaves focus to the controls when the press rebuilt them', async () => {
    await play();
    await openOptions();

    /*
     * A quality choice re-negotiates, so the whole control row goes and comes
     * back — the button this was opened from is not in the document any more
     * by the time the menu unmounts. Focusing a detached node would take focus
     * to the document, which is the very thing being avoided, so the menu
     * leaves it to the controls' own effect.
     */
    fireEvent.click(
      within(groupNamed(en['player.qualityHeading'])).getByRole('button', {
        name: en['player.qualityChoice']({ bitrate: 2_000_000 }),
      }),
    );

    await waitFor(async () => {
      expect(await negotiations()).toHaveLength(2);
    });
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.closest('.player')).toBeTruthy();
    });
  });
});

describe('picture-in-picture', () => {
  it('is offered where the device layer says the device has it', async () => {
    await play();
    const panel = await openOptions();

    expect(within(panel).getByRole('button', { name: en['player.enterPip'] })).toBeTruthy();
  });

  it('is not offered at all where the device has none, which is the Chromium 68 floor', async () => {
    await play('Arrival', { profile: 'webos-5-like' });
    const panel = await openOptions();

    expect(within(panel).queryByRole('button', { name: en['player.enterPip'] })).toBeNull();
  });

  it('says so beside the picture when the browser will not open the window', async () => {
    await play();
    const panel = await openOptions();

    // happy-dom has no picture-in-picture, so the element is given the method
    // a Chrome 69 would have — refusing, which is what a browser does without
    // a gesture it believes in, or with the feature switched off by policy.
    (video() as HTMLVideoElement).requestPictureInPicture = () =>
      Promise.reject(new Error('refused'));

    fireEvent.click(within(panel).getByRole('button', { name: en['player.enterPip'] }));

    expect(await screen.findByText(en['player.pictureInPictureRefused'])).toBeTruthy();
    // The Title is still playing: the failure is said beside the picture.
    expect(screen.getByRole('region', { name: 'Playing Arrival' })).toBeTruthy();
  });
});

describe('the maximum quality', () => {
  it('tells the Server a smaller ceiling, and keeps the User’s place', async () => {
    await play();
    await waitFor(() => seekBar());

    video().currentTime = 120;
    fireEvent(video(), new Event('timeupdate'));

    const panel = await openOptions();
    fireEvent.click(within(panel).getByRole('button', { name: '2 Mbps' }));

    await waitFor(async () => {
      expect(await negotiations()).toHaveLength(2);
    });
    const asked = last(await negotiations()) as Record<string, unknown>;
    const profile = asked.DeviceProfile as Record<string, unknown>;
    expect(asked.MaxStreamingBitrate).toBe(2_000_000);
    expect(profile.MaxStreamingBitrate).toBe(2_000_000);
    // The file as well as the transcode: a direct play is data too.
    expect(profile.MaxStaticBitrate).toBe(2_000_000);
    // Where they were, not the beginning: the same debt a change of sound owes.
    expect(asked.StartTimeTicks).toBe(120 * 10_000_000);
  });

  it('asks for no ceiling at all on Auto, which is the absence of one', async () => {
    await play();
    const asked = last(await negotiations()) as Record<string, unknown>;
    const profile = asked.DeviceProfile as Record<string, unknown>;

    // The device's own ceiling, untouched — which is what it was before #32.
    expect(profile.MaxStreamingBitrate).toBe(60_000_000);
  });

  it('remembers the ceiling on the device, not against the User', async () => {
    const storage = inMemoryDeviceStorage();
    await play('Arrival', { storage });
    const panel = await openOptions();

    fireEvent.click(within(panel).getByRole('button', { name: '4 Mbps' }));

    await waitFor(() => {
      expect(storage.read(MAX_QUALITY_STORAGE_KEY)).toBe('4000000');
    });
    // And nowhere on the Server: a Client Settings write would follow this
    // User to every device they sign in on, which is the opposite of the point.
    const settingsWrites = (await fakeWrites()).filter((write) =>
      write.path.includes('/DisplayPreferences'),
    );
    expect(settingsWrites).toHaveLength(0);
  });

  it('starts the next playback at the ceiling the device already had', async () => {
    const storage = inMemoryDeviceStorage({ [MAX_QUALITY_STORAGE_KEY]: '720000' });
    await play('Arrival', { storage });

    const asked = last(await negotiations()) as Record<string, unknown>;
    const profile = asked.DeviceProfile as Record<string, unknown>;
    expect(profile.MaxStreamingBitrate).toBe(720_000);
    expect(asked.MaxStreamingBitrate).toBe(720_000);

    // And the menu opens showing it, rather than Auto.
    const panel = await openOptions();
    expect(
      within(panel).getByRole('button', { name: '720 kbps', pressed: true }),
    ).toBeTruthy();
  });

  it('goes back to Auto, which asks the Server again like any other change', async () => {
    const storage = inMemoryDeviceStorage({ [MAX_QUALITY_STORAGE_KEY]: '2000000' });
    await play('Arrival', { storage });

    const panel = await openOptions();
    fireEvent.click(within(panel).getByRole('button', { name: en['player.qualityAuto'] }));

    await waitFor(async () => {
      expect(await negotiations()).toHaveLength(2);
    });
    const asked = last(await negotiations()) as Record<string, unknown>;
    expect((asked.DeviceProfile as Record<string, unknown>).MaxStreamingBitrate).toBe(60_000_000);
    expect(storage.read(MAX_QUALITY_STORAGE_KEY)).toBeUndefined();
  });
});
