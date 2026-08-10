"use strict";

const { buildOrderCallback, buildReversalCallback, signHmac } = require("./callbackContract");
const { getConfig } = require("./config");
const { models } = require("./runtime");

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function bounded(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }

function callbackSecret(config) {
  const name = String(config.callbackSecretEnv || "TACA_CALLBACK_SECRET").trim();
  return name ? String(process.env[name] || "") : "";
}

function headersFor(config, bodyText) {
  const headers = { "Content-Type": "application/json", "User-Agent": "central-taca-nfse-omie/1" };
  const mode = config.callbackAuthMode || "hmac-sha256";
  const secret = callbackSecret(config);
  if (mode === "bearer" && secret) headers.Authorization = `Bearer ${secret}`;
  if (mode === "hmac-sha256" && secret) headers["X-Taca-Signature"] = signHmac(bodyText, secret);
  return headers;
}

async function postOnce(url, body, config) {
  const bodyText = JSON.stringify(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), bounded(config.callbackTimeoutMs, 5000, 500, 30000));
  try {
    const response = await fetch(url, { method: "POST", headers: headersFor(config, bodyText), body: bodyText, signal: controller.signal });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      const error = new Error(`Callback returned HTTP ${response.status}.`);
      error.httpStatus = response.status;
      error.responseBody = text.slice(0, 500);
      throw error;
    }
    return { httpStatus: response.status, responseBody: text.slice(0, 500) };
  } finally { clearTimeout(timeout); }
}

async function deliver(kind, id, context = {}) {
  const config = await getConfig();
  if (!String(config.callbackUrl || "").trim()) throw new Error("Callback URL is not configured.");
  const { PedidoNfse, EstornoTaca } = models();
  const Model = kind === "reversal" ? EstornoTaca : PedidoNfse;
  const record = await Model.findById(id);
  if (!record) return { ignored: true, reason: "record-not-found" };
  const body = kind === "reversal" ? buildReversalCallback(record) : buildOrderCallback(record);
  const attempts = bounded(config.callbackMaxAttempts, 3, 1, 5);
  const base = bounded(config.callbackBackoffMs, 500, 100, 10000);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await postOnce(config.callbackUrl, body, config);
      const updated = await Model.findByIdAndUpdate(record._id, { $set: {
        callbackStatus: "SENT", callbackAttempts: Number(record.callbackAttempts || 0) + attempt,
        callbackLastHttpStatus: result.httpStatus, callbackLastError: "", callbackSentAt: new Date(),
      } }, { new: true });
      const output = { id: String(record._id), kind, httpStatus: result.httpStatus, status: updated?.callbackStatus };
      context.recordItem?.(output);
      return output;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(Math.min(10000, base * (2 ** (attempt - 1))));
    }
  }
  await Model.findByIdAndUpdate(record._id, { $set: {
    callbackStatus: "ERROR", callbackAttempts: Number(record.callbackAttempts || 0) + attempts,
    callbackLastHttpStatus: Number(lastError?.httpStatus || 0), callbackLastError: String(lastError?.message || lastError).slice(0, 1000),
  } });
  lastError.retryable = false;
  throw lastError;
}

async function handleOrderCallback(event, context) { return deliver("order", event.payload?.orderId || event.aggregateId, context); }
async function handleReversalCallback(event, context) { return deliver("reversal", event.payload?.reversalId || event.aggregateId, context); }

module.exports = { deliver, handleOrderCallback, handleReversalCallback, headersFor, postOnce };
