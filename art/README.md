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

`manifest.json` records each original path, runtime path, source path, and SHA-256 hashes at the time of organization. These hashes document the move; refresh them when intentionally changing artwork. No images were resized, recompressed, or deduplicated during organization. The previously unconverted `errorwindows.jfif` also has an Aseprite source.

`_redirects` at the repository root preserves the original image URLs using Cloudflare static asset rewrites. Keep these aliases while existing saved outfits, user pictures, or external links may use them. New code should reference `assets/` paths. A server used for local previews must support these rewrites to display outfits containing old saved paths.

`.assetsignore` excludes `art/` and Aseprite source files from site uploads. Deploy runtime assets together with the path-reference refactor and `_redirects`. Browser scripts and styles live in `client/`, and Worker code lives in `server/`. HTML entry pages retain their locations, including the older `avatar/avatar-studio.html` page; its scripts and styles live in `client/legacy/avatar/`.
