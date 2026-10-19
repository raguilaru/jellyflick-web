import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import type { CapabilityProfileName, FakeImageRenderer } from '../device/profiles';
import { fakeImageRenderer, inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeWrites,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Image subtitles, as a User meets them (#30, story 105).
 *
 * The journey is the seam, as it was for #29, because the ticket's promise is
 * about what a User ends up looking at: a PGS track is **drawn here where the
 * device can manage it**, so it can be turned off and shifted; everything else
 * graphical is **burned into the picture by the Server**, and then the
 * Subtitle timing panel says so instead of lying. The decision itself is
 * pinned down per capability profile in
 * `choosing-how-to-draw-subtitles.test.ts` and the DeviceProfile's half in
 * `the-device-profile.test.ts`; this file is about the press and its result.
 *
 * **The capability profile is what the tests vary**, exactly as #29's do:
 * `modern-desktop-browser` can decode a bitmap, `webos-5-like` stands for a
 * device that cannot. The same track and the same Server then give two
 * different answers, which is the whole ticket.
 *
 * Heat is the Title throughout: English audio at stream 1, a **PGS** track at
 * stream 2 and a **VobSub** one at stream 3. The pair is deliberate — PGS
 * takes whichever path the device allows, and VobSub takes the Server's on
 * every device there is.
 *
 * **What no test here can say** is whether libpgs decodes anything, which is
 * the lesson #29 paid for: the device layer is faked, and nothing in happy-dom
 * starts a worker or decodes a run-length-encoded bitmap. That is
 * `test/e2e/image-subtitles.spec.ts`, which runs the real decoder against the
 * real `.sup` the fake now serves.
 */

/**
 * A Client Settings save is written **behind** the User and can outlive the
 * test that started it (#46), landing after the next test has reseeded the
 * Server. This file moves the Subtitle Offset, so it carries the same guard
 * `styled-subtitles.test.tsx` and `shifting-the-subtitles.test.tsx` do: two
 * equal counts in a row means the writes have stopped.
 *
 * It is worth repeating here because of how it would fail. #28 met this as a
 * subtitle that **silently refused to draw**, which is also this file's most
 * ordinary failure, and a victim fails only in sequence and never alone.
 */
async function savesHaveSettled(): Promise<void> {
  let seen = -1;
  await waitFor(async () => {
    const now = (await fakeWrites()).length;
    const quiet = now === seen;
    seen = now;
    expect(quiet).toBe(true);
  });
}

afterEach(async () => {
  await savesHaveSettled();
  await resetFakeState();
});

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

async function signIn(
  profile: CapabilityProfileName,
  imageRenderer?: FakeImageRenderer,
): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({
        profile,
        storage: inMemoryDeviceStorage(),
        ...(imageRenderer === undefined ? {} : { imageRenderer }),
      })}
      messages={en}
    />,
  );
  // A TV offers Quick Connect before a password (#9), so reaching the Users
  // there takes the one press a household member would make.
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

/** Plays Heat on a device of the given class, and waits for it to be going. */
async function play(
  profile: CapabilityProfileName,
  imageRenderer?: FakeImageRenderer,
): Promise<void> {
  await signIn(profile, imageRenderer);
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', 'Heat');
  await screen.findByRole('heading', { name: 'Heat', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: 'Playing Heat' });
  await screen.findByRole('button', { name: 'Audio and subtitles for Heat' });
}

/**
 * Opens the track picker, as a User does.
 *
 * The control is **awaited** rather than queried, which matters only for the
 * burn-in tests and is the honest shape for all of them: choosing a burned-in
 * track asks the Server again, and while that negotiation is in flight there
 * is no plan, so the player draws no controls at all. A User sees the picture
 * stay and the buttons come back; a test that reached for the button in that
 * gap would be asserting the gap does not exist.
 */
async function openPicker(): Promise<HTMLElement> {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Audio and subtitles for Heat' }),
  );
  return await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
}

function groupNamed(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

/** Chooses one subtitle track by its label, the way a User does. */
async function chooseSubtitle(label: string | RegExp): Promise<void> {
  await openPicker();
  fireEvent.click(
    within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: label }),
  );
}

/** The canvas libpgs would draw on, if the player put one in the tree. */
function imageCanvas(): Element | null {
  return document.querySelector('.player__image-subtitles');
}

