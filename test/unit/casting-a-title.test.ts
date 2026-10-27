import { describe, expect, it } from 'vitest';
import {
  castReceiverId,
  JELLYFIN_CAST_NAMESPACE,
  JELLYFIN_STABLE_RECEIVER_ID,
  playNowMessage,
} from '../../src/playback/cast';

/**
 * What this app tells a Chromecast, and which receiver it tells it to (#33).
 *
 * This file is the **arithmetic** of Cast: the receiver application a User's
 * Jellyfin account names, and the one message Jellyfin's receiver is driven
 * with. Everything that needs a browser is elsewhere —
 * `test/unit/casting-a-title.test.tsx` is the journey through the player, and
 * `test/e2e/cast-and-airplay.spec.ts` loads a real SDK off a real `<script>`
 * into a real browser, which is where #29's lesson lands.
 *
 * The expected values are **read from Jellyfin** rather than recomputed the
 * way the code computes them: `F007D354` is the id the Server's own
 * `AddDefaultCastReceivers` migration seeds (`player-subtitles.md` §7a, traced
 * to the source), and the namespace is the one Jellyfin's receiver listens on.
 */

describe('which receiver to cast to', () => {
  /**
   * `decisions.md` §8, in one assertion: the id comes from the **User's
   * account**, at runtime, not from a constant in this app. A Server admin can
   * change the list, and an app that hardcoded `F007D354` would cast to the
   * wrong receiver on every install that has.
   */
  it('is the one the User’s Jellyfin account names', () => {
    expect(castReceiverId('6F511C87')).toBe('6F511C87');
  });

  /**
   * And the published Stable receiver when the account names none, which is
   * not a nicety: `ServerConfiguration.CastReceiverApplications` defaults to
   * an **empty array**, so every Server that has not run the 12.x migration
   * has nothing to say here — the fake this suite runs against included.
   */
  it('falls back to Jellyfin’s published Stable receiver when the account names none', () => {
    expect(castReceiverId(undefined)).toBe(JELLYFIN_STABLE_RECEIVER_ID);
    expect(JELLYFIN_STABLE_RECEIVER_ID).toBe('F007D354');
  });

  /** An empty string is how a Jellyfin account stores "nothing chosen". */
  it('treats an empty or blank id as none chosen', () => {
    expect(castReceiverId('')).toBe(JELLYFIN_STABLE_RECEIVER_ID);
    expect(castReceiverId('   ')).toBe(JELLYFIN_STABLE_RECEIVER_ID);
    expect(castReceiverId(null)).toBe(JELLYFIN_STABLE_RECEIVER_ID);
  });

  /** Trimmed, because the field is typed by hand into a dashboard. */
  it('trims an id a dashboard left padded', () => {
    expect(castReceiverId(' F007D354 ')).toBe('F007D354');
  });
});

describe('the message that starts a Title on the receiver', () => {
  const sent = playNowMessage({
    itemId: 'movie-arrival',
    userId: 'user-rafael',
    deviceId: 'device-7',
    accessToken: 'token-abc',
    serverAddress: 'http://127.0.0.1:8787',
    serverId: 'server-1',
    startPositionTicks: 1_200_000_000,
  });

  /**
   * The namespace is Jellyfin's own, and it is **this app's** fact rather than
   * the device layer's: `src/device/` owns the Cast SDK, and which protocol is
   * spoken over it is a Jellyfin question.
   */
  it('goes on Jellyfin’s receiver namespace', () => {
    expect(JELLYFIN_CAST_NAMESPACE).toBe('urn:x-cast:com.connectsdk');
  });

  it('asks the receiver to play the Title now, from where the User had got to', () => {
    expect(sent.command).toBe('PlayNow');
    expect(sent.options.items).toEqual([{ Id: 'movie-arrival' }]);
    expect(sent.options.startPositionTicks).toBe(1_200_000_000);
  });

  /**
   * **The ticket's fourth acceptance criterion lives in these five fields.**
   *
   * Jellyfin's receiver reports progress to the Server itself — it is a
   * Jellyfin client in its own right, which is the whole reason to use
   * Jellyfin's receiver rather than hand a bare `MediaInfo` to the default
   * one. It can only report with somewhere to report to and something to
   * report with, so a message missing any one of these is a cast that plays
   * and is never recorded: no resume point, nothing in Continue Watching, and
   * no "now playing" for another Jellyfin app to see.
   */
  it('carries what the receiver reports progress to Jellyfin with', () => {
    expect(sent.serverAddress).toBe('http://127.0.0.1:8787');
    expect(sent.serverId).toBe('server-1');
    expect(sent.userId).toBe('user-rafael');
    expect(sent.accessToken).toBe('token-abc');
    expect(sent.deviceId).toBe('device-7');
  });

  /** A Title started from the beginning says so with a zero, not a silence. */
  it('starts at the beginning when that is where the User is', () => {
    const fromTheTop = playNowMessage({
      itemId: 'movie-arrival',
      userId: 'user-rafael',
      deviceId: 'device-7',
      accessToken: 'token-abc',
      serverAddress: 'http://127.0.0.1:8787',
      serverId: 'server-1',
      startPositionTicks: 0,
    });
    expect(fromTheTop.options.startPositionTicks).toBe(0);
  });
});
