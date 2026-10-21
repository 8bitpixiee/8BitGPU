# Art workflow

Runtime images live in `assets/`. Editable Aseprite files live in `art/source/`, with the same folders and basenames. For example, `art/source/avatar/wings_v1.aseprite` corresponds to `assets/avatar/wings_v1.png`.

| Folder | Contents |
| --- | --- |
| `avatar/` | Character bodies, heads, hair, clothing, and accessories. Keep this folder flat because avatar catalogues construct filenames dynamically. |
| `avatar/legacy/` | Images formerly at the repository root. Kept separate from the avatar catalogue to preserve both originals, including files with matching names. |
| `backgrounds/` | Wallpapers and animated background art. |
| `decor/` | Vines and other decorative overlays. |
| `maps/arcade/` | Arcade room backgrounds. |
| `media/` | App artwork, promotional images, and animated media. |
| `profile/` | Profile window frames and overlays. |
| `ui/` | Cursor, taskbar, start-menu icons, and interface art. |
| `ui/user-pictures/` | Built-in desktop user pictures. |

Edit the source file, then export to its corresponding runtime path using the original format, dimensions, transparency, and animation timing. Preserve existing basenames and avatar variant numbering. Imported sources contain the available flattened artwork; they do not reconstruct original drawing layers.

Character animation sources are in `art/source/avatar/animated/`. Each of the 135 parts has 96 frames: eight frames per tag, in the order idle, walk, fly, dance, twerk, smoke, drink, shroom, laugh, spin, wave, crashout. Runtime sheets live in `assets/avatar/animations/`, with eight columns and twelve rows. Their cell dimensions match the original canvas (48×43 or 50×50). Original static artwork remains the studio/profile image and the lounge loading fallback.

These loops use a shared pixel deformation rig on the existing flattened artwork, with secondary wing/tail motion. They are stylized motions; they do not add new front/back views, hand-drawn limb poses, or held props. The lounge keeps its existing left/right mirroring and emote effects. All equipped parts share a clock so clothing and body movement stay synchronized; reduced-motion mode shows the first idle frame. The room camera includes animated canvas layers.

To refresh the manifest after changing a sheet, run `python art/tools/update-animation-manifest.py`. Manual Aseprite edits should retain the tag order, frame count, timing, canvas size, and sheet layout. The runtime's tag order and timing are in `client/arcade/avatar-animations.js`. Run `node art/tools/test-avatar-animations.cjs` to check playback, fallback, movement, emote expiration, and reduced-motion behavior without opening a browser.

`manifest.json` records each original path, runtime path, source path, and SHA-256 hashes at the time of organization. These hashes document the move; refresh them when intentionally changing artwork. No images were resized, recompressed, or deduplicated during organization. The previously unconverted `errorwindows.jfif` also has an Aseprite source.

`_redirects` at the repository root preserves the original image URLs using Cloudflare static asset rewrites. Keep these aliases while existing saved outfits, user pictures, or external links may use them. New code should reference `assets/` paths. A server used for local previews must support these rewrites to display outfits containing old saved paths.

`.assetsignore` excludes `art/` and Aseprite source files from site uploads. Deploy runtime assets together with the path-reference refactor and `_redirects`. Browser scripts and styles live in `client/`, and Worker code lives in `server/`. HTML entry pages retain their locations, including the older `avatar/avatar-studio.html` page; its scripts and styles live in `client/legacy/avatar/`.
