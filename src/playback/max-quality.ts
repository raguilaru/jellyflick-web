import type { DeviceStorage } from '../device/types';

/**
 * The maximum quality this device will ask for (#32, story 93).
 *
 * **It is a device setting, not a User setting**, and the spec says so in as
 * many words: a household's Client Settings follow a User between devices,
 * and the whole point of this one is that it does not. A phone on a mobile
 * connection and the television beside it belong to the same User and want
 * opposite answers, so this lives in `device.storage()` under one key owned
 * by this module — the arrangement `src/session/` already uses.
 *
 * **Auto is the absence of a choice, not a value.** There is no "Auto"
 * bitrate: a Server asked for no ceiling sends the best the DeviceProfile can
 * take, which is what every other Jellyfin client means by Auto. So the stored
 * value is either a number of bits per second or nothing at all, and nothing
 * at all is the default a device starts life with.
 */

/** The key this module owns in device storage. Nothing else may write it. */
export const MAX_QUALITY_STORAGE_KEY = 'jellyflick.maxQuality';

/**
 * The ceilings offered, highest first, in bits per second.
 *
 * They are **bitrates rather than resolutions**, which is the honest labelling:
 * what is being limited is data, which is what story 93 asks for ("so that I
 * can limit data use on a phone"), and a ceiling of 4 Mbps does not promise
 * any particular picture height — the Server picks whatever fits. Naming them
 * 1080p and 720p would promise something this app does not ask for.
 *
 * The ladder is Jellyfin's own shape, thinned to the steps a person would
 * actually pick between.
 */
export const MAXIMUM_QUALITIES: readonly number[] = [
  20_000_000,
  8_000_000,
  4_000_000,
  2_000_000,
  720_000,
];

/**
 * The ceiling this device has chosen, or nothing for Auto.
 *
 * Anything unreadable is Auto: a storage that refused to answer, a value from
 * a later version of this app, a number somebody edited by hand. A device that
 * cannot remember a ceiling asks for the best picture, which is the behaviour
 * this app had before the setting existed.
 */
export function readMaxQuality(storage: DeviceStorage): number | undefined {
  const raw = storage.read(MAX_QUALITY_STORAGE_KEY);
  if (raw === undefined) return undefined;
  const bitrate = Number.parseInt(raw, 10);
  if (!Number.isFinite(bitrate) || bitrate <= 0) return undefined;
  return bitrate;
}

/** Remembers a ceiling, or forgets one: `undefined` is Auto, and is removed. */
export function writeMaxQuality(storage: DeviceStorage, bitrate: number | undefined): void {
  if (bitrate === undefined) {
    storage.remove(MAX_QUALITY_STORAGE_KEY);
    return;
  }
  storage.write(MAX_QUALITY_STORAGE_KEY, String(bitrate));
}

/**
 * What the DeviceProfile should claim, given what the device could take and
 * what this device has been told to stop at.
 *
 * A ceiling only ever **lowers** it. A device that can decode 4K asked to stop
 * at 2 Mbps gets 2 Mbps; a device whose own ceiling is already lower than the
 * choice keeps its own, because the choice is a limit and not a request.
 */
export function cappedBitrate(deviceCeiling: number, chosen: number | undefined): number {
  if (chosen === undefined) return deviceCeiling;
  return Math.min(deviceCeiling, chosen);
}
