# MyPixel customization update

## Included
- Six independent colors: wall, page, panels, window titles, accents, and text.
- Each color has a full-spectrum picker and its own hue, saturation, and lightness sliders.
- Three picture windows and a separate wallpaper upload, available on desktop and mobile.
- Original stream artwork adapted with MyPixel labels for About Me, Favorites, Being, and pictures.

Choose Edit My Page to customize. PNG, JPEG, and WebP files up to 15 MB are resized in the browser to at most 1400 pixels and 512 KB. Uploaded images and removals save immediately; text and colors save with Save My Page. Closing the editor restores unsaved color changes.

Images are public with the profile. They persist in the existing D1 database in a new profile_images table, created automatically. No new bucket or service is required for this small profile-image feature. Animated image uploads are not supported. Each account has four slots, with at most 512 KB per slot before base64 encoding.

## Install
This is an update package, not a standalone site. Extract it over the existing complete 8BitGPU project. Deploy both the frontend files and src/worker.js with the existing Cloudflare Worker and D1 binding. Include profile-assets. Preserve all existing avatar, map, account, and lounge files.

This release has been verified locally; it has not been deployed to the live website.

## Verification
node --test tests/chat.test.mjs
node tests/profile-browser.mjs

Tests cover independent color edits, cancel restoring colors, uploads to all four slots, public viewing after reload, removal, account isolation, rejected oversized/unsupported uploads, and portrait/landscape widths.
