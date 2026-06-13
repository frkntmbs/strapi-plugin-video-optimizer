# @frkntmbs/strapi-plugin-video-optimizer

Per-video optimization controls for the Strapi 5 Media Library upload flow. Upload UX mirrors [`strapi-plugin-image-optimizer`](https://github.com/frkntmbs/strapi-plugin-image-optimizer); image processing is replaced with async FFmpeg-based video encoding.

## Features

- **Upload modal integration** — sparkle button on each pending video asset
- **Three optimization modes** — Keep original | Apply global settings | Custom
- **Global settings page** — Settings → Global → Video Optimizer
- **Async processing** — uploads return immediately; FFmpeg runs in background
- **Concurrency limit** — configurable `maxConcurrentJobs` (1–4, default 1)
- **Media Library progress** — queued/processing/failed status with progress bar
- **i18n** — English and Turkish
- **RBAC** — `plugin::video-optimizer.settings.read` / `.update`

## Requirements

- Strapi 5.x
- Node.js 20+

FFmpeg is bundled via `ffmpeg-static`. If unavailable, the plugin falls back to a system `ffmpeg` binary on `PATH`.

## Installation

```bash
npm install @frkntmbs/strapi-plugin-video-optimizer
```

Enable in `config/plugins.ts`:

```ts
export default {
  'video-optimizer': {
    enabled: true,
  },
};
```

Rebuild the admin panel:

```bash
npm run build
```

## Global settings

| Field | Default | Description |
|-------|---------|-------------|
| `defaultChoice` | `original` | Default upload dialog choice |
| `defaultFormat` | `mp4` | Output format (`mp4` / `webm`) |
| `videoCodec` | `h264` | Codec (`h264` / `vp9`) |
| `crf` | `23` | Quality (0–51, lower = better) |
| `preset` | `medium` | x264 encode speed preset |
| `maxWidth` | `1920` | Max output width |
| `maxHeight` | `1080` | Max output height |
| `audioMode` | `compress` | `keep` / `remove` / `compress` |
| `audioBitrate` | `128k` | Audio bitrate when compressing |
| `maxConcurrentJobs` | `1` | Max parallel FFmpeg jobs |

## Upload flow

1. User selects optimization mode per video in the upload modal
2. Preferences are sent as `videoOptimizerPreferences` (same pattern as the image plugin)
3. Original file is stored in the Media Library immediately
4. If optimization is requested, a background job is queued
5. FFmpeg encodes the video; the file record is updated on success
6. On failure, the original file is kept and the job status shows the error

## Permissions

Grant in **Settings → Administration Panel → Roles**:

- **Read Video Optimizer settings** — view global settings
- **Update Video Optimizer settings** — edit global settings

## Development

```bash
git clone https://github.com/frkntmbs/strapi-plugin-video-optimizer.git
cd strapi-plugin-video-optimizer
npm install
npm run build
npm run verify
```

Link into a Strapi project:

```bash
npm run watch:link
```

## License

MIT
