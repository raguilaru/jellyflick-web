import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { JELLYFIN_CAST_NAMESPACE, JELLYFIN_STABLE_RECEIVER_ID } from '../../src/playback/cast';
import type { CapabilityProfileName, FakeCastSender } from '../device/profiles';
import { fakeCastSender, inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeWrites,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
  savesHaveSettled,
  setFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Casting a Title to a Chromecast, and offering AirPlay where Safari has it
 * (#33) — the journey, which is the seam for every decision this ticket makes
 * **except whether the SDK really loads**.
 *
 * The journey is the right seam because each promise here is about what a User
 * ends up with: a control that is simply **not there** on a device with no
 * Cast, a receiver that is the one their **own Jellyfin account** names, and a
 * handover that leaves the Server with one session rather than two.
 *
 * **What no test in this file can say**, and the reason
 * `test/e2e/cast-and-airplay.spec.ts` exists:
 *
 * - The device layer is faked here, so `loadCastSender` resolves a recorder.
 *   Whether a `<script>` off gstatic ever loads, whether
 *   `window.__onGCastApiAvailable` is really called, and whether the main
 *   bundle quietly fetches it anyway are questions with no answer in
 *   happy-dom. That is #29's trap exactly — a renderer that had never started
 *   in a browser while every unit test passed — and this ticket's version of
 *   it is a Cast button that could never connect to anything.
 * - AirPlay is two APIs happy-dom has neither of. `air-play.ts` is pinned
 *   against hand-shaped elements in `airplay-on-the-element.test.ts`; what is
 *   left here is whether the **button** follows the watch, and the element it
 *   follows has to be stubbed to say anything at all.
 */

const RAFAEL = 'user-rafael';

afterEach(resetFakeState);

/*
 * The settle goes in `beforeEach`, not `afterEach` (#46, #52): a stop report
 * is sent from an effect cleanup that nothing awaits, and the unmount that
 * fires it is Testing Library's `cleanup`, which runs after this file's own
 * `afterEach`. Settling here is the only place that catches it.
 */
beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await savesHaveSettled();
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

type Write = { method: string; path: string; body: Record<string, unknown> };

async function stopReports(): Promise<Write[]> {
  const writes = (await fakeWrites()) as unknown as Write[];
  return writes.filter((write) => write.path === '/Sessions/Playing/Stopped');
}

async function signIn(
  profile: CapabilityProfileName,
  castSender: FakeCastSender,
): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ profile, storage: inMemoryDeviceStorage(), castSender })}
      messages={en}
    />,
  );
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

/** Plays Arrival and waits for the negotiation to have answered. */
async function play(
  options: { profile?: CapabilityProfileName; castSender?: FakeCastSender } = {},
): Promise<FakeCastSender> {
  const castSender = options.castSender ?? fakeCastSender();
  await signIn(options.profile ?? 'modern-desktop-browser', castSender);
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', 'Arrival');
  await screen.findByRole('heading', { name: 'Arrival', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: 'Playing Arrival' });
  // Enabled, not merely drawn: every control is `disabled` until the Server
  // has answered, and a press on one says nothing at all.
  await waitFor(() => {
    const open = screen.getByRole('button', { name: 'Playback options for Arrival' });
    expect((open as HTMLButtonElement).disabled).toBe(false);
  });
  return castSender;
}

function video(): HTMLVideoElement {
  const found = document.querySelector('video');
  if (found === null) throw new Error('The player has no video element.');
  return found as HTMLVideoElement;
}

async function openOptions(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Playback options for Arrival' }));
  return await screen.findByRole('dialog', { name: 'Playback options' });
}

describe('where the Cast control appears', () => {
  /**
   * The ticket's first acceptance criterion, first half: **only where the
   * device layer reports Cast support.** Nothing in the player reads
   * `window.chrome`; it reads `playbackTargets().cast`, which is what lets the
   * webOS port answer for itself.
   */
  it('is offered on a device the device layer says can Cast', async () => {
    await play({ profile: 'modern-desktop-browser' });
    const options = await openOptions();
    expect(options.contains(screen.getByRole('button', { name: 'Cast' }))).toBe(true);
  });

  it('is not there at all on a device that cannot Cast', async () => {
    await play({ profile: 'webos-5-like' });
    await openOptions();
    expect(screen.queryByRole('button', { name: 'Cast' })).toBeNull();
  });

  /**
   * And nothing is loaded to find that out. `decisions.md` §8 says Cast
   * availability cannot be detected without the SDK, so the control is drawn
   * from the cheap gate and the **press** is what loads two hundred kilobytes
   * off gstatic — a LAN-only Server with no internet reaches the player
   * without ever asking for it.
   */
  it('loads nothing until a User presses it', async () => {
    const sender = await play({ profile: 'modern-desktop-browser' });
    await openOptions();
    expect(sender.loads).toEqual([]);
  });
});

