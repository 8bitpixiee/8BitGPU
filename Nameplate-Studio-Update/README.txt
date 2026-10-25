NAMEPLATE STUDIO UPDATE - 2026-10-25

Target: C:\Users\SOwil\CODING SHIT\8BitGPU
Prepared against the current client/server/assets layout, with file fingerprints verified before packaging.
Nothing has been copied into that repo, staged, committed, or deployed.

CONTENTS
files/ - the 28 files to add or replace, retaining their paths.
originals/ - exact original copies of the 12 existing files this package changes.
FILES.txt - exact ADD/REPLACE list.
Check-Repo.ps1 - READ-ONLY checker. Verifies .git exists, target files match this package's baseline, and new paths are unused. It copies nothing.

APPLY USING YOUR USUAL WORKFLOW
1. Extract this ZIP somewhere OUTSIDE the repo.
2. In VS Code open C:\Users\SOwil\CODING SHIT\8BitGPU. Confirm git status is clean and you are on the branch you want to use.
3. Make a backup copy of the repo folder outside itself before replacing files. The supplied originals/ folder is also a backup of every existing file changed here.
4. Optional: right-click Check-Repo.ps1 and Run with PowerShell. If it reports a mismatch, STOP; the repo has changed since this package was built.
5. Open files/ in this extracted package. Select ALL CONTENTS INSIDE files/ (including client, server, assets and HTML files) and copy them into the ROOT of your repo. Let Windows merge matching folders and replace matching FILES. Do not delete any folders. Do not copy originals/ into your repo. Do not copy the enclosing files/ folder itself.
6. In VS Code Source Control review the changes against FILES.txt. The .git folder, branches, history, package.json and wrangler.jsonc are not in this package.
7. Commit using your usual VS Code Commit action. Publish/push only when you choose.

UNDO BEFORE COMMITTING
Copy the contents of originals/ back to the repo root to restore the REPLACE files. Remove only paths listed ADD in FILES.txt if you also want to remove the new nameplate feature. Do not delete entire client/server/assets folders.

WHAT CHANGES
Independent Nameplate Studio window and account save settings; five palettes, three frames, nine transparent icon cutouts, optional 28-character title. Styles appear in both connected rooms and MyPixel. Existing earned/self-selected badges remain intact, with descriptions added. Room updates use the existing WebSocket system. Global appearance saves leave nameplate preferences alone.

VALIDATION
42 existing unit tests passed in a separate validation copy, plus two new tests for preference validation and targeted live-room updates. Packaged worker/auth/save/public-profile/both-room notification tests and automated browser checks for studio persistence, profile display, global-save isolation, preserved badge strips, mobile overflow and all nine icon paths passed. The actual Cloudflare Durable Object deployment was not run; live end-to-end behavior remains to be verified after your chosen deployment.
