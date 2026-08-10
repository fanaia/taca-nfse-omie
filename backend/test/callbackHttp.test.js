"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { postOnce } = require("../src/services/taca/callback");

const config = { callbackTimeoutMs: 30, callbackAuthMode: "none" };

test("callback accepts 2xx", async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => ({ ok: true, status: 204, text: async () => "" });
  const result = await postOnce("https://callback.invalid", { a: 1 }, config);
  assert.equal(result.httpStatus, 204);
});

for (const status of [400, 500]) {
  test(`callback surfaces HTTP ${status}`, async (t) => {
    const original = global.fetch;
    t.after(() => { global.fetch = original; });
    global.fetch = async () => ({ ok: false, status, text: async () => "failure" });
    await assert.rejects(() => postOnce("https://callback.invalid", { a: 1 }, config), (error) => error.httpStatus === status);
  });
}

test("callback timeout aborts the request", async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  await assert.rejects(() => postOnce("https://callback.invalid", { a: 1 }, config), /aborted/);
});
