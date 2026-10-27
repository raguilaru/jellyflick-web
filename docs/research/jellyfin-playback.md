# Jellyfin 12.x playback, sessions, segments, trickplay, subtitles, download

Part of the Jellyflick API research. Index and sourcing conventions: [`jellyfin-api.md`](./jellyfin-api.md). All paths and field names below are from the **Jellyfin OpenAPI stable spec, `x-jellyfin-version: 12.2.0`** (<https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json>), with behaviour confirmed against **jellyfin source at tag `v12.2`**.

---

## 9. Playback: `PlaybackInfo` and the direct-play URL

### `POST /Items/{itemId}/PlaybackInfo`

Both `GET` and `POST` exist. `GET` takes only `itemId` + `userId` and is useless to us — **always use `POST`**, which is the only form that accepts a `DeviceProfile`.

The `POST` form takes its arguments **twice**: as query parameters *and* in the body. The query parameters are:

`userId, maxStreamingBitrate, startTimeTicks, audioStreamIndex, subtitleStreamIndex, maxAudioChannels, mediaSourceId, liveStreamId, autoOpenLiveStream, enableDirectPlay, enableDirectStream, enableTranscoding, allowVideoStreamCopy, allowAudioStreamCopy`

The body is `PlaybackInfoDto` and covers all of the same ground plus the profile. **Prefer the body**; it is the typed, generated shape:

```jsonc
{
  "UserId": "<guid>",
  "MaxStreamingBitrate": 20000000,
  "StartTimeTicks": 0,
  "AudioStreamIndex": 1,
  "SubtitleStreamIndex": 2,
  "MaxAudioChannels": 2,
  "MediaSourceId": "<id>",
  "LiveStreamId": null,
  "DeviceProfile": { /* see below */ },
  "EnableDirectPlay": true,
  "EnableDirectStream": true,
  "EnableTranscoding": true,
  "AllowVideoStreamCopy": true,
  "AllowAudioStreamCopy": true,
  "AutoOpenLiveStream": false,
  "AlwaysBurnInSubtitleWhenTranscoding": false
}
```

Note the exact casing: **`EnableDirectPlay`, `EnableDirectStream`, `EnableTranscoding`** (body) vs `enableDirectPlay`, `enableDirectStream`, `enableTranscoding` (query). `AlwaysBurnInSubtitleWhenTranscoding` is relevant to story 105 (burned-in image subtitles on TV).

### `DeviceProfile` shape

```
DeviceProfile {
  Name, Id,
  MaxStreamingBitrate, MaxStaticBitrate,
  MusicStreamingTranscodingBitrate, MaxStaticMusicBitrate,
  DirectPlayProfiles: DirectPlayProfile[],
  TranscodingProfiles: TranscodingProfile[],
  ContainerProfiles:   ContainerProfile[],
  CodecProfiles:       CodecProfile[],
  SubtitleProfiles:    SubtitleProfile[]
}

DirectPlayProfile { Container, AudioCodec, VideoCodec, Type: DlnaProfileType }

TranscodingProfile {
  Container, Type: DlnaProfileType, VideoCodec, AudioCodec,
  Protocol: MediaStreamProtocol, EstimateContentLength, EnableMpegtsM2TsMode,
  TranscodeSeekInfo: TranscodeSeekInfo, CopyTimestamps, Context: EncodingContext,
  EnableSubtitlesInManifest, MaxAudioChannels, MinSegments, SegmentLength,
  BreakOnNonKeyFrames, Conditions: ProfileCondition[], EnableAudioVbrEncoding
}

SubtitleProfile { Format, Method: SubtitleDeliveryMethod, DidlMode, Language, Container }
```

`Container`, `VideoCodec`, `AudioCodec` are **comma-separated strings**, not arrays (`"mp4,m4v"`, `"h264,hevc"`, `"aac,mp3"`). `DirectPlayProfile.Container` and `TranscodingProfile.Container`/`VideoCodec`/`AudioCodec` are non-nullable.

