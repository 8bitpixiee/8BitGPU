import test from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, googleConfig, pkceChallenge, usernameFrom } from "../server/google.js";

test("google stays off until real keys are set", () => {
  assert.equal(googleConfig({}, "https://x.test"), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: "a" }, "https://x.test"), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: "your-client-id", GOOGLE_CLIENT_SECRET: "your-client-secret" }, "https://x.test"), null);
  const config = googleConfig({ GOOGLE_CLIENT_ID: "id.apps", GOOGLE_CLIENT_SECRET: "shh" }, "https://x.test");
  assert.equal(config.redirectUri, "https://x.test/api/auth/google/callback");
});

test("the redirect can be overridden", () => {
  const config = googleConfig(
    { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REDIRECT_URI: "https://8bitgpu.world/api/auth/google/callback" },
    "https://x.test",
  );
  assert.equal(config.redirectUri, "https://8bitgpu.world/api/auth/google/callback");
});

test("the authorize link carries state and a pkce challenge", async () => {
  const challenge = await pkceChallenge("verifier");
  const url = new URL(authorizeUrl({ clientId: "id", redirectUri: "https://x.test/cb" }, "abc", challenge));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), "abc");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
});

test("usernames come out valid", () => {
  const valid = /^[a-zA-Z0-9_.-]{3,18}$/;
  for (const [email, name] of [["mossy.exe@gmail.com", ""], ["a@x.com", "Ann Lee"], ["", "Ann Lee"], ["très+tag@x.com", ""], ["averyveryverylongaddress@x.com", ""]])
    assert.match(usernameFrom(email, name), valid);
  assert.equal(usernameFrom("mossy.exe@gmail.com"), "mossy.exe");
});
