"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureAddressPolicy, maskDocument, normalizeDocument, resolveAddress, validateOrderPayload } = require("../src/services/taca/validation");

test("normalizes CPF/CNPJ and masks stored display value", () => {
  assert.equal(normalizeDocument("12.345.678/0001-90"), "12345678000190");
  assert.equal(maskDocument("12345678000190"), "**.345.678/****-90");
});

test("rejects invalid minimum payload", () => {
  assert.throws(() => validateOrderPayload({ integrationCode: "PAY-1", amount: 0, customer: {} }), /amount/);
});

test("accepts minimum valid payload", () => {
  const value = validateOrderPayload({ integrationCode: "PAY-1", amount: 10, customer: { document: "12345678901", legalName: "A", email: "a@example.com" } });
  assert.equal(value.customer.document, "12345678901");
  assert.equal(value.amount, 10);
});

test("request address wins over defaults field by field", () => {
  const result = resolveAddress({ street: "Request St", state: "SP" }, { street: "Default St", number: "10", district: "Centro", cityIbgeCode: "3550308", state: "MG", postalCode: "01001000" });
  assert.equal(result.address.street, "Request St");
  assert.equal(result.origin.street, "request");
  assert.equal(result.address.number, "10");
  assert.equal(result.origin.number, "default");
  assert.equal(result.address.state, "SP");
});

test("100% default address is accepted", () => {
  const result = resolveAddress({}, { street: "A", number: "1", district: "B", cityIbgeCode: "3550308", state: "SP", postalCode: "01001000" });
  assert.doesNotThrow(() => ensureAddressPolicy(result, false));
  assert.equal(result.origin.street, "default");
});

test("insufficient address is blocked when policy is false", () => {
  const result = resolveAddress({}, { state: "SP" });
  assert.throws(() => ensureAddressPolicy(result, false), (error) => error.statusCode === 422 && error.details.missingFields.includes("street"));
});

test("insufficient address is allowed when policy is true", () => {
  const result = resolveAddress({}, { state: "SP" });
  assert.equal(ensureAddressPolicy(result, true).missingFields.length > 0, true);
});