The browser-capability probing that fills this in (`canPlayType` / `MediaSource.isTypeSupported`) is ours to write; there is no server endpoint for it. This is a good fit for the device layer the spec calls for.

### Response — `PlaybackInfoResponse`

**Only three fields:**

| Field | Type |
| --- | --- |
| **`MediaSources`** | `MediaSourceInfo[]` |
| **`PlaySessionId`** | string |
| `ErrorCode` | `PlaybackErrorCode` nullable |

**`TranscodingUrl`, `SupportsDirectPlay` and `SupportsDirectStream` are NOT on the response — they are per-`MediaSourceInfo`.** This is the single most common mistake with this endpoint. `MediaSourceInfo` carries:

| Field | Type | Use |
| --- | --- | --- |
| `Id` | string | The `mediaSourceId` for every later call. |
| **`SupportsDirectPlay`** | bool | Play the file as-is from `/Videos/{id}/stream`. |
| **`SupportsDirectStream`** | bool | Remux-only. |
| `SupportsTranscoding` | bool | |
| **`TranscodingUrl`** | string nullable | **Server-relative URL, already fully parameterised and already carrying `ApiKey`.** Use it verbatim; do not rebuild it. |
| `TranscodingSubProtocol` | `MediaStreamProtocol` | `hls` vs `http` — decides hls.js vs plain `<video>`. |
| `TranscodingContainer` | string nullable | |
| `Container`, `Path`, `Protocol`, `Size`, `Bitrate`, `RunTimeTicks`, `ETag` | | |
| **`MediaStreams`** | `MediaStream[]` | audio / subtitle / video tracks (stories 74, 85). |
| **`DefaultAudioStreamIndex`**, **`DefaultSubtitleStreamIndex`** | int nullable | **The server's answer to story 86** — it has already applied the user's `AudioLanguagePreference` / `SubtitleLanguagePreference` / `SubtitleMode`. Use these rather than re-implementing the matching. |
| **`HasSegments`** | bool | Whether `GET /MediaSegments/{itemId}` is worth calling (topic 12). |
| `RequiresOpening`, `OpenToken`, `RequiresClosing`, `LiveStreamId` | | Live TV; not needed. |
| `MediaAttachments` | `MediaAttachment[]` | Embedded fonts for ASS rendering (story 104). |
| `RequiredHttpHeaders` | object | |
| `UseMostCompatibleTranscodingProfile`, `FallbackMaxStreamingBitrate` | | |

Decision order: pick a `MediaSourceInfo` → if `SupportsDirectPlay`, build the direct URL → else if `TranscodingUrl`, use it as-is → else surface an error using `ErrorCode` (story 95).

### `/Videos/{id}/stream` — the direct-play URL

```
GET /Videos/{itemId}/stream
GET /Videos/{itemId}/stream.{container}
```

Direct-play form (`static=true` tells the server to serve the file untouched):

```
{serverUrl}/Videos/{itemId}/stream?static=true&mediaSourceId={mediaSourceId}&playSessionId={PlaySessionId}&ApiKey={accessToken}
```

Or with the container in the path, which gives the browser a correct extension:

```
{serverUrl}/Videos/{itemId}/stream.{container}?static=true&mediaSourceId={mediaSourceId}&playSessionId={PlaySessionId}&ApiKey={accessToken}
```

Full query-parameter list for `GET /Videos/{itemId}/stream` (51 of them):

`itemId, container, static, params, tag, deviceProfileId, playSessionId, segmentContainer, segmentLength, minSegments, mediaSourceId, deviceId, audioCodec, enableAutoStreamCopy, allowVideoStreamCopy, allowAudioStreamCopy, audioSampleRate, maxAudioBitDepth, audioBitRate, audioChannels, maxAudioChannels, profile, level, framerate, maxFramerate, copyTimestamps, startTimeTicks, width, height, maxWidth, maxHeight, videoBitRate, subtitleStreamIndex, subtitleMethod, maxRefFrames, maxVideoBitDepth, requireAvc, deInterlace, requireNonAnamorphic, transcodingMaxAudioChannels, cpuCoreLimit, liveStreamId, enableMpegtsM2TsMode, videoCodec, subtitleCodec, transcodeReasons, audioStreamIndex, videoStreamIndex, context, streamOptions, enableAudioVbrEncoding`

