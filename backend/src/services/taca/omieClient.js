"use strict";

const { core } = require("./runtime");
const { responseData } = require("./omiePayload");

function clean(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(clean).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const entries = Object.entries(value).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function normalizeParam(param) {
  const normalized = clean(Array.isArray(param) ? param : [param]);
  if (!Array.isArray(normalized) || !normalized.length || normalized.some((item) => !item || typeof item !== "object" || Array.isArray(item) || !Object.keys(item).length)) {
    const error = new Error("Chamada Omie sem parâmetros válidos.");
    error.statusCode = 422;
    error.retryable = false;
    throw error;
  }
  return normalized;
}

async function callOmie(callKey, instanceId, param, context = {}) {
  const runtime = core();
  if (!runtime.omie?.call) throw new Error("Runtime Omie indisponível.");
  return runtime.omie.call({
    callKey,
    instanceId: instanceId || "default",
    payload: { param: normalizeParam(param) },
  }, { context, maxAttempts: 1 });
}

function isNotFound(error) {
  const value = [error?.message, error?.response?.data?.faultstring, error?.response?.data?.message]
    .filter(Boolean).join(" ").toUpperCase();
  return value.includes("NÃO ENCONTR") || value.includes("NAO ENCONTR") || value.includes("NOT FOUND") || value.includes("NÃO LOCALIZ") || value.includes("NAO LOCALIZ");
}

function customerCode(result) {
  const data = responseData(result);
  return Number(data.codigo_cliente_omie || data.nCodCli || data.codigoClienteOmie || 0) || 0;
}

module.exports = { callOmie, customerCode, isNotFound, normalizeParam };
