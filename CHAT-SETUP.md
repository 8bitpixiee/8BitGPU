> Current release: see ARCADE-LOUNGE-SETUP.md for owner-managed invitations and the shared arcade. The notes below describe the original private-chat foundation.

# Private 18+ community test — 8BitGPU

## What is ready locally
- The existing username/passcode accounts and online avatar saves remain in use.
- Account.exe shows the signed-in account ID, supports sign-out, and generates a recovery key after checking the current passcode.
- A recovery key is shown once, stored only as a hash on the server, and can reset a passcode from Login.exe. Resetting revokes all sessions and consumes the key. Create a new key after recovery. Email-based recovery is not configured.
- Chat.exe is a separate Garden room. It requires a valid account, inclusion on the private tester list, and an 18+ / room-rules acknowledgment.
- Members see the latest 60 messages and saved avatar portraits. Text updates every three seconds, backs off on network failures, and pauses while the page is hidden. This is a small-test polling implementation, not WebSocket infrastructure.
- Messages persist in D1. Each account may send at most one message every three seconds; messages are limited to 500 characters.
- Members can report messages and block/unblock other members. Blocking hides that person's messages from the blocker; it does not prevent them from viewing the shared room.
- Owners can review reports, delete messages, mute/unmute for one hour, and ban/unban accounts. Bans also prevent reading the room.
- Twitch chat stays in the media player; the fake AOL buddy overlay is removed.

## Deployment configuration
The existing Worker name and D1 binding are preserved in wrangler.jsonc. New tables are created on first use without deleting existing users or avatars.

The release deliberately defaults to CHAT_ENABLED="false". Deploying these files alone does not grant chat access.

1. Deploy the replacement files through the existing Cloudflare Worker deployment workflow. Include src/worker.js, src/chat.js, src/chat-avatar.js, wrangler.jsonc and .assetsignore as well as the HTML/CSS/JS files. Uploading only HTML/CSS cannot create the server API.
2. Sign into the existing site and open Account.exe. Copy the private account ID shown there (not the passcode or recovery key).
3. The designated owner is the existing **Pixie** account. Retrieve its ID from Account.exe while signed in as Pixie, or with the read-only D1 query `SELECT id, username FROM users WHERE username = 'Pixie' COLLATE NOCASE;`. Configure CHAT_OWNER_IDS with that exact account ID. Multiple IDs may be comma-separated. Never choose an owner from a public display-name claim alone.
4. Configure CHAT_TEST_USER_IDS with the exact IDs of approved adult testers. Owners do not need to be repeated in this list.
5. Set CHAT_ENABLED="true" in the deployment's Worker variables and deploy/apply the configuration. Keep wrangler.jsonc synchronized if deployments are made from the repository; otherwise a later deploy could overwrite dashboard variables.
6. Check access with an owner, approved tester, unapproved account, and signed-out browser. Then test two-device chat, reports, blocks, mute/ban, avatar sync, sign-out and recovery on the actual Cloudflare deployment.

No paid infrastructure, new Cloudflare resources, secrets, or production settings have been created or changed by this local release. Remote Cloudflare deployment still needs validation.

## Before wider release
- This is adult self-attestation plus manual tester approval, not identity or age verification.
- Decide moderation coverage and publish community rules, privacy information, and a retention policy. Messages/reports currently remain in D1; deleted messages are hidden, not physically purged.
- Keep this release to a small invited test. Replace periodic history requests with persistent live connections before scaling the room; load-test and monitor costs.
- Memberships, payments tied to accounts, game entitlements, email recovery, and parent-managed accounts are not included in this milestone.

## Local verification
Requires Node 24+ for the SQLite test adapter:

    node --test tests/chat.test.mjs

The browser test uses the bundled Playwright path and installed Chrome on this workspace:

    node tests/chat-browser.mjs

Tests use local SQLite through a D1-compatible adapter. They do not certify Cloudflare runtime behavior or production configuration. Browser testing covers two signed-in users, the adult gate, cross-client messages, safe text rendering, reports, mute behavior, recovery-key generation, and mobile width.

Cloudflare reference: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
The /api/* routes run through the Worker. .assetsignore prevents backend source, test fixtures, and configuration artifacts from being published as static downloads.


