# MyPixel profiles

Profiles are public pages linked to the existing 8BitGPU account system. No new server or database is needed: the existing Cloudflare Worker and `8bit-players` D1 database create the `player_profiles` table the first time the profile API is used.

## Player flow

1. Sign in to 8BitGPU.
2. Open **Start → MyPixel**.
3. Select **Edit My Page**.
4. Add a mood, About Me, favorite things, then drag the page color sliders.
5. On desktop, paste a direct `https://` image link to hang an image on the wall behind the page.
6. Select **Save My Page**.

The public address format is `8bitgpu.net/~CreatureName`. Clicking a Being in Arcade Lounge opens their public page inside **MyPixel.exe**.

## Included in this milestone

- Public profile pages with no exposed account ID, passcode, recovery key, or email.
- A private editor for the signed-in account only.
- Drag-to-color controls for the page wall, paper, accents, and light/dark feel. The full generated palette is saved with the profile.
- A desktop-only wall-image field for a direct `https://` image link.
- Saved Avatar Lab Being, mood, About Me, and favorite things.
- Profile placeholders for the character collection and future connections/guestbook.

## Not included yet

- Friend requests and connections.
- Guestbook comments, blogs, or image-file uploads from a computer. File uploads need an image storage bucket; the current wall setting uses a direct image link.
- Custom HTML/CSS or arbitrary external embeds.
- Inventory and badges saved to the server.

The controls keep profiles expressive without allowing custom page code to break the desktop or put unsafe embeds into public pages.

## Deployment

Deploy the frontend files **and** `src/worker.js`. Uploading only `profile.html`, `profile.css`, and `profile.js` will show the page but cannot save profile details. Keep the existing Worker/D1 binding configuration intact.

## Local verification

```text
node --test tests/chat.test.mjs
node tests/profile-browser.mjs
```

The browser test checks editing a profile, the color mixer, wall-image link, a saved Avatar Lab body, public viewing, and mobile width. It is a local test and does not validate the remote Cloudflare deployment.
