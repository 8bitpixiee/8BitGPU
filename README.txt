CONNECTED ARCADE LOUNGE + PILLOW ROOM

This update keeps the existing arcade map and adds the original Pillow Room image.
Separate Start / mobile launcher buttons reuse one room window. Doors connect the
rooms. Messages and occupants are isolated by room. Membership, moderation, blocks,
avatar colors, and avatar saves remain shared across the site.

INSTALL IN VSCODIUM
1. Save all files. Extract this ZIP into the main 8BitGPU folder, beside index.html.
   Keep the assets/maps/pillow/ folder structure. The new image is copied unchanged.
2. In that project's terminal:
   git status
   git apply --check .\connected-rooms.patch
3. Only if the check returns without an error:
   git apply .\connected-rooms.patch
   git diff --stat
4. Preview locally. Test both Start buttons, both doors, chat in separate rooms,
   and maximizing the window. Use two accounts / browser sessions to check occupants.
5. Commit the code AND assets/maps/pillow/pillow-room.png on your feature branch.
   Merge the reviewed change into main when ready to publish.

If --check reports an error, stop and share the output. The check does not edit code.
These commands do not commit, push, pull, or deploy.

DATABASE
On the first chat request after deployment, setup adds a room column and index if
needed. Existing chat messages default to arcade and remain visible in Arcade Lounge.
The Pillow Room begins with its own empty chat. This schema update was tested on a
local database containing old messages. No live database was accessed or changed.

MAPS
Arcade keeps its original 1200x1200 artwork. Pillow Room uses the supplied 300x216
image at its original aspect ratio. Maps fit inside the available window; extra space
is letterboxed. Players keep square proportions. Doorways are small overlay controls;
neither source image is edited. Pillow walking is limited to the lower floor region.

FILES
The patch updates 6 existing files and adds 3 scripts/styles. The ZIP also adds the
Pillow Room PNG. connected-rooms.patch and this README are installation files and
do not need to be committed or deployed.
