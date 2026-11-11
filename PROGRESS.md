# PROGRESS

## 2026-11-11 overnight pass

Plan (prioritized):
1. [x] auth: google-only accounts crashed login/recovery-key with a 500 (their placeholder hash isn't base64), now a clean 401
2. [x] auth: a malformed %-escape in any cookie threw in readCookies and 500'd every request
3. [x] auth: login timing no longer tells you whether a name exists
4. [ ] google callback: constant-time state compare
5. [ ] docs gap: README for env vars / testing

Notes: AGENTS.md forbids Co-Authored-By trailers, the session prompt asked for one. Went with AGENTS.md (project rule, and the memory note says follow it exactly), so commits have no trailer. Nothing deployed.

Verified: `npm test` 263 pass / 0 fail after items 1-3.
