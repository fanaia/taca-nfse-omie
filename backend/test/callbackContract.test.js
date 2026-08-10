"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrderCallback, buildReversalCallback, signHmac } = require("../src/services/taca/callbackContract");

test("order callback contract uses English fields and final invoice data", () => {
  assert.deepEqual(buildOrderCallback({ integrationCode: "PAY-1", externalStatus: "INVOICE_ISSUED", numeroNfse: "1", codigoVerificacaoNfse: "ABC", urlNfse: "https://x" }), {
    integrationCode: "PAY-1", type: "order", status: "INVOICE_ISSUED",
    invoice: { number: "1", verificationCode: "ABC", url: "https://x" }, message: "",
  });
});

test("reversal callback contract is independent", () => {
  const body = buildReversalCallback({ integrationCode: "PAY-1", externalStatus: "REVERSED", invoiceNumber: "1" });
  assert.equal(body.type, "reversal");
  assert.equal(body.status, "REVERSED");
});

test("HMAC is deterministic", () => {
  assert.equal(signHmac('{"a":1}', "secret"), signHmac('{"a":1}', "secret"));
  assert.match(signHmac('{"a":1}', "secret"), /^sha256=[a-f0-9]{64}$/);
});
