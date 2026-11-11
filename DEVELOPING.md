# Developing 8BitGPU

Cloudflare Worker (`server/worker.js`) + D1 + static pages at the repo root.

- `npm test` runs the node tests in `tests/` plus the avatar animation check.
- Local worker: `npx wrangler dev`. Secrets go in `.dev.vars` (gitignored), start from `.dev.vars.example`.
- Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; without them `/api/auth/google/config` says `enabled: false` and the button stays hidden.
- Google-only accounts store `google-sso` as their passcode placeholder. They can't log in with a passcode, can't unlink Google, and can't make a recovery key.
- Static preview: any static server on the repo root works, `/api/*` just 404s.
- `README.txt` is an old patch install note, not current docs.
