"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { customerFingerprint, customerNeedsSync } = require("../src/services/taca/customerSync");

function order(overrides = {}) {
  return {
    documentoNormalizado: "12345678000190",
    customerLegalName: "Cliente Exemplo Ltda",
    customerTradeName: "Cliente Exemplo",
    customerEmail: "fiscal@example.com",
    simpleNationalTaxpayer: false,
    enderecoEfetivoJson: JSON.stringify({ street: "Rua A", number: "10", district: "Centro", cityIbgeCode: "3550308", state: "SP", postalCode: "01001000" }),
    ...overrides,
  };
}

test("synced client with unchanged order data skips synchronization", () => {
  const current = customerFingerprint(order());
  assert.equal(customerNeedsSync({ codigoClienteOmie: 987, sincronizadoFingerprint: current }, current), false);
});

test("synced client with changed order data requires synchronization", () => {
  const synced = customerFingerprint(order());
  const changed = customerFingerprint(order({ customerLegalName: "Cliente Exemplo Alterado Ltda" }));
  assert.equal(customerNeedsSync({ codigoClienteOmie: 987, sincronizadoFingerprint: synced }, changed), true);
});