`deviceProfileId` is marked `[ParameterObsolete]` in the controller — don't use it.

**Authorisation note.** In `Jellyfin.Api/Controllers/VideosController.cs` @ v12.2, `GetVideoStream` carries no `[Authorize]`, the controller class carries none, `BaseJellyfinApiController` carries none, and `Jellyfin.Server/Startup.cs` sets no MVC fallback policy (only `options.DefaultPolicy` in `ApiServiceCollectionExtensions.cs`, which applies to `[Authorize]` without a named policy). So the ASP.NET pipeline does not require a token on `/Videos/{id}/stream`. **Send `ApiKey` anyway** — it is what the server's own generated URLs do, it is needed for session/progress attribution, and *to verify in implementation* whether restricted items still 404 or 403 without it.

---

## 10. Progress reporting

Three endpoints, all `POST`, all returning 204 and taking **no query parameters** — everything is in the body.

| Endpoint | Body schema |
| --- | --- |
| `POST /Sessions/Playing` | `PlaybackStartInfo` |
| `POST /Sessions/Playing/Progress` | `PlaybackProgressInfo` |
| `POST /Sessions/Playing/Stopped` | `PlaybackStopInfo` |
| `POST /Sessions/Playing/Ping?playSessionId=…` | — (`playSessionId` query, **required**) |

**`PlaybackStartInfo` and `PlaybackProgressInfo` are field-for-field identical** in 12.2.0:

| Field | Type |
| --- | --- |
| `CanSeek` | bool |
| `Item` | `BaseItemDto` nullable |
| **`ItemId`** | string (GUID) |
| **`SessionId`** | string nullable |
| **`MediaSourceId`** | string nullable |
| `AudioStreamIndex` | int nullable |
| `SubtitleStreamIndex` | int nullable |
| **`IsPaused`** | bool |
| `IsMuted` | bool |
| **`PositionTicks`** | int64 nullable |
| `PlaybackStartTimeTicks` | int64 nullable |
| `VolumeLevel` | int nullable |
| `Brightness` | int nullable |
| `AspectRatio` | string nullable |
| **`PlayMethod`** | `PlayMethod` |
| `LiveStreamId` | string nullable |
| **`PlaySessionId`** | string nullable |
| `RepeatMode` | `RepeatMode` |
| `PlaybackOrder` | `PlaybackOrder` |
| `NowPlayingQueue` | `QueueItem[]` nullable |
| `PlaylistItemId` | string nullable |

`PlaybackStopInfo` is a **different, smaller** shape — note the absent `IsPaused`, `PlayMethod` and stream indexes, and the extra `Failed`/`NextMediaType`:

| Field | Type |
| --- | --- |
| `Item` | `BaseItemDto` nullable |
| **`ItemId`** | string |
| `SessionId` | string nullable |
| `MediaSourceId` | string nullable |
| **`PositionTicks`** | int64 nullable |
| `LiveStreamId` | string nullable |
| **`PlaySessionId`** | string nullable |
| **`Failed`** | bool |
| `NextMediaType` | string nullable |
| `PlaylistItemId` | string nullable |
| `NowPlayingQueue` | `QueueItem[]` nullable |

`QueueItem` = `{ Id, PlaylistItemId }`.

`PlayMethod` enum: **`Transcode`, `DirectStream`, `DirectPlay`**. Report whichever branch of §9 you took.

Minimum viable set for story 84:

- On start: `{ItemId, PlaySessionId, MediaSourceId, PositionTicks, PlayMethod, CanSeek: true, IsPaused: false, AudioStreamIndex, SubtitleStreamIndex}`.
- On tick / pause / seek: the same shape with updated `PositionTicks` and `IsPaused`.
- On end: `{ItemId, PlaySessionId, MediaSourceId, PositionTicks, Failed: false}`.

