# Testing Plan

## Setup

1. Build the extension with `npm run build`
2. Load `dist/` via `chrome://extensions`
3. Open at least one ChatGPT tab and one non-ChatGPT tab
4. Make sure Windows desktop notifications are enabled for Chrome

## Functional tests

### Enable / disable

- Turn the extension off in the popup
- Submit a prompt in ChatGPT
- Switch to another tab
- Expected: no notification

- Re-enable the extension
- Submit another prompt
- Switch away again
- Expected: notification returns

### Notification-only mode

- Set mode to `desktop notification only`
- Submit a prompt and switch away
- Expected: desktop notification appears, no sound plays

### Notification + sound mode

- Set mode to `desktop notification + sound`
- Submit a prompt and switch away
- Expected: desktop notification appears and bundled sound plays

### Custom sound upload

- Open the options page
- Upload a short custom audio file under 1 MB
- Click Test sound
- Expected: the uploaded sound plays

- Click Use bundled sound
- Click Test sound again
- Expected: the extension falls back to the built-in sound

### Quiet hours

- Enable quiet hours and set a range that includes the current time
- Use both Test notification and Test sound
- Expected: tests are blocked

- Move quiet hours outside the current time
- Run both tests again
- Expected: tests work

### Notification click behavior

- Let a ChatGPT completion notification appear
- Click it
- Expected: the existing ChatGPT tab becomes active and its window is focused or restored

- Close all ChatGPT tabs
- Trigger a fresh notification after reopening a monitored page
- Expected: if the original tab is gone, ChatGPT opens in a new tab

### Active-tab suppression

- Stay on the ChatGPT tab in the focused window while a response completes
- Expected: no notification

### Background/minimized behavior

- Start a response, then switch to another tab
- Expected: notification on completion

- Start a response, then minimize Chrome
- Expected: notification on completion

### Multiple ChatGPT tabs

- Open two ChatGPT tabs in one or more windows
- Start responses in both
- Keep only one visible
- Expected: only backgrounded completions notify

### Settings persistence

- Change several settings
- Restart Chrome
- Expected: settings remain intact

### Debug logs

- Enable debug logging in the options page
- Trigger a test notification and a real ChatGPT completion
- Refresh logs
- Expected: recent entries show observer transitions, notification decisions, and test actions

- Click Copy logs
- Expected: the visible log text is copied to the clipboard

- Click Clear logs
- Expected: the log viewer becomes empty

## Reliability tests

### Short response

- Ask for a one-line answer
- Switch away quickly
- Expected: one notification, not zero or multiple

### Long response

- Ask for a long structured answer
- Switch away
- Expected: no early notification while text is still streaming

### Regenerate response

- Use regenerate on an existing assistant answer
- Expected: treated as a new cycle only when generation genuinely restarts

### Manual stop

- Start a long answer
- Click Stop manually
- Expected: no success notification

### Error / interruption

- Force a transient network problem if practical, or use a scenario that surfaces ChatGPT error UI
- Expected: no success notification

### Refresh during generation

- Refresh the page while ChatGPT is generating
- Expected: current cycle is lost; no stale success notification from the old cycle

### DOM flicker / transient Stop disappearance

- Watch for brief UI changes during long responses
- Expected: no notification unless the page remains stable through the debounce window

### Repeated responses in one chat

- Send several prompts in the same conversation
- Expected: at most one notification per genuine completion

### Multiple windows

- Keep ChatGPT in one Chrome window and work in another
- Expected: completion notifies when the ChatGPT window is unfocused/backgrounded

## Regression tests

### Selector drift

- If ChatGPT layout changes, validate `src/content/dom-selectors.ts`
- Re-run short, long, regenerate, and manual-stop tests

### Duplicate protection

- Rebuild and reload the unpacked extension
- Trigger several completions in a row
- Expected: no duplicate notifications for the same cycle

### Stale state cleanup

- Close ChatGPT tabs, duplicate tabs, and reload pages
- Expected: no stale session causes a later false notification

### Settings changes mid-response

- Change notification mode or quiet hours while ChatGPT is still generating
- Expected: the completion uses the latest saved settings at notification time
