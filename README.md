# Strapi Plugin Video Optimizer

Per-video optimization controls for the Strapi 5 Media Library upload flow, with async FFmpeg encoding.

[![npm](https://img.shields.io/npm/v/@frkntmbs/strapi-plugin-video-optimizer)](https://www.npmjs.com/package/@frkntmbs/strapi-plugin-video-optimizer)
[![Strapi](https://img.shields.io/badge/Strapi-5.x-4945FF)](https://strapi.io)
[![Node](https://img.shields.io/badge/Node-20--24-339933)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[GitHub](https://github.com/frkntmbs/strapi-plugin-video-optimizer) · [Issues](https://github.com/frkntmbs/strapi-plugin-video-optimizer/issues) · [npm](https://www.npmjs.com/package/@frkntmbs/strapi-plugin-video-optimizer)

---

## Overview

Strapi's Media Library uploads videos as-is unless you add custom server logic. There is no built-in way to choose different encoding settings per file at upload time, and video transcoding can block the upload request on small servers.

**Video Optimizer** adds a sparkle button to each pending upload card and to existing videos in the Media Library. Before or after upload, you can choose to keep the file unchanged, apply your global profile, or configure format, quality, audio, and output dimensions for that specific video.

Encoding runs **asynchronously in the background** — the original file appears in the Media Library immediately, and FFmpeg replaces it when the job completes.

Upload UX mirrors [`strapi-plugin-image-optimizer`](https://github.com/frkntmbs/strapi-plugin-image-optimizer); image processing is replaced with FFmpeg-based video encoding.

## Screenshots

### Media Library upload

Each pending video shows the current optimization choice and a sparkle button to open per-file settings.

![Media Library upload modal with optimization controls](docs/screenshots/upload-modal.png)

### Optimization choice

Pick **Keep original**, **Apply global settings**, or **Custom** for the selected video.

![Video optimization choice dialog](docs/screenshots/optimization-choice.png)

### Custom per-file settings

In **Custom** mode, configure output format, CRF, encode preset, audio handling, and output dimensions. Width and height default to the original video size; changing one value updates the other to preserve aspect ratio.

![Custom video optimization settings](docs/screenshots/custom-settings.png)

### Media Library progress

After upload, active jobs show a progress bar on each card — **In queue** with a spinner, then **Encoding video** with a percentage.

![Media Library cards with optimization progress](docs/screenshots/media-library-progress.png)

![Single video encoding progress](docs/screenshots/media-library-encoding.png)

### Media Library card actions

Hover an existing video to **re-optimize** (sparkle) or **cancel** an active encode job (stop).

![Media Library card hover actions](docs/screenshots/media-library-actions.png)

### Global settings

Configure default upload choice, the global optimization profile, and server concurrency limits under **Settings → Global → Video Optimizer**.

![Video Optimizer global settings page](docs/screenshots/global-settings.png)

## Features

- **Three upload modes** — Keep original, Apply global settings, or Custom per file
- **Two output formats** — MP4 (H.264) and WebM (VP9)
- **Custom encode controls** — CRF, x264 preset, audio keep / remove / compress, audio bitrate
- **Custom resize** — Set output width and height with automatic aspect-ratio preservation (defaults to source dimensions)
- **Global settings page** — Configure defaults under **Settings → Global → Video Optimizer**
- **Async job queue** — Upload returns immediately; FFmpeg runs in the background
- **Concurrency limits** — `maxConcurrentJobs` and `maxFfmpegThreads` for weak VPS servers
- **Media Library progress** — Queued / processing / failed status with progress bar on each card
- **Re-optimize & cancel** — Sparkle and stop buttons on existing Media Library video cards
- **Admin i18n** — English and Turkish translations included
- **Role-based access** — Separate permissions for reading and updating global settings

## How it works

```mermaid
flowchart LR
  uploadModal[UploadModal] --> sparkleBtn[SparkleButton]
  sparkleBtn --> choicePanel[ChoicePanel]
  choicePanel --> fetchPatch[FetchPatch]
  fetchPatch --> videoOptimizerPrefs[videoOptimizerPreferences]
  videoOptimizerPrefs --> uploadStore[MediaLibraryUpload]
  uploadStore --> jobQueue[BackgroundJobQueue]
  jobQueue --> ffmpegEncode[FFmpegEncode]
  ffmpegEncode --> mediaLibrary[MediaLibrary]
```

1. You pick optimization settings in the upload dialog (or re-open settings from the Media Library).
2. Preferences are sent alongside the file in a dedicated `videoOptimizerPreferences` field (Strapi's `fileInfo` validation only allows a fixed set of keys).
3. The original file is stored in the Media Library immediately.
4. If optimization is requested, a background job is queued and FFmpeg encodes the video.
5. On success, the file record is updated in place. On failure, the original file is kept and the job status shows the error.

## Requirements

- [Strapi](https://strapi.io) **5.x**
- Node.js **20–24**
- `@strapi/plugin-upload` (included with Strapi)

FFmpeg is bundled via [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static). If unavailable, the plugin falls back to a system `ffmpeg` binary on `PATH`.

## Installation

```bash
npm install @frkntmbs/strapi-plugin-video-optimizer
```

Enable and configure the plugin in `config/plugins.ts`:

```ts
export default {
  'video-optimizer': {
    enabled: true,
    config: {
      defaultChoice: 'original',
      defaultFormat: 'mp4',
      videoCodec: 'h264',
      crf: 23,
      preset: 'medium',
      maxWidth: 1920,
      maxHeight: 1080,
      audioMode: 'compress',
      audioBitrate: '128k',
      maxConcurrentJobs: 1,
      maxFfmpegThreads: 2,
    },
  },
};
```

Rebuild the admin panel and restart Strapi:

```bash
npm run build
npm run develop
```

When installed from npm, no `resolve` path is required — Strapi loads the plugin from `node_modules` automatically.

## Configuration

All options can be set in `config/plugins.ts` (defaults) and overridden from the admin settings page (stored in the plugin store).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultChoice` | `'original'` \| `'global'` \| `'custom'` | `'original'` | Pre-selected option when opening the upload dialog for a new video |
| `defaultFormat` | `'mp4'` \| `'webm'` | `'mp4'` | Output container format for global / custom profiles |
| `videoCodec` | `'h264'` \| `'vp9'` | `'h264'` | Video codec (selected automatically from format) |
| `crf` | `0–51` | `23` | Constant Rate Factor — lower = better quality, larger file |
| `preset` | x264 preset | `'medium'` | Encode speed vs compression (H.264 only) |
| `maxWidth` | number | `1920` | Global profile: max output width (scale down if larger) |
| `maxHeight` | number | `1080` | Global profile: max output height (scale down if larger) |
| `audioMode` | `'keep'` \| `'remove'` \| `'compress'` | `'compress'` | Audio track handling |
| `audioBitrate` | string | `'128k'` | Audio bitrate when compressing |
| `maxConcurrentJobs` | `1–32` | `1` | Max parallel FFmpeg jobs on the server |
| `maxFfmpegThreads` | `1–8` | `2` | Max CPU threads per encode job (use `1–2` on weak VPS) |

### Server resource tuning

| Setting | Weak VPS suggestion | Notes |
|---------|---------------------|-------|
| `maxConcurrentJobs` | `1` | Only one video encodes at a time |
| `maxFfmpegThreads` | `1–2` | Limits CPU usage per encode; not exposed in Custom mode — always read from global settings |

Thread and concurrency limits apply to **all** encodes (global and custom). Custom mode only controls per-video encode parameters (format, quality, dimensions, audio).

## Usage

### Upload flow

1. Open **Media Library** → **Add new assets**
2. Select one or more videos
3. Hover a pending card and click the **sparkle** button (**Optimization settings**)
4. Choose a mode, adjust settings if needed, and click **Save**
5. Click **Upload** — each file uses the profile shown on its card footer
6. Watch progress on each card while FFmpeg encodes in the background

Global defaults can be changed anytime under **Settings → Global → Video Optimizer**.

### Upload modes

#### Keep original

No optimization is applied. The file is uploaded exactly as selected — same format, quality, and dimensions.

#### Apply global settings

Uses the global optimization profile from the settings page (format, CRF, preset, audio, max dimensions). Videos larger than the global width/height are scaled down while preserving aspect ratio.

#### Custom

Configure settings for a single video:

- **Output format** — MP4 (H.264) or WebM (VP9)
- **CRF & preset** — Quality and encode speed
- **Audio handling** — Keep, remove, or compress with a target bitrate
- **Output dimensions** — Defaults to the original video size; change width or height to resize (the other dimension updates to preserve aspect ratio)

### Re-optimize from Media Library

1. Open **Media Library**
2. Hover a video card
3. Click the **sparkle** button to open the optimization dialog
4. Choose a mode and save — a new background job is queued

### Cancel an active job

While a video is queued or encoding, hover the card and click the **stop** button to cancel the job. If the file was deleted during encoding, the job is cancelled automatically.

## Permissions

Global settings are protected by admin permissions:

| Action | Description |
|--------|-------------|
| `plugin::video-optimizer.settings.read` | View global Video Optimizer settings |
| `plugin::video-optimizer.settings.update` | Update global Video Optimizer settings |

Assign these in **Settings → Administration panel → Roles** for each admin role that should manage global defaults.

## Limitations

- **Video files only** — Non-video uploads are ignored
- **Async encoding** — The optimized file replaces the original after the job completes; very large files may take several minutes
- **Jobs on restart** — Active jobs are cleared when Strapi restarts; re-upload or re-optimize manually if needed
- **Custom thread limit** — Per-video thread count is not configurable; use global `maxFfmpegThreads`
- Strapi uploads each pending card in a separate request; preferences are matched to the correct file by name and card order

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/frkntmbs/strapi-plugin-video-optimizer.git
cd strapi-plugin-video-optimizer
npm install
```

Build and verify the package:

```bash
npm run build
npm run verify
```

### Link to a Strapi project

```bash
npm run watch:link
```

In your Strapi app:

```bash
npx yalc add --link @frkntmbs/strapi-plugin-video-optimizer && npm install
npm run develop
```

## License

[MIT](LICENSE)

## Author

[frkntmbs](https://github.com/frkntmbs)