`PlaySessionId` comes from `PlaybackInfoResponse.PlaySessionId`. Carry it through all three calls — it is how the server ties a transcode job, a session and the resume point together. Ticks are **100 ns** units: `ticks = seconds * 10_000_000`.

*To verify in implementation:* the spec documents no required progress interval. The official clients report roughly every 10 s plus on every state change; `/Sessions/Playing/Ping` exists to keep a transcode alive without moving the position.

---

## 11. Sessions and remote control ("Play On")

### `GET /Sessions`

| Param | Type | Note |
| --- | --- | --- |
| **`controllableByUserId`** | GUID | Filters to sessions this user may control. |
| `deviceId` | string | |
| `activeWithinSeconds` | int | Drop stale sessions. |

Returns `SessionInfoDto[]`.

### `SessionInfoDto`

| Field | Type | Use for Play On |
| --- | --- | --- |
| **`Id`** | string | the `{sessionId}` in every control call |
| `DeviceName`, `DeviceType`, `DeviceId`, `Client`, `ApplicationVersion` | string | the label in the picker |
| `UserId`, `UserName` | | |
| **`SupportsRemoteControl`** | bool | **the flag to filter on** |
| **`SupportsMediaControl`** | bool | |
| **`PlayableMediaTypes`** | `MediaType[]` | must contain `Video` |
| **`SupportedCommands`** | `GeneralCommandType[]` | which `/Command/{command}` calls will land |
| `Capabilities` | `ClientCapabilitiesDto` | |
| `PlayState` | `PlayerStateInfo` | to mirror the remote player's state |
| `NowPlayingItem`, `NowViewingItem` | `BaseItemDto` | |
| `IsActive`, `LastActivityDate`, `LastPlaybackCheckIn`, `LastPausedDate` | | |
| `NowPlayingQueue`, `PlaylistItemId` | | |
| `TranscodingInfo` | `TranscodingInfo` | |
| `RemoteEndPoint`, `ServerId`, `UserPrimaryImageTag`, `HasCustomDeviceName`, `AdditionalUsers` | | |

### Which flag identifies a controllable session

From `MediaBrowser.Controller/Session/SessionInfo.cs` @ v12.2, **both** `SupportsRemoteControl` and `SupportsMediaControl` are computed getters with the *same* body:

```csharp
if (Capabilities is null || !Capabilities.SupportsMediaControl) return false;
foreach (var controller in SessionControllers)
    if (controller.SupportsMediaControl) return true;
return false;
```

So a session is controllable when **(a)** the client declared `ClientCapabilitiesDto.SupportsMediaControl = true` via `POST /Sessions/Capabilities/Full`, **and (b)** it has a live session controller — in practice an open WebSocket.

And from `Emby.Server.Implementations/Session/SessionManager.cs` @ v12.2, `GetSessions` does:

```csharp
if (!controllableUserToCheck.IsNullOrEmpty())
{
    result = result.Where(i => i.SupportsRemoteControl);
    …
}
```

**Therefore: `GET /Sessions?controllableByUserId=<my-user-id>&activeWithinSeconds=<n>` already returns only controllable sessions.** That is the query to use. Then additionally require `PlayableMediaTypes` to include `Video`, and exclude our own session by `DeviceId`.

Jellyflick must itself call `POST /Sessions/Capabilities/Full` with `SupportsMediaControl: true` (and keep a WebSocket open) if it wants *other* apps to be able to Play On *to* it. For story 109 (Jellyflick as the remote) that is not required.

Permission note: `UserPolicy.EnableRemoteControlOfOtherUsers` governs controlling other users' sessions; controlling your own needs nothing special.

### Control calls

