# 8BitGPU MyPixel Social + Window Replacement

This is an overwrite update for the current live 8BitGPU workspace. Upload every file in this package into the matching location on the live site, replacing files with the same name. It removes the older coded window frames and applies the reference stream-window treatment throughout the desktop apps and embedded pages.

## Upload these files together

- All root HTML, CSS, and JavaScript files in this package.
- `src/worker.js` and `src/social.js`.

The Worker and D1 binding already configured in `wrangler.jsonc` are reused. Deploy the Worker after uploading the frontend files. No new Cloudflare resources, variables, or secrets are needed. Existing profile images, accounts, avatars, chat data, and legacy friends are retained.

## Included

- Reference-style, recolorable retro frames for desktop windows, Avatar Lab, Chat.exe, Media Player, MyPixel, Account, Store, Login, Arcade, and external-site launch windows.
- MyPixel draggable windows on desktop and touch screens. Each account sees and saves its own arrangement across devices; visitors do not inherit the profile owner’s arrangement.
- A small theme-matched save notice instead of the yellow MyPixel banner.
- Friends with consent-based requests, in-site notifications, accepted-friends-only DMs, and friends-only room invites. Room invitations open existing rooms and still respect access controls.
- Social.exe from the desktop stats area, and a public ordered MyPixel Top 8.

## Verify after deployment

1. Sign in as two separate accounts in different browsers or devices.
2. Send and accept a friend request; confirm each account receives the in-site notification.
3. Send a DM and room invitation. Confirm non-friends cannot send either.
4. Set a Top 8 entry and view the profile from another account.
5. Rearrange MyPixel windows on desktop and phone. Confirm each account keeps its own arrangement after reload.
6. Open Avatar Lab, Chat.exe, Media Player, a form/other-site link, and MyPixel. Confirm the new reference-style frames are visible and functional.
