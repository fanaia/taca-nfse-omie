"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const payload = fs.readFileSync(path.resolve(__dirname, "../src/services/taca/omiePayload.js"), "utf8");

test("UpsertClienteCpfCnpj payload does not send codigo_cliente_integracao", () => {
  const customerFunction = payload.slice(payload.indexOf("function buildCustomerPayload"), payload.indexOf("function buildServiceOrderPayload"));
  assert.doesNotMatch(customerFunction, /codigo_cliente_integracao/);
  assert.match(customerFunction, /cnpj_cpf/);
});