/**
 * The last of a list, or `undefined`. `Array.prototype.at` is ES2022 and this
 * project targets ES2020 for the Chromium 68 floor (ADR 0002), so it is not
 * available even in a test.
 */
function last<T>(items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[items.length - 1];
}

/** Every `PlaybackInfo` the Server has been asked, newest last. */
async function negotiations(): Promise<Record<string, unknown>[]> {
  const requests = await fakeRequests();
  return requests
    .filter((request) => request.method === 'POST' && request.path.includes('/PlaybackInfo'))
    .map((request) => (request.body ?? {}) as Record<string, unknown>);
}

describe('a PGS track on a device that can draw it', () => {
  it('starts the decoder on the raw stream, and draws on a canvas of its own', async () => {
    const renderer = fakeImageRenderer();
    await play('modern-desktop-browser', renderer);

    await chooseSubtitle(/English \(PGS\)/);

    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });
    const started = renderer.started[0];
    if (started === undefined) throw new Error('No renderer was started.');
    /*
     * `Stream.sup`, which is the honest extension and not a conversion at all:
     * §14's graphical passthrough refuses to parse or rewrite a bitmap and
     * hands the raw file over whatever was asked for, so `sup` is the only
     * spelling whose content type matches what really arrives.
     */
    expect(started.subtitleUrl).toContain('/Subtitles/2/');
    expect(started.subtitleUrl).toContain('Stream.sup');
    // The canvas is the renderer's to draw on and the player's to place.
    expect(imageCanvas()).not.toBeNull();
    expect(started.canvas).toBe(imageCanvas());
  });

  it('never asks the Server to burn it in, so the picture is not re-negotiated', async () => {
    await play('modern-desktop-browser');
    const before = (await negotiations()).length;

    await chooseSubtitle(/English \(PGS\)/);
    await waitFor(() => {
      expect(imageCanvas()).not.toBeNull();
    });

    /*
     * The whole reason for decoding here rather than letting the Server do it:
     * a burned-in track costs a transcode and a re-negotiation, and this one
     * costs neither. It is the same promise #27 made for a text track.
     */
    expect((await negotiations()).length).toBe(before);
  });

  it('offers the Subtitle timing panel, because a track drawn here can be shifted', async () => {
    await play('modern-desktop-browser');
    await chooseSubtitle(/English \(PGS\)/);
    await openPicker();

    const timing = screen.getByRole('button', { name: en['player.subtitleTiming'] });
    expect(timing.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText(en['player.subtitlesBurnedIn'])).toBeNull();
  });

  it('hands the Subtitle Offset down to the decoder as the User moves it', async () => {
    const renderer = fakeImageRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseSubtitle(/English \(PGS\)/);
    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });

    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleTiming'] }));
    await screen.findByRole('dialog', { name: en['player.subtitleTiming'] });
    fireEvent.click(screen.getByRole('button', { name: en['player.subtitlesStepLater'] }));

    // The offset crosses the seam as a number, exactly as it does for libass:
    // the renderer keeps its own time against the video element, so there is
    // no frame loop here and nothing is torn down to deliver it.
    await waitFor(() => {
      expect(last(renderer.offsets)).toBeCloseTo(0.1);
    });
  });

  it('destroys the decoder when the User turns the subtitles off', async () => {
    const renderer = fakeImageRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseSubtitle(/English \(PGS\)/);
    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });

    await chooseSubtitle(en['player.subtitlesOff']);

    await waitFor(() => {
      expect(renderer.destroyed).toBe(1);
    });
    expect(imageCanvas()).toBeNull();
  });

  it('says so beside the picture when the decoder will not load', async () => {
    // A device that claimed it could draw a bitmap and then could not. Unlike
    // the styled renderer there is nothing to fall back to — the bitmap *is*
    // the subtitle — so what is owed the User is being told.
    const renderer = fakeImageRenderer({ failing: true });
    await play('modern-desktop-browser', renderer);

    await chooseSubtitle(/English \(PGS\)/);

    expect(await screen.findByText(en['player.subtitlesUnavailable'])).toBeTruthy();
  });
});

