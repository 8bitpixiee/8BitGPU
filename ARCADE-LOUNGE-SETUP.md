# Arcade Lounge release — private 18+ room

## Owner access
This release configures the account shown in the supplied screenshot as the sole owner:
- Account name shown: 8Bit_Pixiee.dev
- Account ID: 98038eed-e9f0-48e6-a05c-b7d012b57388

CHAT_ENABLED is true in this release, but only this owner and individually approved members can enter. Existing CHAT_TEST_USER_IDS remains a supported server bootstrap list. No friend receives moderator or owner permissions from an invitation.

## Let your friends in
1. Deploy all replacement files, including src/ and wrangler.jsonc, to the existing Cloudflare Worker. Keep the existing D1 database binding and existing art assets.
2. Sign into your owner account and open Account.exe.
3. Your friends create their own accounts and send you their creature names, not passwords.
4. Under **Owner · Room access**, enter a friend's exact creature name and click **Add member**.
5. Share your site's arcade.html link. Your friend signs in, accepts the 18+ room rules, and enters the room.
6. You can remove or restore access from the same panel. Removing access disconnects the room view on the next update. Moderation controls remain yours in Chat.exe.

If the owner panel does not appear, verify that the deployed server uses this release's CHAT_OWNER_IDS and CHAT_ENABLED variables, and that you are signed in to the listed account. Updating only the frontend files will not update server permissions. Cloudflare dashboard variables and repository configuration should agree.

## Room behavior
- Uses the existing arcade background and saved Avatar Lab bodies, clothes, layers, and adjustments.
- Click/tap the central floor or use WASD/arrows to walk. Typing in chat does not move your Being.
- Other approved members appear with name labels. Room messages appear as brief speech bubbles and in the chat log.
- The arcade and Chat.exe share one community conversation and the same moderation/blocking rules.
- The owner can report/review/delete messages and mute/ban using Chat.exe; other users can report and block.
- Member positions and chat refresh about every 1.5 seconds. This is an invited-test implementation, not a finished MMO or a WebSocket service. Old presence expires after 20 seconds. The floor currently uses a simple bounded walking area.
- Browser-only arcade rewards are preserved in storage; the previous single-player arcade files are backed up locally under backups/arcade-before-social.

## Verification
Local API tests and two-browser checks cover invitations, member-only permissions, position validation, presence expiry, blocking, access removal, saved avatars, keyboard movement, cross-browser movement updates, speech bubbles, typing isolation, and mobile layout. Existing authentication/recovery/moderation tests also pass. These use local SQLite, not the live Cloudflare database.

Run:
    node --test tests/chat.test.mjs
    node tests/arcade-browser.mjs

## Recovery key
The screenshot included a recovery key. Generate a new recovery key in Account.exe and keep it private; this replaces the exposed one. No recovery key is included in the release.

## Deployment status
Prepared and tested locally. No live deployment or remote database changes were performed in this task.
