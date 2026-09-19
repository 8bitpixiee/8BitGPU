# Lounge emotes

The first live emotes are wired into the shared room: **Dance**, **Smoke**, **LOL**, **Spin**, and **Wave**. An emote is saved briefly on the chat server, returned with room presence, and shown to every person in the lounge for eight seconds.

## What is needed for custom character animation

For each body type, draw a transparent PNG sprite sheet for the action. Keep every frame on the same canvas so clothing, hair, and accessories do not jump around.

Recommended first set:

- `dance`: 6 to 8 looping frames.
- `smoke`: 4 pose frames plus a separate transparent smoke-puff sheet.
- `laugh`: 4 to 6 frames.
- `wave`: 4 to 6 frames.
- `sit`: 1 resting pose, useful later for lounge furniture.

Use the same frame size for every sheet, such as 256 × 256 pixels per frame. Name files by body type and action, for example `pixie_fem_dance.png`, `pixie_masc_dance.png`, and `pixie_chunky_masc_dance.png`.

The current CSS animations let the feature work before those sheets exist. When the art is ready, the room renderer can swap the live layered Being for the correct action sheet, play it, then return to the normal standing layers.

## Adding another emote

1. Add the emote name to the allowed set in `src/chat.js`.
2. Add its button to `arcade.html`.
3. Add its visual class or sprite-sheet playback in `arcade.js` and `arcade-mobile.css`.
4. Add it to the lounge browser test so another player sees the action.

Emotes are visual actions only. They do not grant moderation powers, change inventory, or bypass room access.
