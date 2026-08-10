"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCustomerPayload, buildServiceOrderPayload, normalizeFiscal } = require("../src/services/taca/omiePayload");

test("builds UpsertClienteCpfCnpj payload from effective address without integration code", () => {
  const payload = buildCustomerPayload({
    documentoNormalizado: "12345678000190", customerLegalName: "Cliente Ltda", customerTradeName: "Cliente",
    customerEmail: "fiscal@example.com", simpleNationalTaxpayer: false,
    address: { street: "Rua A", number: "10", district: "Centro", cityIbgeCode: "3550308", state: "SP", postalCode: "01001000" },
  }, { defaultCountryCode: "1058" });
  assert.equal(payload.cnpj_cpf, "12345678000190");
  assert.equal(payload.endereco_numero, "10");
  assert.equal(payload.cidade, "3550308");
  assert.equal(payload.optante_simples_nacional, "N");
  assert.equal(payload.codigo_cliente_integracao, undefined);
});

test("builds service order with one service unit and integration code", () => {
  const payload = buildServiceOrderPayload({ integrationCode: "PAY-1", amount: 149.9, customerEmail: "a@example.com" }, 123, {
    codigoServicoOmie: 456, codigoCategoriaOmie: "1.01.02", codigoContaCorrenteOmie: 789,
    cidadePrestacaoServico: "SAO PAULO (SP)", codigoCondicaoPagamento: "000", enviarLinkNfsePorEmail: false,
  }, new Date("2026-08-10T12:00:00Z"));
  assert.equal(payload.Cabecalho.cCodIntOS, "PAY-1");
  assert.equal(payload.Cabecalho.nCodCli, 123);
  assert.deepEqual(payload.ServicosPrestados[0], { nCodServico: 456, nQtde: 1, nValUnit: 149.9 });
});

test("classifies Omie fiscal status variations", () => {
  const pending = normalizeFiscal({ Cabecalho: { cCodIntOS: "PAY-1", nCodOS: 1 }, ListaRpsNfse: { cStatusRps: "002", nRps: "10" } });
  assert.equal(pending.state, "PROCESSING");
  const issued = normalizeFiscal({ Cabecalho: { nCodOS: 1 }, ListaRpsNfse: [{ cStatusLote: "004", nNfse: "999", cCodVerif: "ABC", cUrlNfse: "https://nfse" }] });
  assert.equal(issued.state, "ISSUED");
  assert.equal(issued.invoiceNumber, "999");
  const failed = normalizeFiscal({ listaRpsNfse: [{ cStatusRps: "003", mensagens: [{ cDescricao: "Erro prefeitura" }] }] });
  assert.equal(failed.state, "ERROR");
  assert.match(failed.message, /Erro prefeitura/);
});
