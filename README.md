# Reps

A simple workout tracker for iPhone. It tells you what to do today, logs a set in one tap, and shows what you beat after each session.

It is a web app you add to the Home Screen. All data stays on the phone.

## Install on iPhone

1. Open https://jugalm.com/reps/ in Safari.
2. Tap Share, then Add to Home Screen.
3. Open it from the Home Screen. It works offline after the first launch.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/reps/
npm test           # rules and offline file list
npm run test:e2e   # full run in WebKit and Chromium
```

`BASE=https://jugalm.com/reps/ npm run test:e2e` runs the same checks against the deployed copy.

There is no build step. Pushing `main` deploys through GitHub Pages.

See [DESIGN.md](DESIGN.md) for decisions and the suggestion rules.
