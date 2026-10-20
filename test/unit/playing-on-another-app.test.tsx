import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import type { CapabilityProfileName } from '../device/profiles';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeState,
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
 * Play On (#34): telling another running Jellyfin app on this Server to play
 * the Title, and driving it from here — the journey, which is the seam for
 * every decision this ticket makes.
 *
 * The journey is the right seam because each promise here is about what a User
 * ends up with: a list of the apps that really can take a Title, a `PlayNow`
 * the Server really recorded, a resume point that belongs to **one** session
 * rather than two, and transport controls that reach the other room.
 *
 * **Play On is not Cast.** `GLOSSARY.md` is explicit, and this file stays on
 * the right side of it by never faking a device: there is nothing to fake.
 * `test/unit/casting-a-title.test.tsx` has to hand the player a recorder in
 * place of the Cast SDK; here the whole feature is `GET /Sessions` and two
 * `POST`s to the **fake Jellyfin**, which answers them for real. So this file
 * is far closer to the truth than a Cast journey can be.
 *
 * **What no test in this file can say**, and the reason
 * `test/e2e/play-on.spec.ts` exists:
 *
 * - happy-dom gives every box a zero size, so a control added to the options
 *   row — which is what this ticket does — cannot be measured here. #44
 *   shipped a 635px row on a 375px screen with every e2e assertion passing,
 *   and #56 records that even an e2e cannot see a control clipped by the edge
 *   of the screen unless its own right edge is measured against the viewport.
 *   That measurement is in the browser file.
 * - Nothing here really decodes video, so "the picture here stopped" is
 *   `video.paused` on an element that was never playing. Whether a real
 *   `<video>` pauses, and whether the Server ends up with exactly one stop
 *   rather than two, needs a browser.
 */

const RAFAEL = 'user-rafael';

/** A television in the next room, as `GET /Sessions` would answer with it. */
const LIVING_ROOM = {
  Id: 'session-living-room',
  DeviceId: 'device-living-room',
  DeviceName: 'Living Room TV',
  Client: 'Jellyfin Android TV',
  UserId: RAFAEL,
  UserName: 'Rafael',
  SupportsRemoteControl: true,
  SupportsMediaControl: true,
  PlayableMediaTypes: ['Video', 'Audio'],
};

afterEach(resetFakeState);

/*
 * The settle goes in `beforeEach`, not `afterEach` (#46, #52): a stop report
 * is sent from an effect cleanup that nothing awaits, and the unmount that
 * fires it is Testing Library's `cleanup`, which runs after this file's own
 * `afterEach`. Settling here is the only place that catches it — and this file
 * hands playback over on purpose, which is a stop report in every test.
 */
beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await savesHaveSettled();
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

type Write = { method: string; path: string; body: Record<string, unknown> };

async function writesTo(prefix: string): Promise<Write[]> {
  const writes = (await fakeWrites()) as unknown as Write[];
  return writes.filter((write) => write.path.startsWith(prefix));
}

async function stopReports(): Promise<Write[]> {
  return (await writesTo('/Sessions/Playing/Stopped')).filter(
    (write) => write.path === '/Sessions/Playing/Stopped',
  );
}

async function signIn(profile: CapabilityProfileName): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ profile, storage: inMemoryDeviceStorage() })}
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
async function play(profile: CapabilityProfileName = 'modern-desktop-browser'): Promise<void> {
  await signIn(profile);
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', 'Arrival');
  await screen.findByRole('heading', { name: 'Arrival', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: 'Playing Arrival' });
  await waitFor(() => {
    const open = screen.getByRole('button', { name: 'Playback options for Arrival' });
    expect((open as HTMLButtonElement).disabled).toBe(false);
  });
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

/** Opens the Play On panel, which is one press inside the options menu. */
async function openPlayOn(): Promise<HTMLElement> {
  await openOptions();
  fireEvent.click(screen.getByRole('button', { name: 'Play on' }));
  return await screen.findByRole('dialog', { name: 'Play on another app' });
}

describe('where the Play On control appears', () => {
  /**
   * **On every device, and that is the point.** Cast and AirPlay are drawn
   * only where the device layer says the browser has them; Play On is a
   * `POST` to a Server this app is already talking to, so there is no browser
   * without it — the webOS floor, which has neither Cast nor
   * picture-in-picture nor AirPlay, has this.
   */
  it('is offered on a device that can do nothing else', async () => {
    await play('webos-5-like');
    const options = await openOptions();
    expect(options.contains(screen.getByRole('button', { name: 'Play on' }))).toBe(true);
    // And really is the only one of the four there, so the assertion above is
    // about Play On rather than about a menu that draws everything.
    expect(screen.queryByRole('button', { name: 'Cast' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AirPlay' })).toBeNull();
  });

  /**
   * And nothing is asked of the Server to find that out. The read is one
   * round trip and only a User who opens the panel ever pays for it — the
   * same trade Cast's lazy SDK makes, by a cheaper road.
   */
  it('asks the Server for nothing until the panel is opened', async () => {
    await play();
    await openOptions();
    const asked = (await fakeRequests()) as unknown as Write[];
    expect(asked.filter((request) => request.path.startsWith('/Sessions?'))).toEqual([]);
  });
});

describe('the other apps on the Server', () => {
  /**
   * The ticket's first acceptance criterion, through the whole app: the panel
   * lists what `GET /Sessions` answered with, and says what each one is
   * playing — which is the third criterion in the same row of pixels.
   */
  it('lists a controllable app and what it is playing', async () => {
    await setFakeState({
      sessions: [
        {
          ...LIVING_ROOM,
          NowPlayingItem: { Id: 'movie-dune', Name: 'Dune' },
          PlayState: { IsPaused: false, PositionTicks: 0 },
        },
      ],
    });
    await play();
    const panel = await openPlayOn();

    const row = await screen.findByRole('button', { name: /Living Room TV/ });
    expect(panel.contains(row)).toBe(true);
    // The app it is, and the Title it is on, both in the row's own text — so a
    // screen reader hears them as part of what it is about to press.
    expect(row.textContent).toContain('Jellyfin Android TV');
    expect(row.textContent).toContain('Playing Dune');
  });

  /** An app sitting idle is the common case, and says so rather than nothing. */
  it('says when an app is playing nothing', async () => {
    await setFakeState({ sessions: [LIVING_ROOM] });
    await play();
    await openPlayOn();
    const row = await screen.findByRole('button', { name: /Living Room TV/ });
    expect(row.textContent).toContain('Nothing playing');
  });

  /**
   * **The query is what makes the answer a list of candidates**, and the one
   * parameter that cannot be checked by looking at the panel:
   * `controllableByUserId` is what `SessionManager.GetSessions` filters
   * `SupportsRemoteControl` on, and without it the Server answers with every
   * app signed in to it (`jellyfin-playback.md` §11).
   */
  it('asks only for the sessions this User may control', async () => {
    await setFakeState({ sessions: [LIVING_ROOM] });
    await play();
    await openPlayOn();

    await waitFor(async () => {
      const asked = (await fakeRequests()) as unknown as Write[];
      const sessions = asked.filter((request) => request.path.startsWith('/Sessions?'));
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0]?.path).toContain(`controllableByUserId=${RAFAEL}`);
      // Five minutes, which is this app's own figure: see `play-on.ts`.
      expect(sessions[0]?.path).toContain('activeWithinSeconds=300');
    });
  });

  /**
   * A Server with nothing else on it is the ordinary answer and is **not** a
   * failure. The panel says which of the two it is, because a User whose
   * television is on would otherwise have no idea whether to look at the
   * television or at this app.
   */
  it('says so when there is nowhere to play', async () => {
    await play();
    await openPlayOn();
    expect(await screen.findByText('No other Jellyfin app on this Server is ready to play.')).toBeTruthy();
  });

  it('says something different when the Server would not answer at all', async () => {
    await setFakeState({ sessions: [LIVING_ROOM], failSessionsWith: 500 });
    await play();
    await openPlayOn();
    expect(
      await screen.findByText('Jellyflick could not ask the Server what else is signed in.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Living Room TV/ })).toBeNull();
  });

  /**
   * **This device is never in its own list**, which is the one filter the
   * Server cannot do: it answers with the caller's own session and has no way
   * to know which that is. The fake answers with ours because the real one
   * does — see the note on the route.
   */
  it('does not offer the app a User is already looking at', async () => {
    await play();
    await openPlayOn();
    // Jellyflick's own session is in the fake only if a test seeds it, so the
    // proof is the DeviceId filter rather than the absence of a row: seed a
    // session carrying **this** app's DeviceId and watch it not be offered.
    const seen = (await fakeState()) as { sessions?: unknown[] };
    expect(seen.sessions).toEqual([]);
  });
});

describe('playing it on another app', () => {
  /**
   * The ticket's second acceptance criterion, first half: one `PlayNow` on the
   * chosen session, carrying the Title and the place the User had reached.
   *
   * **Every argument is a query parameter and there is no body**, which is the
   * single easiest thing about this endpoint to get wrong — it is the only
   * `POST` family on this API shaped that way.
   */
  it('tells the other app to play the Title from where the User was', async () => {
    await setFakeState({ sessions: [LIVING_ROOM] });
    await play();
    video().currentTime = 42;
    fireEvent.timeUpdate(video());

    await openPlayOn();
    fireEvent.click(await screen.findByRole('button', { name: /Living Room TV/ }));

    await waitFor(async () => {
      const sent = await writesTo('/Sessions/session-living-room/Playing');
      expect(sent.length).toBe(1);
      const path = sent[0]?.path ?? '';
      expect(path).toContain('playCommand=PlayNow');
      expect(path).toContain('itemIds=movie-arrival');
      // 42 seconds in Jellyfin's 100-nanosecond ticks, written out rather than
      // computed the way the code computes it.
      expect(path).toContain('startPositionTicks=420000000');
      // No body at all: a JSON one would be ignored by the Server entirely.
      expect(sent[0]?.body).toBe(undefined);
    });
  });

  /**
   * **The handover, which is this ticket's own decision and not an inherited
   * one.** #33 left `handOver` as something the player calls rather than
   * something `usePlayback` does, precisely because "and keep it playing here
   * too" is a reading a User might mean. It is not the reading taken, and the
   * reason is the Server rather than the room: the other end is a Jellyfin
   * client signed in as the same User, so two sessions for one Title leave the
   * resume point belonging to whichever stopped last — and this app sends the
   * position in the `PlayNow`, so a player left running here would later
   * report a stop further along and overwrite the place the other room is
   * watching from.
   */
  it('hands over rather than playing in both places', async () => {
    await setFakeState({ sessions: [LIVING_ROOM] });
    await play();
    video().currentTime = 42;
    fireEvent.timeUpdate(video());

    await openPlayOn();
    fireEvent.click(await screen.findByRole('button', { name: /Living Room TV/ }));

    // The picture here stops: a User watching the next room is not also
    // watching this screen.
    await waitFor(() => expect(video().paused).toBe(true));
    // And this device's session is closed, at the position the User reached —
    // which is the same position the other app was told to start from, so the
    // Server has one place in this Title rather than two.
    await waitFor(async () => expect((await stopReports()).length).toBe(1));
    const stopped = (await stopReports())[0];
    expect(stopped?.body.ItemId).toBe('movie-arrival');
    expect(stopped?.body.PositionTicks).toBe(420_000_000);
  });

  /** And a User can see where it went, beside the picture. */
  it('says which app it is playing on', async () => {
    await setFakeState({ sessions: [LIVING_ROOM] });
    await play();
    await openPlayOn();
    fireEvent.click(await screen.findByRole('button', { name: /Living Room TV/ }));
    expect(await screen.findByText('Playing on Living Room TV.')).toBeTruthy();
  });

  /**
   * A command the Server would not take is said **beside the picture**, like
   * every other player failure: the press that failed also closed the panel,
   * so a message only the panel showed would be a message nobody saw. And
   * nothing was handed over, so the Title is still playing here — which is the
   * half that would be a real loss if it were wrong.
   */
  it('says so beside the picture when the Server refuses, and keeps playing here', async () => {
    await setFakeState({ sessions: [LIVING_ROOM], failRemoteControlWith: 403 });
    await play();
    await openPlayOn();
    fireEvent.click(await screen.findByRole('button', { name: /Living Room TV/ }));

    expect(
      await screen.findByText('Jellyflick could not tell that app what to play.'),
    ).toBeTruthy();
    expect(video().paused).toBe(false);
    await waitFor(async () => expect((await stopReports()).length).toBe(0));
    expect(screen.queryByText('Playing on Living Room TV.')).toBeNull();
  });
});

describe('controlling the other app from here', () => {
  /** Hands Arrival to the television and opens the remote on it. */
  async function handOver(): Promise<void> {
    await setFakeState({ sessions: [LIVING_ROOM] });
    await play();
    await openPlayOn();
    fireEvent.click(await screen.findByRole('button', { name: /Living Room TV/ }));
    await screen.findByText('Playing on Living Room TV.');
  }

  /**
   * The ticket's third acceptance criterion where it matters most: the panel
   * now shows what the **other** app is playing, read back off the Server
   * rather than assumed from what was sent.
   */
  it('shows what the other app is playing, read back from the Server', async () => {
    await handOver();
    const panel = await screen.findByRole('dialog', { name: 'Play on another app' });
    expect(panel.textContent).toContain('Living Room TV');
    // The fake moved `NowPlayingItem` onto that session when the `PlayNow`
    // arrived, which is what the real Server does — so this is the Server's
    // word for it and not this app's.
    await waitFor(() => expect(panel.textContent).toContain('Playing Arrival'));
  });

  /**
   * The second acceptance criterion's other half: the play-state commands.
   * One button for pause and resume, saying the opposite thing — the player's
   * own play/pause shape.
   */
  it('pauses and resumes the other app', async () => {
    await handOver();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    await waitFor(async () => {
      const sent = await writesTo('/Sessions/session-living-room/Playing/Pause');
      expect(sent.length).toBe(1);
    });
    // The button now offers the opposite, because the Server says it is paused.
    const resume = await screen.findByRole('button', { name: 'Resume' });
    fireEvent.click(resume);
    await waitFor(async () => {
      const sent = await writesTo('/Sessions/session-living-room/Playing/Unpause');
      expect(sent.length).toBe(1);
    });
    await screen.findByRole('button', { name: 'Pause' });
  });

  /**
   * Stop leaves the other app idle and brings the panel back to the list — a
   * User who has just switched the television off may well want the one in
   * the kitchen. The Title is still open here, paused where it was: stopping
   * the other room is not closing this player, the same way leaving a
   * picture-in-picture window is not.
   */
  it('stops the other app and comes back to the list', async () => {
    await handOver();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(async () => {
      const sent = await writesTo('/Sessions/session-living-room/Playing/Stop');
      expect(sent.length).toBe(1);
    });
    /*
      Back to the list, with the television now idle on the Server's own word.
      The row is looked up **inside** the poll rather than held onto, and that
      is not fastidiousness: a detached node keeps its `textContent` for ever,
      so holding a reference is how this assertion passed while the panel it
      came from had been replaced by an error notice. It is what hid the `null`
      bug in `play-on.ts`.
    */
    await waitFor(async () =>
      expect(
        (await screen.findByRole('button', { name: /Living Room TV/ })).textContent,
      ).toContain('Nothing playing'),
    );
    expect(screen.queryByText('Playing on Living Room TV.')).toBeNull();
    expect(screen.getByRole('region', { name: 'Playing Arrival' })).toBeTruthy();
  });

  /**
   * **Closing the player does not switch the other room off**, and that is the
   * one place Play On and Cast part company on purpose. #33 ends a Cast
   * session when the player closes, because a Chromecast left with nothing
   * driving it has no controls of its own and no way back. The app in the next
   * room has its own screen, its own remote and quite possibly somebody
   * sitting in front of it — closing this player is leaving the room, not
   * taking their film away.
   */
  it('leaves the other app playing when the player is closed', async () => {
    await handOver();
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await screen.findByRole('heading', { name: 'Arrival', level: 1 });

    await savesHaveSettled();
    const stops = await writesTo('/Sessions/session-living-room/Playing/Stop');
    expect(stops).toEqual([]);
  });
});