| Action | Call |
| --- | --- |
| Start playback remotely | `POST /Sessions/{sessionId}/Playing?playCommand={PlayCommand}&itemIds={csv}&startPositionTicks=…&mediaSourceId=…&audioStreamIndex=…&subtitleStreamIndex=…&startIndex=…` |
| Transport control | `POST /Sessions/{sessionId}/Playing/{command}?seekPositionTicks=…&controllingUserId=…` |
| General command (no args) | `POST /Sessions/{sessionId}/Command/{command}` |
| General command (with args) | `POST /Sessions/{sessionId}/Command`, body `GeneralCommand` |
| Browse to an item | `POST /Sessions/{sessionId}/Viewing?itemType=…&itemId=…&itemName=…` |
| Show a message | `POST /Sessions/{sessionId}/Message` |

Everything on `/Sessions/{sessionId}/Playing` is a **query parameter** — `playCommand` and `itemIds` are both required; there is no body.

**`PlayCommand`** enum: `PlayNow, PlayNext, PlayLast, PlayInstantMix, PlayShuffle`.

**`PlaystateCommand`** enum (the `{command}` in `/Playing/{command}`): `Stop, Pause, Unpause, NextTrack, PreviousTrack, Seek, Rewind, FastForward, PlayPause`. `Seek` is the one that needs `seekPositionTicks`.

**`GeneralCommandType`** enum (the `{command}` in `/Command/{command}`, and `GeneralCommand.Name`): `MoveUp, MoveDown, MoveLeft, MoveRight, PageUp, PageDown, PreviousLetter, NextLetter, ToggleOsd, ToggleContextMenu, Select, Back, TakeScreenshot, SendKey, SendString, GoHome, GoToSettings, VolumeUp, VolumeDown, Mute, Unmute, ToggleMute, SetVolume, SetAudioStreamIndex, SetSubtitleStreamIndex, ToggleFullscreen, DisplayContent, GoToSearch, DisplayMessage, SetRepeatMode, ChannelUp, ChannelDown, Guide, ToggleStats, PlayMediaSource, PlayTrailers, SetShuffleQueue, PlayState, PlayNext, ToggleOsdMenu, Play, SetMaxStreamingBitrate, SetPlaybackOrder`.

`GeneralCommand` body = `{ Name: GeneralCommandType, ControllingUserId: string, Arguments: object }`. `SetVolume`, `SetAudioStreamIndex`, `SetSubtitleStreamIndex` and `SetMaxStreamingBitrate` need `Arguments` and therefore the body form. Check `SupportedCommands` before offering a control.

*To verify in implementation:* the exact `Arguments` key names for each `Set*` command are not in the OpenAPI spec (`Arguments` is an untyped `object`).

---

## 12. Media segments (intro / credits markers)

**Endpoint, exact:**

```
GET /MediaSegments/{itemId}?includeSegmentTypes={csv of MediaSegmentType}
```

Responses: `200 MediaSegmentDtoQueryResult`, `404 ProblemDetails`.

```
MediaSegmentDtoQueryResult { Items: MediaSegmentDto[], TotalRecordCount: int, StartIndex: int }

MediaSegmentDto {
  Id:         string   // GUID
  ItemId:     string   // GUID
  Type:       MediaSegmentType
  StartTicks: int64
  EndTicks:   int64
}
```

**`MediaSegmentType` enum — exact values and order:**

```
Unknown, Commercial, Preview, Recap, Outro, Intro
```

So for stories 87:

- **Skip Intro** → a segment with `Type === "Intro"`.
- **Skip Credits** → a segment with `Type === "Outro"`. **There is no `"Credits"` value** — `Outro` is the credits marker.
- `Recap` and `Preview` are also worth offering skips for on episodes (the "previously on" and "next time on" blocks).
- `Commercial` is a Live TV concern.

Ticks are 100 ns: `seconds = StartTicks / 10_000_000`.

Call it once per media source when **`MediaSourceInfo.HasSegments === true`** (from `PlaybackInfoResponse`) — that boolean exists precisely to avoid a pointless request. Treat `404` and an empty `Items` array as "no markers".

