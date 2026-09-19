# Lounge and MyPixel friends update

## Included

- The full Arcade Lounge floor is walkable, including the edges.
- A player profile opens only when their name tag is clicked or tapped. Clicking the character or floor walks as expected.
- Account.exe has a MyPixel friends list. Add an existing creature name, then use **Visit MyPixel** to open that profile while the person is offline.

## Deploy

Deploy these files together with the existing Worker/D1 configuration:

- `arcade.js`
- `arcade-profile.js`
- `arcade-profile.css`
- `account.html`
- `account.js`
- `account.css`
- `src/chat.js`
- `src/worker.js`

The new friends table creates automatically on the existing D1 database. It does not change or remove any existing account, chat, avatar, or profile data.
