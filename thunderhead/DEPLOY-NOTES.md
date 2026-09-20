# Thunderhead on the website — what this folder is

Built 2026-09-20. A static, self-contained copy of the Thunderhead pinball table
that runs in a browser with no server and nothing to install. Drop the whole
`thunderhead/` folder into the artabaninteractive.github.io repo beside
`privacy-policy/` and it is live at `/thunderhead/`.

Source of truth stays `C:\AIProjects\VPX\greybox` (tag `phone-lock-2026-09-13`).
This is a BUILD of it, not a fork — if the game changes there, rebuild here
rather than editing these files.

## What was copied

| from greybox | to here | why |
|---|---|---|
| `game.html` | `index.html` | the engine |
| `render25.js` | same | the 2.5D renderer |
| `geometry-S.json` | same | Table S is the live Thunderhead |
| `pick-17-assembled.png` | `pick-17-assembled.webp` | 9.0 MB → 777 KB, same 1429×2965 |
| `card3-hairline.png`, `thead-cap.png` | same | apron plate, bumper cap |
| `music/*.ogg` (4) | same | 8.9 MB |
| `sfx-out/*.ogg` (41) | same | 1.6 MB |

**Total 13 MB**, of which 10.5 MB is audio. Well inside GitHub Pages' limits
(1 GB per site, 100 MB per file, 100 GB/month soft bandwidth).

## Four changes made for the web build, and only these

1. **The finished view is the default.** In the greybox repo `VIEW25` defaults
   to FALSE, so the flat wireframe view leads — that is right for development
   and wrong for a visitor, who otherwise sees z-labels, the sacred circle and
   every rail outline. Now `?view=greybox` opts back into it.
2. **Table S by default.** `TID` defaulted to `'A'`, which 404s here because
   only Table S ships. `?t=` still works if other geometry is ever added.
3. **The fps/fx readout is hidden** unless `?fps=1` — useful for diagnosing a
   slow phone, not something a visitor should see.
4. **Title and help text.** The page title is `THUNDERHEAD — Artaban
   Interactive` and `geometry-S.json`'s `title`/`help` say THUNDERHEAD rather
   than `TABLE S — THE VORTEX`.

## Verified

Served statically (no node, no serve.mjs) and loaded in a browser at desktop
and at 375×812: every asset 200s, no console errors, the table renders, a ball
is served, 3 balls, the score bar / apron / flipper buttons / plunge prompt all
draw, and the art loads at full 1429 width from the WebP. Measured 60–68 fps in
the pane.

## Known, and worth deciding before or after launch

- **Debug keys are still live.** X toggles effects, V toggles the greybox view,
  and there are others. Harmless, but anyone who finds them can make the page
  look broken. Stripping them is on the greybox to-do list already.
- **Caching on updates.** `index.html` picks up changes quickly but
  `render25.js` and `geometry-S.json` are cached by the browser under the same
  names. If the game is updated later, add a version query
  (`render25.js?v=2`) or visitors keep the old one.
- **No leaderboard.** The Artaban board server (Cloudflare Worker + D1) already
  does replay-verified scores; pinball scores would need their own verification
  approach, since a pinball run is far more input than a few throws.
- **Audio needs a tap.** Browsers block sound until the visitor interacts, which
  the game already handles — the first touch starts it.
