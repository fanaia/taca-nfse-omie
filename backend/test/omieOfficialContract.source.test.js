"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const payload = fs.readFileSync(path.resolve(__dirname, "../src/services/taca/omiePayload.js"), "utf8");
const mapping = fs.readFileSync(path.resolve(__dirname, "../src/mappings/omie.js"), "utf8");

test("customer synchronization uses IncluirCliente and AlterarCliente, not Omie upsert methods", () => {
  assert.match(mapping, /call: "IncluirCliente"/);
  assert.match(mapping, /call: "AlterarCliente"/);
  assert.doesNotMatch(mapping, /call: "UpsertCliente/);
});

test("IncluirCliente payload carries a stable integration code and CPF/CNPJ", () => {
  const customerFunction = payload.slice(payload.indexOf("function buildCustomerPayload"), payload.indexOf("function buildServiceOrderPayload"));
  assert.match(customerFunction, /codigo_cliente_integracao/);
  assert.match(customerFunction, /TACA-/);
  assert.match(customerFunction, /cnpj_cpf/);
});
