# ChatGPT Done Notifier

ChatGPT Done Notifier is a Chrome Manifest V3 extension for Windows-focused personal use that watches open ChatGPT tabs and sends a desktop notification when ChatGPT finishes generating a response.

## Purpose

The extension is built for one job: tell you when ChatGPT is actually done, without relying on the official API and without notifying while you are already looking at the ChatGPT tab in a focused window.

## Features

- ChatGPT-only scope for `chatgpt.com` and `chat.openai.com`
- Conservative DOM-based completion detection with a per-tab state machine
- Desktop notification modes:
  - desktop notification only
  - desktop notification + bundled sound
- Optional custom notification sound upload from the options page
- Quiet hours with start and end times
- Popup UI for quick controls and tests
- Options page for full settings
- Optional debug logging with in-extension log viewer, copy, and clear actions
- Notification click restores and focuses the existing ChatGPT tab, or opens ChatGPT if no tab exists
- Settings persistence across browser restarts
- Runtime duplicate protection per generation cycle

## What completion means in this extension

In this extension, "completion" means:

1. A real generation cycle was observed first.
2. The ChatGPT Stop button was seen during that same cycle.
3. Assistant-side activity was seen during that same cycle.
4. The Stop button then disappeared.
5. The page stayed stable for a short debounce window without more streaming activity.
6. No obvious error UI or recent manual stop was detected.

The Stop button disappearing is the primary completion signal, but it is never used alone as an instant notify trigger.

## High-level detection design

The content script uses `MutationObserver` as the main observation mechanism and keeps ChatGPT-specific selectors inside `src/content/dom-selectors.ts`.

Each matched ChatGPT tab gets a local state machine with states equivalent to:

- `idle`
- `generation_detected`
- `actively_generating`
- `generation_completed`
- `user_stopped`
- `error_state`
- `notification_sent` (tracked by background runtime coordination)

False-positive prevention includes:

- generation must actually begin before completion is considered valid
- the Stop button must be observed in the same cycle
- assistant activity must be observed in the same cycle
- completion is delayed by a stabilization window
- active-cycle polling is used only as a small fallback while a response is in progress
- manual stop does not count as successful completion
- obvious error UI suppresses success notifications
- initial page load and simple rerenders are ignored unless a real cycle is observed

## Important limitation

The extension can observe ChatGPT only while a ChatGPT page remains open in the browser.

If the ChatGPT tab is fully closed, the extension cannot continue monitoring that page's DOM.

Because of that, "closed window" in practice must be interpreted as:

- the browser window is unfocused
- the browser window is minimized
- the ChatGPT tab is in the background

It does **not** mean the ChatGPT page can still be monitored after the tab or page no longer exists.

## Known DOM-detection limitations

- Detection depends on ChatGPT's live DOM and may require selector updates if the UI changes.
- The extension intentionally prefers false negatives over noisy false positives.
- If a page is refreshed or closed mid-generation, the current observed cycle is lost.
- Extremely unusual UI experiments on ChatGPT may temporarily break Stop-button or assistant-turn heuristics.

## Project structure

```text
manifest.json
package.json
tsconfig.json
scripts/build.mjs
src/
  background/
  content/
  shared/
  popup/
  options/
  offscreen/
  assets/
README.md
TESTING.md
```

## Permissions

The extension keeps permissions narrow:

- `storage`: persist settings and lightweight session state
- `notifications`: create desktop notifications
- `offscreen`: play a bundled sound from an offscreen document in MV3
- host permissions only for:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`

No analytics, telemetry, backend calls, or account system are used.

## Sound handling

Manifest V3 service workers cannot directly play audio, so the extension uses an offscreen document (`src/offscreen/offscreen.html`) to play the bundled local WAV file.

That is why the `offscreen` permission is required.

If you upload your own sound in the options page, it is stored locally in `chrome.storage.local` as extension data and played through the same offscreen audio path. No sound files are uploaded anywhere.

## Settings

Available settings:

- master enable / disable
- notification mode:
  - desktop notification only
  - desktop notification + sound
- suppress notifications while actively viewing ChatGPT
- quiet hours enabled
- quiet hours start and end
- custom sound upload
- revert to bundled default sound
- debug logging toggle
- refresh / copy / clear logs from the options page
- test notification
- test sound
- reset to defaults

## Debug logs

The options page includes a debug logging toggle and a built-in log viewer.

When enabled, the extension records useful troubleshooting events such as:

- observer state changes
- notification sent or suppressed decisions
- quiet-hours blocks
- sound playback requests and failures
- notification clicks

Logs are stored locally in the browser only. They are not uploaded anywhere.

## Local setup

1. Install Node.js if it is not already available.
2. Install dependencies:

```bash
npm install
```

3. Build the extension:

```bash
npm run build
```

The build output is written to `dist/`.

## Load unpacked in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder from this project
5. Open a ChatGPT tab and keep it open while testing

## Troubleshooting

- No notification arrives:
  - confirm the extension is enabled
  - confirm Chrome notifications are allowed in Windows
  - confirm the ChatGPT tab stayed open
  - confirm quiet hours are not blocking alerts
  - confirm you are not actively viewing the ChatGPT tab in a focused window
- Notification appears but no sound plays:
  - confirm mode is set to `desktop notification + sound`
  - use the options page test sound button
  - confirm system audio is not muted
  - if using a custom file, try switching back to the bundled sound to confirm the file format is supported by Chrome audio playback
- Notifications duplicated:
  - reload the unpacked extension after rebuilding
  - verify ChatGPT DOM changes have not broken cycle detection

## Updating selectors if ChatGPT changes

Keep ChatGPT-specific DOM changes isolated to `src/content/dom-selectors.ts`.

If ChatGPT changes its UI:

1. Re-check the Stop button accessible labels, attributes, and nearby structure
2. Re-check the assistant message container selectors
3. Re-check obvious error UI markers
4. Rebuild and rerun the scenarios in `TESTING.md`

## Publication-readiness notes

- The extension already uses MV3, narrow host permissions, local assets, and persistent settings.
- Custom uploaded audio is stored only locally for personal use; before store publication, re-check the final UX copy and any desired limits around supported file types or size.
- Before Chrome Web Store submission, add final production icons, validate all copy, and retest selectors against the current ChatGPT UI.
- If desired later, the custom build step can be replaced with a stricter production bundler, but the current implementation intentionally keeps dependencies minimal.
