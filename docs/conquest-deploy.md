# Conquest - putting it on the iPad

Written 2026-09-07. Covers plan tasks 3.4, 3.5 and 3.6.

Everything here needs Nick's Cloudflare account and Nick's iPad, so these are
steps for a person, not for Claude. Tasks 3.1 to 3.3 are already built and
tested: the icon, the manifest and the service worker all work, and the game
has been played with the server switched off.

---

## What is already done

| Built | Where |
|---|---|
| The app icon, at four sizes | `public/icon-*.png`, `public/apple-touch-icon.png` |
| The manifest | Written at build time by `vite-plugin-pwa` |
| The service worker | `dist/sw.js`, written at build time |

The icon is drawn from the real map file by `tools/make-icons.mjs`, so it can
never drift away from the board. Run `npm run icons` after changing the map.

**Proven offline on 2026-09-07.** The built game was served, the server was
then stopped, and the page was reloaded. It opened, dealt a board, placed
armies and resolved an attack, with every request to the server refused.

---

## 1. Put the repository on GitHub

Cloudflare Pages builds from a Git repository, so it needs one it can read.

```bash
gh repo create Conquest --private --source . --remote origin --push
```

Or make an empty repository on github.com and then:

```bash
git remote add origin https://github.com/<your-name>/Conquest.git
```

```bash
git push -u origin main
```

Private is fine. Cloudflare can read a private repository once you grant it.

---

## 2. Make the Cloudflare Pages project

1. Open the Cloudflare dashboard, then **Workers & Pages**, then **Create**,
   then **Pages**, then **Connect to Git**.
2. Pick the Conquest repository.
3. Set the build settings:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | leave blank |

4. Press **Save and Deploy**.

**The Node version matters.** Cloudflare's default is older than Vite 8
accepts, and the build fails with a version error. The repository holds a
`.node-version` file saying `22.12.0`, which Cloudflare reads. If it is ever
ignored, add a build environment variable `NODE_VERSION` set to `22.12.0`.

The first build takes a couple of minutes. It ends with a URL like
`conquest-abc.pages.dev`. Open it and check the game runs.

---

## 3. Point conquest.datacrafter.net at it

1. In the Pages project, open **Custom domains**, then **Set up a custom
   domain**.
2. Enter `conquest.datacrafter.net`.
3. Cloudflare already runs DNS for `datacrafter.net`, so it offers to add the
   record itself. Accept.

The certificate takes a few minutes. **HTTPS is not optional here**: a service
worker only runs on a secure page. Without it the game still loads, but never
works offline. Cloudflare provides the certificate, so there is nothing to do
beyond waiting.

`localhost` is the one exception to that rule, which is why the offline test
worked on this machine with no certificate.

---

## 4. Add it to the iPad Home Screen

1. Open `https://conquest.datacrafter.net` in **Safari**. It must be Safari.
   Chrome on iPadOS cannot add a Home Screen app.
2. Press the Share button.
3. Choose **Add to Home Screen**.
4. The name will already read Conquest. Press **Add**.

The icon appears on the Home Screen. Opening it runs the game full screen,
with no address bar and no browser buttons.

---

## 5. Check it really works with no internet

This is plan task 3.6, and it is the one that decides whether phase 3 is done.

1. Open Conquest from the Home Screen once, with Wi-Fi on. This lets the
   service worker store the game.
2. Turn on **Aeroplane Mode**.
3. Close Conquest completely. Swipe up and flick the app away.
4. Open it again from the Home Screen.

It should start, deal a board, and play a whole game. If it does, phase 3 is
finished.

---

## Getting a new version onto the iPad

The service worker is set to **wait**, not to update on its own. See the
comment in `vite.config.ts`.

That is deliberate. An automatic update reloads the page the moment a new
version arrives, and a game part way through lives only in memory. Saving a
game is still on the "left out on purpose" list, spec section 14. So an
automatic update would throw away a game somebody was playing.

The cost is that a new version does not appear at once. To take one:

1. Close Conquest completely. Swipe up and flick it away.
2. Open it again.

The new version is running. If it is stubborn, open the site in Safari, then
Settings, Safari, Advanced, Website Data, and remove
`conquest.datacrafter.net`. That clears the stored copy and the next visit
fetches everything fresh.

---

## If something goes wrong

**The build fails on Cloudflare with a Node error.** See the Node version note
in step 2.

**The game loads but never works offline.** Check the page is on `https`, and
check the service worker registered: in Safari on a Mac you can inspect the
iPad, but the quicker test is step 5 above.

**The Home Screen icon is a screenshot of the page rather than the icon.**
Safari did not find `apple-touch-icon.png`. Check it is in `dist` after a
build.

**An old version keeps coming back.** See "Getting a new version onto the
iPad" above.