describe('casting a Title', () => {
  it('loads the sender on the press, for the receiver the User’s account names', async () => {
    await setFakeState({ userConfiguration: { [RAFAEL]: { CastReceiverId: '6F511C87' } } });
    const sender = await play();
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    await waitFor(() => expect(sender.loads.length).toBe(1));
    // The account's own id, which is the whole of `decisions.md` §8.
    expect(sender.loads[0]?.receiverId).toBe('6F511C87');
    // And Jellyfin's namespace, so the receiver's protocol is speakable.
    expect(sender.loads[0]?.namespace).toBe(JELLYFIN_CAST_NAMESPACE);
  });

  /**
   * The fake Server's Users have `CastReceiverId: null`, like every Server
   * that has not run the 12.x migration — so this is the ordinary case rather
   * than a fallback nobody meets.
   */
  it('uses Jellyfin’s published receiver when the account names none', async () => {
    const sender = await play();
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    await waitFor(() => expect(sender.loads.length).toBe(1));
    expect(sender.loads[0]?.receiverId).toBe(JELLYFIN_STABLE_RECEIVER_ID);
  });

  /**
   * The second acceptance criterion: **playback is controlled from this app.**
   * One `PlayNow` on the receiver's namespace, carrying the Title and the
   * place the User had got to.
   */
  it('tells the receiver to play the Title from where the User was', async () => {
    const sender = await play();
    video().currentTime = 42;
    fireEvent.timeUpdate(video());

    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    await waitFor(() => expect(sender.messages.length).toBe(1));
    const sent = sender.messages[0] as {
      command: string;
      options: { items: { Id: string }[]; startPositionTicks: number };
      userId: string;
      accessToken: string;
      deviceId: string;
      serverAddress: string;
    };
    expect(sent.command).toBe('PlayNow');
    expect(sent.options.items).toEqual([{ Id: 'movie-arrival' }]);
    // 42 seconds in Jellyfin's 100-nanosecond ticks, written out rather than
    // computed the way the code computes it.
    expect(sent.options.startPositionTicks).toBe(420_000_000);
    // The fourth acceptance criterion: the receiver is a Jellyfin client and
    // reports progress itself, which it cannot do without these.
    expect(sent.userId).toBe(RAFAEL);
    expect(sent.serverAddress).toBe(fakeJellyfinUrl());
    expect(sent.accessToken).not.toBe('');
    expect(sent.deviceId).not.toBe('');
  });

  /**
   * **The fourth acceptance criterion's other half, and the one that is easy
   * to miss.** Jellyfin's receiver opens a session of its own, so this device
   * has to close its own rather than leave it paused: two Jellyfin clients
   * reporting the same playback would give the Server two of everything, and
   * the resume point would be whichever stopped last.
   */
  it('hands over rather than playing in both places', async () => {
    const sender = await play();
    video().currentTime = 42;
    fireEvent.timeUpdate(video());
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    await waitFor(() => expect(sender.messages.length).toBe(1));
    // The picture here is stopped: a User watching a Chromecast is not also
    // watching their laptop.
    expect(video().paused).toBe(true);
    // And this device's session is closed, at the position the User reached.
    await waitFor(async () => expect((await stopReports()).length).toBe(1));
    const stopped = (await stopReports())[0];
    expect(stopped?.body.ItemId).toBe('movie-arrival');
    expect(stopped?.body.PositionTicks).toBe(420_000_000);
  });

  /** And a User can see where it went, beside the picture. */
  it('says which receiver it is playing on', async () => {
    const sender = await play({ castSender: fakeCastSender({ receiverName: 'Living Room' }) });
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    await waitFor(() => expect(sender.messages.length).toBe(1));
    expect(await screen.findByText('Casting to Living Room.')).toBeTruthy();
  });

  /**
   * Stopping brings it back to a control a User can find: the menu's button
   * is the same one, saying the opposite thing, which is `enterPip`'s shape
   * from #32.
   */
  it('can be stopped again from the same menu', async () => {
    const sender = await play({ castSender: fakeCastSender({ receiverName: 'Living Room' }) });
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));
    await waitFor(() => expect(sender.messages.length).toBe(1));

    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Stop casting' }));
    await waitFor(() => expect(sender.ended).toBe(1));
    expect(screen.queryByText('Casting to Living Room.')).toBeNull();
    // The Title is still open on this device: ending a cast is not closing
    // the player, the same way leaving a picture-in-picture window is not.
    expect(screen.getByRole('region', { name: 'Playing Arrival' })).toBeTruthy();
  });

  /**
   * A press that could not reach a receiver is said **beside the picture**,
   * like every other player failure: the Title is still playing here, and a
   * cast that did not happen has cost the User nothing else. The press also
   * closed the menu, so a message only the menu showed would be a message
   * nobody saw — #32's own reasoning for where this goes.
   */
  it('says so beside the picture when the sender will not load', async () => {
    const sender = await play({ castSender: fakeCastSender({ failing: true }) });
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    expect(await screen.findByText('Jellyflick could not reach a Cast device.')).toBeTruthy();
    expect(sender.messages).toEqual([]);
    // Nothing was handed over, so the Title is still playing here.
    await waitFor(async () => expect((await stopReports()).length).toBe(0));
  });

  /**
   * A **dismissed picker is not a failure**, and that difference is the whole
   * of this test: a User who opened the Cast picker and changed their mind has
   * asked for nothing and is owed no message. Telling them something went
   * wrong would be telling them their own decision was an error.
   */
  it('says nothing when the User dismisses the picker', async () => {
    const sender = await play({ castSender: fakeCastSender({ dismissed: true }) });
    await openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));

    await waitFor(() => expect(sender.loads.length).toBe(1));
    expect(screen.queryByText('Jellyflick could not reach a Cast device.')).toBeNull();
    expect(sender.messages).toEqual([]);
    expect(video().paused).toBe(false);
  });
});

