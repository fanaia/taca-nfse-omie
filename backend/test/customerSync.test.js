"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { customerFingerprint, customerNeedsSync } = require("../src/services/taca/customerSync");

const base = {
  documentoNormalizado: "12.345.678/0001-90",
  customerLegalName: "Cliente Exemplo Ltda",
  customerTradeName: "Cliente Exemplo",
  customerEmail: "FISCAL@example.com ",
  simpleNationalTaxpayer: false,
  enderecoEfetivoJson: JSON.stringify({
    street: "Rua A",
    number: "10",
    complement: "Sala 2",
    district: "Centro",
    cityIbgeCode: "3550308",
    state: "sp",
    postalCode: "01001-000",
  }),
};

test("same customer data produces same fingerprint after harmless normalization", () => {
  const a = customerFingerprint(base);
  const b = customerFingerprint({
    ...base,
    documentoNormalizado: "12345678000190",
    customerEmail: "fiscal@example.com",
    enderecoEfetivoJson: JSON.stringify({
      street: "Rua A",
      number: "10",
      complement: "Sala 2",
      district: "Centro",
      cityIbgeCode: "3550308",
      state: "SP",
      postalCode: "01001000",
    }),
  });
  assert.equal(a, b);
});

test("changed order customer data requires a new Omie sync", () => {
  const current = customerFingerprint(base);
  const changed = customerFingerprint({ ...base, customerEmail: "novo@example.com" });
  assert.notEqual(current, changed);
  assert.equal(customerNeedsSync({ codigoClienteOmie: 123, sincronizadoFingerprint: current }, current), false);
  assert.equal(customerNeedsSync({ codigoClienteOmie: 123, sincronizadoFingerprint: current }, changed), true);
});

test("customer without Omie code always needs sync", () => {
  const current = customerFingerprint(base);
  assert.equal(customerNeedsSync({ sincronizadoFingerprint: current }, current), true);
});
