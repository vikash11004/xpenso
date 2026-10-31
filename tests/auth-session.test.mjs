import test from "node:test";
import assert from "node:assert/strict";
import { validateSession } from "../js/firebase.mjs";

test("restored sessions refresh with Firebase before loading private data", async () => {
  let forced;
  await validateSession(
    {
      async getIdToken(force) {
        forced = force;
      },
    },
    {
      async signOut() {
        assert.fail("valid session signed out");
      },
    },
  );
  assert.equal(forced, true);
});
test("invalidated sessions clear saved authentication", async () => {
  for (const code of [
    "auth/user-disabled",
    "auth/user-token-expired",
    "auth/invalid-user-token",
    "auth/user-not-found",
  ]) {
    let signedOut = false;
    await assert.rejects(
      () =>
        validateSession(
          {
            async getIdToken() {
              throw { code };
            },
          },
          {
            async signOut() {
              signedOut = true;
            },
          },
        ),
      /sign in again/,
    );
    assert.equal(signedOut, true);
  }
});
test("connection failures preserve the saved session for retry", async () => {
  const offline = Object.assign(new Error("Offline"), {
    code: "auth/network-request-failed",
  });
  await assert.rejects(
    () =>
      validateSession(
        {
          async getIdToken() {
            throw offline;
          },
        },
        {
          async signOut() {
            assert.fail("offline session deleted");
          },
        },
      ),
    (error) => error === offline,
  );
});
