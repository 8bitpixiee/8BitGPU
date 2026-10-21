# Arcade Lounge emotes update

Keep the folder structure when copying or deploying this project. Browser scripts and styles live in `client/`, grouped by feature. The Worker entrypoint is `server/worker.js`, with chat, social, and store modules alongside it. HTML entry pages keep their existing URLs.

Included files:

- `arcade.html`
- `client/arcade/arcade.js`
- `client/arcade/arcade-mobile.css`
- `server/chat/chat.js`

This update adds directional facing state, an in-place Spin, Twerk, Drink, Shroom, Crashout, and persistent Fly controls, plus fallback visual and screen effects while final sprite art is in production.

Art is organized under `assets/` (runtime images) and `art/source/` (editable Aseprite files). See [the art workflow](art/README.md) for the folder structure, source/export mapping, and legacy image URL compatibility.

`client/shared/` contains the common window theme and styles. Other client folders cover the desktop, authentication, avatar editor, arcade, chat, social, profiles, store, and media player. Older copies are preserved under `client/legacy/` and `server/legacy/`. The older avatar HTML page remains at `avatar/avatar-studio.html`.

`wrangler.jsonc` points to the server entrypoint, and `.assetsignore` excludes server code and editable artwork from static uploads. `_redirects` preserves previous image, script, and stylesheet URLs for saved data and cached pages. No build step was added.
