"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REFERENCE_LISTS,
  mapCategory,
  mapCity,
  mapCurrentAccount,
  mapPaymentTerm,
  mapService,
  requestParam,
} = require("../src/services/taca/referenceData");
const { PROCESSING_DEFAULTS, defaultPatch } = require("../src/services/taca/config");

test("maps Omie service list records for selection", () => {
  const mapped = mapService({
    intListar: { nCodServ: 123, cCodIntServ: "INT-1" },
    cabecalho: { cCodigo: "SRV-01", cDescricao: "Consultoria", cCodCateg: "1.01.02" },
    descricao: { cDescrCompleta: "Consultoria especializada" },
    info: { inativo: "N" },
  });
  assert.equal(mapped.codigoServicoOmie, 123);
  assert.equal(mapped.nome, "Consultoria");
  assert.equal(mapped.codigoCategoriaOmie, "1.01.02");
  assert.equal(mapped.status, "Ativo");
});

test("maps categories and excludes totalizers from configuration selection", () => {
  const selectable = mapCategory({ codigo: "1.01.02", descricao: "Serviços", conta_inativa: "N", totalizadora: "N", nao_exibir: "N" });
  const totalizer = mapCategory({ codigo: "1.01", descricao: "Receitas", conta_inativa: "N", totalizadora: "S", nao_exibir: "N" });
  assert.equal(selectable.selecionavel, true);
  assert.equal(totalizer.selecionavel, false);
});

test("maps current account, payment term and city list records", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(mapCurrentAccount({ nCodCC: 456, descricao: "Banco", inativo: "N" })).filter(([key]) => ["codigoContaCorrenteOmie", "nome", "status"].includes(key))),
    { codigoContaCorrenteOmie: 456, nome: "Banco", status: "Ativo" },
  );
  const payment = mapPaymentTerm({ cCodigo: "000", cDescricao: "A Vista", nQtdeParc: 1 });
  assert.equal(payment.codigoCondicaoPagamento, "000");
  assert.equal(payment.numeroParcelas, 1);
  const city = mapCity({ cCod: "SAO PAULO (SP)", cNome: "SAO PAULO", cUF: "SP", nCodIBGE: "3550308" });
  assert.equal(city.codigoCidadeOmie, "SAO PAULO (SP)");
  assert.equal(city.codigoIbge, "3550308");
});

test("reference list definitions use the Omie pagination contracts", () => {
  assert.equal(REFERENCE_LISTS.services.call, "list-services");
  assert.deepEqual(requestParam(REFERENCE_LISTS.services, 2), [{ nPagina: 2, nRegPorPagina: 100 }]);
  assert.equal(REFERENCE_LISTS.paymentTerms.call, "list-payment-terms");
  assert.equal(REFERENCE_LISTS.cities.itemsPath, "lista_cidades");
});

test("processing defaults are materialized when configuration fields are missing", () => {
  const patch = defaultPatch({ callbackUrl: "https://example.test/callback" });
  assert.equal(patch.instanceId, "default");
  assert.equal(patch.codigoCondicaoPagamento, "000");
  assert.equal(patch.callbackAuthMode, "hmac-sha256");
  assert.equal(patch.callbackTimeoutMs, 5000);
  assert.equal(patch.callbackMaxAttempts, 3);
  assert.equal(patch.callbackBackoffMs, 500);
  assert.equal(patch.fiscalCheckAttempts, 3);
  assert.equal(patch.fiscalCheckBackoffMs, 1000);
  assert.equal(patch.defaultCountryCode, "1058");
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "callbackUrl"), false);
  assert.deepEqual(PROCESSING_DEFAULTS.callbackSecretEnv, "TACA_CALLBACK_SECRET");
});
