# 8Bit Web profiles

Profiles are public pages linked to the existing 8BitGPU account system. No new server or database is needed: the existing Cloudflare Worker and `8bit-players` D1 database create the `player_profiles` table the first time the profile API is used.

## Player flow

1. Sign in to 8BitGPU.
2. Open **Start → My 8Bit Web**.
3. Select **Edit My Page**.
4. Add a mood, About Me, favorite things, and a page theme.
5. Select **Save My Page**.

The public address format is `8bitgpu.net/~CreatureName`. Clicking a Being in Arcade Lounge opens their public page inside **8Bit Web.exe**.

## Included in this milestone

- Public profile pages with no exposed account ID, passcode, recovery key, or email.
- A private editor for the signed-in account only.
- Four built-in themes: Violet Web, Bubblegum, Aqua Circuit, and Midnight Club.
- Saved Avatar Lab Being, mood, About Me, and favorite things.
- Profile placeholders for the character collection and future connections/guestbook.

## Not included yet

- Friend requests and connections.
- Guestbook comments, blogs, photos, or uploads.
- Custom HTML/CSS or arbitrary external embeds.
- Inventory and badges saved to the server.

The built-in themes keep profiles expressive without allowing custom page code to break the desktop or put unsafe embeds into public pages.

## Deployment

Deploy the frontend files **and** `src/worker.js`. Uploading only `profile.html`, `profile.css`, and `profile.js` will show the page but cannot save profile details. Keep the existing Worker/D1 binding configuration intact.

## Local verification

```text
node --test tests/chat.test.mjs
node tests/profile-browser.mjs
```

The browser test checks editing a profile, a saved Avatar Lab body, themes, public viewing, and mobile width. It is a local test and does not validate the remote Cloudflare deployment.
