"use strict";

const { models } = require("./runtime");

async function getConfig({ create = true } = {}) {
  const { ConfiguracaoNfse } = models();
  let config = await ConfiguracaoNfse.findOne({ chave: "default" });
  if (!config && create) {
    try { config = await ConfiguracaoNfse.create({ chave: "default" }); }
    catch (error) {
      if (error?.code !== 11000) throw error;
      config = await ConfiguracaoNfse.findOne({ chave: "default" });
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

module.exports = { defaultAddress, getConfig, requireOperationalConfig };