Segment data is produced by a server-side provider (the Media Segments API is plugin-fed, e.g. an intro-detection plugin). *To verify in implementation:* on a server with no segment provider installed, whether `HasSegments` is simply `false` and the endpoint returns an empty result or a 404 — handle both.

---

## 13. Trickplay (scrubbing thumbnails)

### How it is exposed on the item

`BaseItemDto.Trickplay`, gated by **`fields=Trickplay`** (`DtoService.cs:1449`). Its schema is a doubly-nested map:

```json
"Trickplay": {
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "additionalProperties": { "$ref": "#/components/schemas/TrickplayInfoDto" },
    "nullable": true
  }
}
```

In TypeScript terms:

```ts
Trickplay?: Record<string /* mediaSourceId */, Record<string /* tile width, as a string */, TrickplayInfoDto>> | null
```

So: **outer key = media source id, inner key = the thumbnail width** (the same number that goes in the URL path), value = the manifest.

```
TrickplayInfoDto {
  Width:          int   // width of one thumbnail
  Height:         int   // height of one thumbnail
  TileWidth:      int   // thumbnails per row in a tile image
  TileHeight:     int   // thumbnails per column in a tile image
  ThumbnailCount: int   // total non-black thumbnails
  Interval:       int   // milliseconds between thumbnails
  Bandwidth:      int   // peak bits per second
}
```

### Tile image URL form

```
GET /Videos/{itemId}/Trickplay/{width}/{index}.jpg?mediaSourceId={mediaSourceId}
```

`width` (path, int) is the inner key from `Trickplay`. `index` (path, int) is the **tile-image index**, not the thumbnail index. `mediaSourceId` is an optional query parameter.

There is also an HLS-style manifest, if you would rather not do the arithmetic:

```
GET /Videos/{itemId}/Trickplay/{width}/tiles.m3u8?mediaSourceId={mediaSourceId}
```
→ `application/x-mpegURL`.

### Arithmetic for story 90

Given a scrub position `t` seconds and a chosen `width` with its `TrickplayInfoDto`:

```
thumbsPerTile = TileWidth * TileHeight
thumbIndex    = floor(t * 1000 / Interval)            // clamp to ThumbnailCount - 1
tileIndex     = floor(thumbIndex / thumbsPerTile)
within        = thumbIndex % thumbsPerTile
col           = within % TileWidth
row           = floor(within / TileWidth)
// then background-position: -(col * Width)px -(row * Height)px on a Width x Height box
```

Pick the smallest available `width` that still looks sharp at the preview size; a server may have generated several (`TrickplayOptions` on the server decides). Absent or empty `Trickplay` → no previews, hide the feature.

---

## 14. Subtitle delivery

### Per-stream subtitle URL

Two routes exist:

```
GET /Videos/{routeItemId}/{routeMediaSourceId}/Subtitles/{routeIndex}/Stream.{routeFormat}
GET /Videos/{routeItemId}/{routeMediaSourceId}/Subtitles/{routeIndex}/{routeStartPositionTicks}/Stream.{routeFormat}
```

Query parameters on both: `itemId, mediaSourceId, index, format, endPositionTicks, copyTimestamps, addVttTimeMap, startPositionTicks`.

The duplicated query parameters are legacy aliases — `SubtitleController.cs` does `itemId ??= routeItemId; mediaSourceId ??= routeMediaSourceId; index ??= routeIndex; format ??= routeFormat;`, and the `format` query parameter is annotated **`[ParameterObsolete]`**. **Put everything in the path.**