describe('a track the Server has to burn into the picture', () => {
  it('asks the Server again, naming the track, when a VobSub one is chosen', async () => {
    await play('modern-desktop-browser');
    const before = (await negotiations()).length;

    await chooseSubtitle(/Spanish \(VobSub\)/);

    /*
     * There is no flag that asks for burn-in: the DeviceProfile never claims
     * `dvdsub`, so naming the track on `PlaybackInfo` is what makes the Server
     * fall back to `SubtitleDeliveryMethod.Encode`. The negotiation is the
     * observable half of that, and it is the thing a drawable track must not
     * do.
     */
    await waitFor(async () => {
      expect((await negotiations()).length).toBe(before + 1);
    });
    expect(last(await negotiations())?.SubtitleStreamIndex).toBe(3);
  });

  it('never loads the decoder for it, on a device that could have drawn PGS', async () => {
    const renderer = fakeImageRenderer();
    await play('modern-desktop-browser', renderer);

    await chooseSubtitle(/Spanish \(VobSub\)/);
    await waitFor(async () => {
      expect(last(await negotiations())?.SubtitleStreamIndex).toBe(3);
    });

    // VobSub has no client-side renderer on any device (#30's first finding),
    // so a device that can decode PGS must still not be asked to try.
    expect(renderer.started).toHaveLength(0);
    expect(imageCanvas()).toBeNull();
  });

  it('disables the Subtitle timing panel and says why', async () => {
    await play('modern-desktop-browser');
    await chooseSubtitle(/Spanish \(VobSub\)/);
    await openPicker();

    /*
     * The ticket's fourth box. Disabled rather than absent, and `aria-disabled`
     * rather than `disabled`, so a remote can reach the control and read the
     * reason instead of skipping silently past something never explained.
     */
    const timing = screen.getByRole('button', { name: en['player.subtitleTiming'] });
    expect(timing.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(en['player.subtitlesBurnedIn'])).toBeTruthy();

    fireEvent.click(timing);
    expect(screen.queryByRole('dialog', { name: en['player.subtitleTiming'] })).toBeNull();
  });

  it('asks the Server again when the User leaves a burned-in track', async () => {
    await play('modern-desktop-browser');
    await chooseSubtitle(/Spanish \(VobSub\)/);
    await waitFor(async () => {
      expect(last(await negotiations())?.SubtitleStreamIndex).toBe(3);
    });
    const burnedIn = (await negotiations()).length;

    await chooseSubtitle(en['player.subtitlesOff']);

    /*
     * The half that is easy to forget: the words are *in the picture* until a
     * new stream replaces it, so turning subtitles off has to ask the Server
     * again just as much as turning them on did. A client that only
     * re-negotiated on the way in would leave a User with subtitles they had
     * just switched off, and no way at all to remove them.
     */
    await waitFor(async () => {
      expect((await negotiations()).length).toBe(burnedIn + 1);
    });
    expect(last(await negotiations())?.SubtitleStreamIndex).toBeUndefined();
  });
});

describe('a PGS track on a device that cannot draw one', () => {
  it('is burned in rather than decoded, which is the same track taking the other path', async () => {
    const renderer = fakeImageRenderer();
    await play('webos-5-like', renderer);
    const before = (await negotiations()).length;

    await chooseSubtitle(/English \(PGS\)/);

    // The same press, the same Server and the same track as the first test in
    // this file, and the opposite answer — which is the whole of #30.
    await waitFor(async () => {
      expect((await negotiations()).length).toBe(before + 1);
    });
    expect(last(await negotiations())?.SubtitleStreamIndex).toBe(2);
    expect(renderer.started).toHaveLength(0);
    expect(imageCanvas()).toBeNull();
  });

  it('disables the Subtitle timing panel there too', async () => {
    await play('webos-5-like');
    await chooseSubtitle(/English \(PGS\)/);
    await openPicker();

    expect(
      screen.getByRole('button', { name: en['player.subtitleTiming'] }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(screen.getByText(en['player.subtitlesBurnedIn'])).toBeTruthy();
  });
});

describe('what a plain track still costs', () => {
  it('never loads the image decoder for a text track', async () => {
    const renderer = fakeImageRenderer();
    await play('modern-desktop-browser', renderer);
    await openPicker();

    /*
     * The ticket's second acceptance criterion, as far as a unit test can see
     * it: the decoder is loaded only when a User chooses a bitmap. That it is
     * also a *separate chunk* is a build fact, measured in the report rather
     * than asserted here.
     */
    expect(renderer.started).toHaveLength(0);
    expect(imageCanvas()).toBeNull();
  });
});
