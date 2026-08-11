"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/services/taca/orderStageHandler.js"), "utf8");

test("customer stage handler treats SOAP client faults as definitive", () => {
  assert.match(source, /SOAP-ENV:Client/);
  assert.match(source, /error\.retryable = false/);
});

test("customer stage handler skips Omie only when fingerprints match", () => {
  assert.match(source, /syncedFingerprint === currentFingerprint/);
  assert.match(source, /customerSyncSkipped: sync\.skipped/);
});

test("customer stage handler uses include for new customers and update for known customers", () => {
  assert.match(source, /update-customer/);
  assert.match(source, /include-customer/);
  assert.match(source, /codigo_cliente_omie/);
  assert.match(source, /AlterarCliente/);
  assert.match(source, /IncluirCliente/);
});
