# MyPixel mobile and lounge update

Verified locally on 2026-09-19.

This is an UPDATE PACKAGE for the existing 8BitGPU site, not a standalone site.
Extract its contents over the existing project, preserving all existing avatar,
map, image, stylesheet, and account files. Deploy the complete project through
the existing Cloudflare Worker workflow, including src/worker.js and src/chat.js.
Preserve the existing D1 binding and account configuration.

Included:
- Mobile app scrolling and portrait/landscape window fitting.
- MyPixel naming and profile UI.
- Shared Dance, Smoke, LOL, Spin, and Wave lounge emotes.
- Portrait lounge scrolling and landscape room/chat layout.

Validation passed:
- node --test tests/chat.test.mjs (5 tests)
- node tests/mobile-desktop-browser.mjs
- node tests/arcade-browser.mjs
- node tests/profile-browser.mjs

These checks used the local test server. This package has not been deployed
or verified on the live website. See LOUNGE-EMOTES.md for custom sprite art needs.