**The canonical form the server itself generates**, from `MediaBrowser.Model/Dlna/StreamInfo.cs` @ v12.2 (<https://github.com/jellyfin/jellyfin/blob/v12.2/MediaBrowser.Model/Dlna/StreamInfo.cs#L1252>):

```csharp
info.Url = string.Format(
    "{0}/Videos/{1}/{2}/Subtitles/{3}/{4}/Stream.{5}",
    baseUrl, ItemId, MediaSourceId, stream.Index, startPositionTicks, subtitleProfile.Format);
// then, when !IsExternalUrl && accessToken is present, "?ApiKey=" + accessToken is appended
```

i.e.

```
{serverUrl}/Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/{startPositionTicks}/Stream.{format}?ApiKey={token}
```

Use `0` for `startPositionTicks` for a whole-file fetch. The same source shows the one case where the URL is *not* ours: when the stream is external, `SupportsExternalStream`, `stream.Codec` already equals the requested format, and `stream.Path` is an absolute http(s) URI — then `info.Url = stream.Path` and `IsExternalUrl = true`. So **prefer `MediaStream.DeliveryUrl` when the server populated it**, and fall back to building the URL yourself.

### Requesting a specific format

The format is the **file extension in the path**: `Stream.vtt`, `Stream.srt`, `Stream.ass`, `Stream.ssa`, `Stream.sub`, `Stream.json`. The server converts on the fly via its subtitle encoder and sets the response `Content-Type` from `MimeTypes.GetMimeType("file." + format)`.

Three behaviours worth knowing, all from `Jellyfin.Api/Controllers/SubtitleController.cs` @ v12.2:

1. `format === "js"` is rewritten to `"json"`.
2. **If the requested format is PGS or VobSub, no conversion happens.** The controller returns the raw file via `PhysicalFile(..., enableRangeProcessing: true)`, with the comment: graphical subtitles "cannot be parsed or rewritten, so they are always delivered as the raw stream for the client to render", served from disk so range requests keep working.
3. `?addVttTimeMap=true` with `format=vtt` injects `X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000` after the `WEBVTT` header — needed when the VTT is consumed alongside an HLS transcode, not for direct play.

For stories 96–104 (Subtitle Offset): fetch **`Stream.vtt`** (or `Stream.ass` when we can render ASS), parse it in the app, and apply the offset at render time. Never ask the server to shift — there is no offset parameter. `startPositionTicks`/`endPositionTicks` window the output, which is not the same thing.

### `SubtitleDeliveryMethod` — exact enum and meaning

```
Encode, Embed, External, Hls, Drop
```

| Value | Meaning | Jellyflick |
| --- | --- | --- |
| **`External`** | Delivered as a separate file the client fetches and renders. | **What we want.** Only this is shiftable. |
| **`Embed`** | Muxed into the delivered stream as a soft track. | Shiftable only if the browser exposes it; generally not. |
| **`Encode`** | **Burned into the video** by the transcoder. | Not shiftable. Story 105's future-TV path for image subs. |
| **`Hls`** | Delivered as a subtitle rendition inside the HLS manifest. | `TranscodingProfile.EnableSubtitlesInManifest` controls this. |
| `Drop` | Discarded. | |

It appears in two places: `SubtitleProfile.Method` (what *we declare we can handle* in our `DeviceProfile`) and `MediaStream.DeliveryMethod` (what the *server decided* for this playback). To force shiftable subtitles, declare `SubtitleProfiles` with `Method: "External"` for `vtt`/`srt`/`ass`/`ssa` and let image formats fall through.

### How PGS / VobSub appear in `MediaStreams`

`MediaStream.Codec` is the ffprobe codec name. Classification, from `MediaBrowser.Model/Entities/MediaStream.cs` @ v12.2 — these are the *exact* predicates the server uses, so mirror them:

```csharp
IsPgsFormat(codec)    => codec.Contains("pgs",    OrdinalIgnoreCase)
                      || codec == "sup"   (OrdinalIgnoreCase)

IsVobSubFormat(codec) => codec.Contains("dvdsub", OrdinalIgnoreCase)
                      || codec.Contains("vobsub", OrdinalIgnoreCase)

IsTextFormat(codec)   => codec.Contains("microdvd", OrdinalIgnoreCase)
                      || ( !codec.Contains("pgs")
                        && !codec.Contains("dvdsub")
                        && !codec.Contains("vobsub")
                        && !codec.Contains("dvbsub")
                        && codec != "sup"
                        && codec != "sub" )          // all OrdinalIgnoreCase
```

So in practice:

| Kind | `Codec` values seen | Notes |
| --- | --- | --- |
| **PGS** (Blu-ray) | `pgssub`, `hdmv_pgs_subtitle`, `sup` | image-based |
| **VobSub** (DVD) | `dvdsub`, `dvd_subtitle`, `vobsub` | image-based |
| **DVB** | `dvbsub`, `dvb_subtitle` | image-based (text-check excludes it) |
| Text | `subrip`, `srt`, `ass`, `ssa`, `mov_text`, `webvtt`, `microdvd` | |

Note the two traps the server's own code encodes: **`microdvd` is text despite its `.sub` extension**, and a bare **`sub`** codec is treated as image-based. Prefer the ready-made booleans on the DTO where available — `MediaStream.IsTextSubtitleStream` is serialised (`IsPgsSubtitleStream`, `IsVobSubSubtitleStream` and `IsExtractableSubtitleStream` are `[JsonIgnore]` and are **not** on the wire, so the predicates above must be reimplemented client-side for the image cases).

Other useful `MediaStream` fields for the subtitle/audio menus (stories 74, 85, 103–105): `Index`, `Type` (`MediaStreamType`), `Codec`, `Language`, `DisplayTitle`, `Title`, `IsDefault`, `IsForced`, `IsHearingImpaired`, `IsExternal`, `IsTextSubtitleStream`, `SupportsExternalStream`, `DeliveryMethod`, `DeliveryUrl`, `IsExternalUrl`, `Path`, plus the localised label helpers `LocalizedDefault`, `LocalizedForced`, `LocalizedExternal`, `LocalizedHearingImpaired`, `LocalizedUndefined`, `LocalizedOriginal`, `LocalizedLanguage`.

There is also `GET /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/subtitles.m3u8` (HLS subtitle playlist) and `GET /Videos/{videoId}/{mediaSourceId}/Attachments/{index}` (embedded fonts for ASS).

---

## 15. Download, and the policy flag that gates it

### Endpoint

```
GET /Items/{itemId}/Download
```

Only parameter is `itemId` (path). Response `200 video/*` binary, `404 ProblemDetails`. There is also `GET /Items/{itemId}/File` (raw file, admin-ish).

### The gate

From `Jellyfin.Api/Controllers/LibraryController.cs` @ v12.2:

```csharp
[HttpGet("Items/{itemId}/Download")]
[Authorize(Policy = Policies.Download)]
```

and from `Jellyfin.Server/Extensions/ApiServiceCollectionExtensions.cs` @ v12.2:

```csharp
options.AddPolicy(Policies.Download, new UserPermissionRequirement(PermissionKind.EnableContentDownloading));
```

**So `Policies.Download` maps exactly to `PermissionKind.EnableContentDownloading`.**

### Where to read it from

Two places, both usable:

1. **`UserDto.Policy.EnableContentDownloading`** (boolean) — from **`GET /Users/Me`** (or `GET /Users/{userId}`, or the `User` on `AuthenticationResult`). This is the per-user flag and the right thing to check once at sign-in to decide whether the Download File button exists at all (stories 76, 77).
2. **`BaseItemDto.CanDownload`** (boolean, nullable) — requires **`fields=CanDownload`**. Per-item, and accounts for the item actually being downloadable (not a placeholder, has a real file), not just the user's permission.

Use both: `Policy.EnableContentDownloading` to decide whether the feature exists for this user, `CanDownload` to decide whether to show it on *this* title.

This endpoint **does** require authentication (unlike `/Videos/{id}/stream`), and a plain `<a href>` or `<a download>` cannot set a header — so the download link must carry **`?ApiKey={accessToken}`**.

```
{serverUrl}/Items/{itemId}/Download?ApiKey={accessToken}
```

*To verify in implementation:* whether the response sets `Content-Disposition` with the original filename (the spec says only `video/*` binary). If not, set the `download` attribute on the anchor with a filename derived from the item.
