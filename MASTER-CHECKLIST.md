# 8BitGPU master checklist

Source: user screenshot Screenshot 2026-09-12 192115.png.
Updated: 2026-09-18. Completed items below refer to local files, not live deployment.

## Completed locally and browser checked
- [x] Masc and Chunky Masc have independent buttons beside the other Being choices.
- [x] All catalog items are available to all Being types/builds; selections persist when switching.
- [x] Skin palette buttons show colors; coat choices show color previews.
- [x] Saved avatars still load after these changes.

## In progress / needs live verification
- [ ] Page lag: native cursor and reduced effects are in place; verify improvement on the live site.
- [ ] Link/app windows: drag fixes and reduced blur are implemented; review text readability and live performance.
- [ ] Cursor consistency across app windows: audit local pages and embedded content.
- [ ] Vines placement: existing placement changes need visual review with the user.

## Pending
- [ ] Media player: investigate lag.
- [ ] Remove AOL chat decoration/overlay from Twitch chat.
- [ ] Move AOL-style community chat into its own window for future game servers.

## Important: storefront with PayPal
Existing local foundation: storefront UI, cart, server checkout code, and setup notes. Product catalog is empty. Live checkout has not been verified.
- [ ] Commission offerings: logos, overlays, VTuber rigs, pixel art, digital art, 3D blended avatars, websites, and custom work.
- [ ] Merchandise: mouse pads, calendars, mugs.
- [ ] Digital products: training ebooks and courses.
- [ ] Personal training and meal-planning inquiries.
- [ ] Live pole classes.
- [ ] Stream audits and overhauls.
- [ ] Confirm product details, prices, inquiry destinations, and fulfillment.
- [ ] Configure PayPal and test sandbox ordering, payment capture, and order storage before enabling live checkout.

## Delivery
- [ ] Deploy local changes and verify the live website.

## 2026-09-18 account and private chat milestone
- [x] Separate Chat.exe entry in the desktop Start menu.
- [x] Private tester/owner account IDs and adult room acknowledgment.
- [x] Persistent chat, reports, blocking, owner mute/ban/delete controls.
- [x] Account.exe with sign-out and one-use recovery keys.
- [x] Local API and two-browser tests.
- [ ] Configure owner/tester IDs and validate on Cloudflare before enabling the private room.
- [ ] Future: scalable live connections, membership/payment entitlements, retention policy.

## Arcade Lounge upgrade
- [x] Owner-managed member access from Account.exe (friends remain ordinary users).
- [x] Existing arcade converted to shared avatar room with movement and speech bubbles.
- [x] Screenshot account ID configured as sole owner for the private room.
- [x] Central walking area, desktop/touch controls, and chat typing isolation.
- [ ] Deploy the release and run a private multi-device check on Cloudflare.

## MyPixel profiles
- [x] Public MySpace-inspired profile page opened from the desktop.
- [x] Account-backed mood, About Me, favorite things, saved color-slider palette, and desktop wall-image links.
- [x] Lounge Being click opens the matching public profile.
- [ ] Add connections, a guestbook, inventory badges, and journal posts after profile testing.

## Mobile and lounge emotes
- [x] Restore touch scrolling inside mobile app windows.
- [x] Support portrait scrolling and side-by-side landscape Lounge layout.
- [x] Add synchronized Dance, Smoke, LOL, Spin, and Wave emotes.
- [ ] Replace temporary CSS emotes with custom body-type sprite sheets.
