"use strict";

const { models } = require("./runtime");

const PROCESSING_DEFAULTS = Object.freeze({
  instanceId: "default",
  codigoCondicaoPagamento: "000",
  enviarLinkNfsePorEmail: false,
  defaultCountryCode: "1058",
  allowIssuanceWithoutAddress: false,
  automatizarAprovacao: false,
  automatizarSincronizacaoCliente: false,
  automatizarCriacaoOs: false,
  automatizarGeracaoNf: false,
  automatizarRetornoFaturamento: false,
  automatizarBaixaFinanceira: false,
  automatizarNotificacaoPlataforma: false,
  callbackAuthMode: "hmac-sha256",
  callbackSecretEnv: "TACA_CALLBACK_SECRET",
  callbackTimeoutMs: 5000,
  callbackMaxAttempts: 3,
  callbackBackoffMs: 500,
  fiscalCheckAttempts: 3,
  fiscalCheckBackoffMs: 1000,
});

const SIMPLE_FIELDS = Object.freeze([
  "instanceId",
  "enviarLinkNfsePorEmail",
  "dadosAdicionaisNf",
  "defaultStreet",
  "defaultNumber",
  "defaultComplement",
  "defaultDistrict",
  "defaultCityIbgeCode",
  "defaultState",
  "defaultPostalCode",
  "defaultCountryCode",
  "allowIssuanceWithoutAddress",
  "automatizarAprovacao",
  "automatizarSincronizacaoCliente",
  "automatizarCriacaoOs",
  "automatizarGeracaoNf",
  "automatizarRetornoFaturamento",
  "automatizarBaixaFinanceira",
  "automatizarNotificacaoPlataforma",
  "callbackUrl",
  "callbackAuthMode",
  "callbackSecretEnv",
  "callbackTimeoutMs",
  "callbackMaxAttempts",
  "callbackBackoffMs",
  "fiscalCheckAttempts",
  "fiscalCheckBackoffMs",
]);

function defaultPatch(config) {
  const patch = {};
  for (const [field, value] of Object.entries(PROCESSING_DEFAULTS)) {
    if (config?.[field] === undefined || config?.[field] === null || config?.[field] === "") patch[field] = value;
  }
  return patch;
}

async function getConfig({ create = true } = {}) {
  const { ConfiguracaoNfse } = models();
  let config = await ConfiguracaoNfse.findOne({ chave: "default" });
  if (!config && create) {
    try { config = await ConfiguracaoNfse.create({ chave: "default", ...PROCESSING_DEFAULTS }); }
    catch (error) {
      if (error?.code !== 11000) throw error;
      config = await ConfiguracaoNfse.findOne({ chave: "default" });
    }
  }
  if (config) {
    const patch = defaultPatch(config);
    if (Object.keys(patch).length) {
      config = await ConfiguracaoNfse.findByIdAndUpdate(config._id, { $set: patch }, { new: true, runValidators: true });
    }
  }
  return config;
}

function defaultAddress(config = {}) {
  return {
    street: config.defaultStreet || "",
    number: config.defaultNumber || "",
    complement: config.defaultComplement || "",
    district: config.defaultDistrict || "",
    cityIbgeCode: config.defaultCityIbgeCode || "",
    state: config.defaultState || "",
    postalCode: config.defaultPostalCode || "",
  };
}

async function selected(Model, id, label) {
  if (!id) return null;
  try {
    const value = await Model.findById(id);
    if (!value) {
      const error = new Error(`${label} selecionado não foi encontrado. Sincronize as listas do Omie e selecione novamente.`);
      error.statusCode = 422;
      error.retryable = false;
      throw error;
    }
    return value;
  } catch (error) {
    if (error?.statusCode) throw error;
    const wrapped = new Error(`${label} selecionado é inválido.`);
    wrapped.statusCode = 422;
    wrapped.retryable = false;
    throw wrapped;
  }
}

async function updateConfig(input = {}) {
  const all = models();
  const current = await getConfig({ create: true });

  const [service, category, currentAccount, city, paymentTerm] = await Promise.all([
    selected(all.ServicoOmie, input.servicoOmieId, "Serviço Omie"),
    selected(all.CategoriaOmie, input.categoriaOmieId, "Categoria Omie"),
    selected(all.ContaCorrenteOmie, input.contaCorrenteOmieId, "Conta corrente Omie"),
    selected(all.CidadeOmie, input.cidadePrestacaoServicoId, "Cidade da prestação do serviço"),
    selected(all.CondicaoPagamentoOmie, input.condicaoPagamentoOmieId, "Condição de pagamento Omie"),
  ]);

  const patch = {};
  for (const field of SIMPLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) patch[field] = input[field];
  }

  Object.assign(patch, {
    servicoOmieId: service?._id || null,
    codigoServicoOmie: service ? Number(service.codigoServicoOmie) : null,
    categoriaOmieId: category?._id || null,
    codigoCategoriaOmie: category ? String(category.codigoCategoriaOmie) : "",
    contaCorrenteOmieId: currentAccount?._id || null,
    codigoContaCorrenteOmie: currentAccount ? Number(currentAccount.codigoContaCorrenteOmie) : null,
    cidadePrestacaoServicoId: city?._id || null,
    cidadePrestacaoServico: city ? String(city.codigoCidadeOmie) : "",
    condicaoPagamentoOmieId: paymentTerm?._id || null,
    codigoCondicaoPagamento: paymentTerm
      ? String(paymentTerm.codigoCondicaoPagamento)
      : String(input.codigoCondicaoPagamento || current.codigoCondicaoPagamento || PROCESSING_DEFAULTS.codigoCondicaoPagamento),
  });

  return all.ConfiguracaoNfse.findOneAndUpdate(
    { chave: "default" },
    { $set: patch, $setOnInsert: { chave: "default" } },
    { upsert: true, new: true, runValidators: true },
  );
}

function requireOperationalConfig(config) {
  const missing = [];
  if (!(Number(config?.codigoServicoOmie) > 0)) missing.push("codigoServicoOmie");
  if (!String(config?.codigoCategoriaOmie || "").trim()) missing.push("codigoCategoriaOmie");
  if (!String(config?.cidadePrestacaoServico || "").trim()) missing.push("cidadePrestacaoServico");
  if (missing.length) {
    const error = new Error(`Configuração de emissão incompleta: ${missing.join(", ")}.`);
    error.statusCode = 422;
    error.code = "NFSE_CONFIGURATION_INCOMPLETE";
    error.details = { missingFields: missing };
    throw error;
  }
  return config;
}

module.exports = {
  PROCESSING_DEFAULTS,
  defaultAddress,
  defaultPatch,
  getConfig,
  requireOperationalConfig,
  updateConfig,
};