describe('AirPlay', () => {
  /**
   * The element's two APIs are stubbed on the prototype, because happy-dom has
   * neither — the same bargain #32 made for `requestPictureInPicture`. What is
   * under test here is **the button following the watch**, which is this app's
   * code; whether Safari shows a picker is Safari's, and
   * `test/e2e/cast-and-airplay.spec.ts` is as close to it as any suite gets.
   */
  let announce: ((available: boolean) => void) | undefined;
  let prompted = 0;

  beforeEach(() => {
    announce = undefined;
    prompted = 0;
    Object.defineProperty(HTMLVideoElement.prototype, 'remote', {
      configurable: true,
      get() {
        return {
          watchAvailability: (callback: (available: boolean) => void) => {
            announce = callback;
            return Promise.resolve(1);
          },
          cancelWatchAvailability: () => Promise.resolve(),
          prompt: () => {
            prompted += 1;
            return Promise.resolve();
          },
        };
      },
    });
  });

  afterEach(() => {
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).remote;
  });

  /**
   * **Not offered until there is somewhere to send it.** The capability can
   * only say Safari has the API; a house with no Apple TV in it would
   * otherwise get a control that opens an empty picker.
   */
  it('is offered once the element says there is a target, and not before', async () => {
    await play({ profile: 'phone-safari' });
    await openOptions();
    expect(screen.queryByRole('button', { name: 'AirPlay' })).toBeNull();

    await waitFor(() => expect(announce).not.toBeUndefined());
    announce?.(true);
    expect(await screen.findByRole('button', { name: 'AirPlay' })).toBeTruthy();

    // And it goes away again when the target does.
    announce?.(false);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'AirPlay' })).toBeNull());
  });

  /** The third acceptance criterion: the press is Safari's own picker. */
  it('opens the element’s own picker', async () => {
    await play({ profile: 'phone-safari' });
    await openOptions();
    await waitFor(() => expect(announce).not.toBeUndefined());
    announce?.(true);

    fireEvent.click(await screen.findByRole('button', { name: 'AirPlay' }));
    await waitFor(() => expect(prompted).toBe(1));
    /*
     * **And nothing is handed over.** AirPlay routes the element Safari is
     * already decoding, so this session keeps playing and keeps reporting —
     * which is the opposite of the Chromecast case above, where a second
     * Jellyfin client takes the session on.
     */
    await waitFor(async () => expect((await stopReports()).length).toBe(0));
  });

  /** A device the device layer says has no AirPlay never watches for one. */
  it('is not offered on a device with no AirPlay', async () => {
    await play({ profile: 'webos-5-like' });
    await openOptions();
    expect(screen.queryByRole('button', { name: 'AirPlay' })).toBeNull();
    expect(announce).toBeUndefined();
  });
});
