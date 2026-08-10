"use strict";

const crypto = require("node:crypto");
const { CALLBACK_STATUS, EXTERNAL_STATUS, INTERNAL_STATUS, REVERSAL_STATUS } = require("./constants");
const { defaultAddress, getConfig, requireOperationalConfig } = require("./config");
const { callOmie, customerCode, isNotFound } = require("./omieClient");
const { buildCustomerPayload, buildServiceOrderPayload, normalizeFiscal, normalizeOs, responseData } = require("./omiePayload");
const { enqueueIntegration, models } = require("./runtime");
const { ensureAddressPolicy, maskDocument, resolveAddress, validateOrderPayload } = require("./validation");

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function bounded(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function currentUser(req) { return req?.usuario?.email || req?.usuario?.nome || "system"; }
function json(value) { return JSON.stringify(value || {}); }
function parseJson(value) { try { return JSON.parse(value || "{}"); } catch { return {}; } }
function fingerprint(order) { return crypto.createHash("sha256").update(JSON.stringify({ integrationCode: order.integrationCode, amount: order.amount, document: order.customer.document })).digest("hex"); }

function externalOrder(order) {
  const result = { integrationCode: order.integrationCode, status: order.externalStatus };
  if (order.numeroNfse || order.codigoVerificacaoNfse || order.urlNfse || order.urlPdfNfse) result.invoice = { number: order.numeroNfse || "", verificationCode: order.codigoVerificacaoNfse || "", url: order.urlNfse || order.urlPdfNfse || "" };
  if (order.externalStatus === EXTERNAL_STATUS.ERROR && order.lastError) result.message = order.lastError;
  return result;
}
function externalReversal(reversal) { return { integrationCode: reversal.integrationCode, status: reversal.externalStatus }; }

async function upsertLocalCustomer(validated, resolved) {
  const { ClienteTaca } = models();
  const doc = validated.customer.document;
  const update = { documentoMascarado: maskDocument(doc), razaoSocial: validated.customer.legalName, nomeFantasia: validated.customer.tradeName, email: validated.customer.email, enderecoEfetivoJson: json(resolved.address), origemEnderecoJson: json(resolved.origin) };
  try {
    return await ClienteTaca.findOneAndUpdate({ documentoNormalizado: doc }, { $set: update, $setOnInsert: { documentoNormalizado: doc } }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return ClienteTaca.findOne({ documentoNormalizado: doc });
  }
}

async function receiveOrder(payload) {
  const validated = validateOrderPayload(payload);
  const fp = fingerprint(validated);
  const { PedidoNfse } = models();
  const existing = await PedidoNfse.findOne({ integrationCode: validated.integrationCode });
  if (existing) {
    if (existing.requestFingerprint !== fp) { const error = new Error("integrationCode already exists with a different amount or customer document."); error.statusCode = 409; error.code = "IDEMPOTENCY_CONFLICT"; throw error; }
    return { created: false, order: existing };
  }
  const config = await getConfig();
  const resolved = ensureAddressPolicy(resolveAddress(validated.customer.address, defaultAddress(config)), Boolean(config.allowIssuanceWithoutAddress));
  const customer = await upsertLocalCustomer(validated, resolved);
  let order;
  try {
    order = await PedidoNfse.create({ integrationCode: validated.integrationCode, amount: validated.amount, requestFingerprint: fp, clienteId: customer._id, documentoNormalizado: validated.customer.document, documentoMascarado: maskDocument(validated.customer.document), customerLegalName: validated.customer.legalName, customerTradeName: validated.customer.tradeName, customerEmail: validated.customer.email, simpleNationalTaxpayer: validated.customer.simpleNationalTaxpayer, enderecoEfetivoJson: json(resolved.address), origemEnderecoJson: json(resolved.origin), statusInterno: INTERNAL_STATUS.RECEIVED, externalStatus: EXTERNAL_STATUS.RECEIVED, receivedAt: new Date(), callbackStatus: CALLBACK_STATUS.NOT_REQUIRED });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    order = await PedidoNfse.findOne({ integrationCode: validated.integrationCode });
    if (!order || order.requestFingerprint !== fp) throw error;
    return { created: false, order };
  }
  const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_PROCESSAR_PEDIDO", resource: "orders", operation: "issue-invoice", aggregateType: "PedidoNfse", aggregateId: String(order._id), idempotencyKey: `taca:order:${order.integrationCode}:issue:v1`, payload: { orderId: String(order._id) } });
  return { created: true, order, ticketId: String(ticket?._id || "") };
}

async function syncCustomer(order, config, context) {
  const { ClienteTaca, PedidoNfse } = models();
  const customer = await ClienteTaca.findById(order.clienteId);
  if (!customer) throw new Error("Cliente local do pedido não encontrado.");
  if (Number(customer.codigoClienteOmie) > 0) {
    if (Number(order.codigoClienteOmie) !== Number(customer.codigoClienteOmie)) await PedidoNfse.findByIdAndUpdate(order._id, { $set: { codigoClienteOmie: customer.codigoClienteOmie, statusInterno: INTERNAL_STATUS.CUSTOMER_SYNCED, externalStatus: EXTERNAL_STATUS.CUSTOMER_SYNCED, customerSyncedAt: new Date(), lastError: "" } });
    return Number(customer.codigoClienteOmie);
  }
  const result = await callOmie("upsert-customer-by-document", config.instanceId, buildCustomerPayload({ documentoNormalizado: order.documentoNormalizado, customerLegalName: order.customerLegalName, customerTradeName: order.customerTradeName, customerEmail: order.customerEmail, simpleNationalTaxpayer: order.simpleNationalTaxpayer, address: parseJson(order.enderecoEfetivoJson) }, config), context);
  const code = customerCode(result);
  if (!(code > 0)) throw new Error("Omie não retornou codigo_cliente_omie no UpsertClienteCpfCnpj.");
  const now = new Date();
  await ClienteTaca.findByIdAndUpdate(customer._id, { $set: { codigoClienteOmie: code, sincronizadoEm: now, ultimoErro: "" } });
  await PedidoNfse.findByIdAndUpdate(order._id, { $set: { codigoClienteOmie: code, statusInterno: INTERNAL_STATUS.CUSTOMER_SYNCED, externalStatus: EXTERNAL_STATUS.CUSTOMER_SYNCED, customerSyncedAt: now, lastError: "" } });
  return code;
}

async function consultServiceOrder(order, config, context) {
  try {
    const result = await callOmie("consult-service-order", config.instanceId, { cCodIntOS: order.integrationCode }, context);
    const normalized = normalizeOs(result);
    return normalized.codigoOsOmie > 0 ? { ...normalized, result } : null;
  } catch (error) { if (isNotFound(error)) return null; throw error; }
}

async function ensureServiceOrder(order, customerOmieCode, config, context) {
  const { PedidoNfse } = models();
  if (Number(order.codigoOsOmie) > 0) return order;
  let found = await consultServiceOrder(order, config, context);
  if (!found) {
    try {
      const result = await callOmie("include-service-order", config.instanceId, buildServiceOrderPayload({ integrationCode: order.integrationCode, amount: order.amount, customerEmail: order.customerEmail }, customerOmieCode, config), context);
      const data = responseData(result);
      found = { codigoOsOmie: Number(data.nCodOS || data.codigo_os || data.codigoOs || 0) || 0, numeroOs: String(data.cNumOS || data.numero_os || "").trim() };
    } catch (error) {
      const reconciled = await consultServiceOrder(order, config, context).catch(() => null);
      if (!reconciled) throw error;
      found = reconciled;
    }
  }
  if (!(Number(found?.codigoOsOmie) > 0)) { const reconciled = await consultServiceOrder(order, config, context); if (!reconciled) throw new Error("Omie não retornou nem permitiu reconciliar nCodOS após IncluirOS."); found = reconciled; }
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { codigoOsOmie: found.codigoOsOmie, numeroOs: found.numeroOs || order.numeroOs || "", statusInterno: INTERNAL_STATUS.SERVICE_ORDER_CREATED, externalStatus: EXTERNAL_STATUS.SERVICE_ORDER_CREATED, serviceOrderCreatedAt: new Date(), lastError: "" } }, { new: true });
}

async function enqueueOrderCallback(order) {
  const { PedidoNfse } = models();
  const revision = Number(order.callbackRevision || 0) + 1;
  const updated = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { callbackStatus: CALLBACK_STATUS.PENDING, callbackRevision: revision } }, { new: true });
  const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_ENVIAR_CALLBACK_PEDIDO", resource: "callbacks", operation: "order-callback", aggregateType: "PedidoNfse", aggregateId: String(order._id), idempotencyKey: `taca:order:${order.integrationCode}:callback:r${revision}`, payload: { orderId: String(order._id) } });
  return { order: updated, ticketId: String(ticket?._id || "") };
}

async function applyFiscal(order, fiscal) {
  const { PedidoNfse } = models();
  const common = { fiscalStatusCode: fiscal.statusCode, numeroRps: fiscal.rpsNumber, fiscalMessage: fiscal.message, numeroOs: fiscal.os.numeroOs || order.numeroOs || "", codigoOsOmie: fiscal.os.codigoOsOmie || order.codigoOsOmie };
  if (fiscal.state === "ISSUED") {
    const updated = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { ...common, statusInterno: INTERNAL_STATUS.INVOICE_ISSUED, externalStatus: EXTERNAL_STATUS.INVOICE_ISSUED, numeroNfse: fiscal.invoiceNumber, codigoVerificacaoNfse: fiscal.verificationCode, urlNfse: fiscal.url, urlPdfNfse: fiscal.pdfUrl, invoiceConfirmedAt: new Date(), lastError: "" } }, { new: true });
    if (updated.callbackStatus !== CALLBACK_STATUS.SENT) await enqueueOrderCallback(updated);
    return { terminal: true, order: updated };
  }
  if (["ERROR", "CANCELLED"].includes(fiscal.state)) {
    const message = fiscal.message || (fiscal.state === "CANCELLED" ? "NFS-e cancelled in Omie." : "NFS-e processing failed in Omie.");
    const updated = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { ...common, statusInterno: INTERNAL_STATUS.ERROR, externalStatus: EXTERNAL_STATUS.ERROR, lastError: message } }, { new: true });
    if (updated.callbackStatus !== CALLBACK_STATUS.SENT) await enqueueOrderCallback(updated);
    return { terminal: true, order: updated };
  }
  return { terminal: false, order: await PedidoNfse.findByIdAndUpdate(order._id, { $set: { ...common, statusInterno: INTERNAL_STATUS.INVOICE_PROCESSING, externalStatus: EXTERNAL_STATUS.INVOICE_PROCESSING, lastError: "" } }, { new: true }) };
}

async function reconcileFiscal(order, config, context, { boundedPolling = false } = {}) {
  const { PedidoNfse } = models();
  const attempts = boundedPolling ? bounded(config.fiscalCheckAttempts, 3, 1, 8) : 1;
  const base = bounded(config.fiscalCheckBackoffMs, 1000, 250, 15000);
  let current = order;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await callOmie("consult-service-order", config.instanceId, { cCodIntOS: current.integrationCode }, context);
    current = await PedidoNfse.findByIdAndUpdate(current._id, { $inc: { fiscalCheckAttempts: 1 } }, { new: true });
    const applied = await applyFiscal(current, normalizeFiscal(result));
    current = applied.order;
    if (applied.terminal) return applied;
    if (attempt < attempts) await sleep(Math.min(15000, base * (2 ** (attempt - 1))));
  }
  return { terminal: false, order: current, pending: true };
}

async function processOrder(event, context = {}) {
  const { PedidoNfse } = models();
  let order = await PedidoNfse.findById(event.payload?.orderId || event.aggregateId);
  if (!order) return { ignored: true, reason: "order-not-found" };
  if (order.externalStatus === EXTERNAL_STATUS.INVOICE_ISSUED) return { ignored: true, reason: "already-issued", order: externalOrder(order) };
  const config = requireOperationalConfig(await getConfig());
  try {
    order = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { statusInterno: INTERNAL_STATUS.VALIDATED, externalStatus: EXTERNAL_STATUS.VALIDATED, validatedAt: order.validatedAt || new Date(), lastError: "" } }, { new: true });
    const code = await syncCustomer(order, config, context);
    order = await ensureServiceOrder(await PedidoNfse.findById(order._id), code, config, context);
    const beforeBilling = await consultServiceOrder(order, config, context);
    if (beforeBilling) {
      const fiscal = normalizeFiscal(beforeBilling.result || beforeBilling.raw || beforeBilling);
      if (beforeBilling.faturada || fiscal.statusCode) { const applied = await applyFiscal(order, fiscal); order = applied.order; if (applied.terminal) return externalOrder(order); if (beforeBilling.faturada) return externalOrder((await reconcileFiscal(order, config, context, { boundedPolling: true })).order); }
    }
    try { await callOmie("bill-service-order", config.instanceId, { cCodIntOS: order.integrationCode, nCodOS: Number(order.codigoOsOmie) }, context); }
    catch (billingError) {
      const reconciled = await consultServiceOrder(order, config, context).catch(() => null);
      if (reconciled) { const fiscal = normalizeFiscal(reconciled.result || reconciled.raw || reconciled); if (reconciled.faturada || fiscal.statusCode) { const applied = await applyFiscal(order, fiscal); order = applied.order; if (applied.terminal) return externalOrder(order); if (reconciled.faturada) return externalOrder((await reconcileFiscal(order, config, context, { boundedPolling: true })).order); } }
      throw billingError;
    }
    order = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { faturamentoSolicitadoEm: new Date(), statusInterno: INTERNAL_STATUS.INVOICE_PROCESSING, externalStatus: EXTERNAL_STATUS.INVOICE_PROCESSING, lastError: "" } }, { new: true });
    const output = externalOrder((await reconcileFiscal(order, config, context, { boundedPolling: true })).order);
    context.recordItem?.(output); return output;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000); const statusCode = Number(error?.statusCode || error?.response?.status || 0);
    const definitive = error?.retryable === false || (statusCode >= 400 && statusCode < 500 && ![408, 409, 425, 429].includes(statusCode));
    if (definitive) { order = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { statusInterno: INTERNAL_STATUS.ERROR, externalStatus: EXTERNAL_STATUS.ERROR, lastError: message } }, { new: true }); if (order && order.callbackStatus !== CALLBACK_STATUS.SENT) await enqueueOrderCallback(order).catch(() => {}); error.retryable = false; }
    else { await PedidoNfse.findByIdAndUpdate(order._id, { $set: { lastError: message } }); error.retryable = true; }
    throw error;
  }
}

async function handleFiscalReconcile(event, context = {}) {
  const { PedidoNfse } = models(); const order = await PedidoNfse.findById(event.payload?.orderId || event.aggregateId);
  if (!order) return { ignored: true, reason: "order-not-found" }; if (order.externalStatus === EXTERNAL_STATUS.INVOICE_ISSUED) return externalOrder(order);
  return externalOrder((await reconcileFiscal(order, requireOperationalConfig(await getConfig()), context, { boundedPolling: true })).order);
}
function findDeep(value, keys, depth = 0) { if (!value || depth > 6 || typeof value !== "object") return undefined; for (const key of keys) if (value[key] !== undefined && value[key] !== null && String(value[key]).trim()) return value[key]; for (const child of Object.values(value)) { const found = findDeep(child, keys, depth + 1); if (found !== undefined) return found; } return undefined; }
async function handleOmieWebhook(event, context = {}) {
  const { PedidoNfse } = models(); const body = event.payload?.body || event.payload || {};
  const integrationCode = String(findDeep(body, ["cCodIntOS", "codigo_integracao_os", "integrationCode"]) || "").trim(); const osCode = Number(findDeep(body, ["nCodOS", "codigo_os", "codigoOs"]) || 0) || 0; const invoiceNumber = String(findDeep(body, ["nNfse", "numero_nfse", "numeroNfse"]) || "").trim();
  let order = integrationCode ? await PedidoNfse.findOne({ integrationCode }) : null; if (!order && osCode > 0) order = await PedidoNfse.findOne({ codigoOsOmie: osCode }); if (!order && invoiceNumber) order = await PedidoNfse.findOne({ numeroNfse: invoiceNumber });
  if (!order) return { ignored: true, reason: "order-not-correlated" }; if (order.externalStatus === EXTERNAL_STATUS.INVOICE_ISSUED) return { ignored: true, reason: "already-issued" };
  return externalOrder((await reconcileFiscal(order, requireOperationalConfig(await getConfig()), context, { boundedPolling: false })).order);
}

async function requestReversal(integrationCode, requestedBy) {
  const { PedidoNfse, EstornoTaca } = models(); const order = await PedidoNfse.findOne({ integrationCode: String(integrationCode || "").trim() });
  if (!order) { const error = new Error("Order not found."); error.statusCode = 404; error.code = "ORDER_NOT_FOUND"; throw error; }
  if (order.externalStatus !== EXTERNAL_STATUS.INVOICE_ISSUED) { const error = new Error("Reversal is allowed only after the invoice has been issued."); error.statusCode = 409; error.code = "REVERSAL_NOT_ALLOWED"; throw error; }
  let reversal = await EstornoTaca.findOne({ integrationCode: order.integrationCode }); if (reversal) return { created: false, reversal };
  try { reversal = await EstornoTaca.create({ integrationCode: order.integrationCode, pedidoId: order._id, status: REVERSAL_STATUS.PENDING, externalStatus: EXTERNAL_STATUS.REVERSAL_PENDING, ticketKey: `taca:reversal:${order.integrationCode}`, requestedAt: new Date(), requestedBy, invoiceNumber: order.numeroNfse || "", verificationCode: order.codigoVerificacaoNfse || "", invoiceUrl: order.urlNfse || order.urlPdfNfse || "", callbackStatus: CALLBACK_STATUS.NOT_REQUIRED }); }
  catch (error) { if (error?.code !== 11000) throw error; reversal = await EstornoTaca.findOne({ integrationCode: order.integrationCode }); return { created: false, reversal }; }
  return { created: true, reversal };
}
async function enqueueReversalCallback(reversal) {
  const { EstornoTaca } = models(); const revision = Number(reversal.callbackRevision || 0) + 1;
  const updated = await EstornoTaca.findByIdAndUpdate(reversal._id, { $set: { callbackStatus: CALLBACK_STATUS.PENDING, callbackRevision: revision } }, { new: true });
  const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_ENVIAR_CALLBACK_ESTORNO", resource: "callbacks", operation: "reversal-callback", aggregateType: "EstornoTaca", aggregateId: String(reversal._id), idempotencyKey: `taca:reversal:${reversal.integrationCode}:callback:r${revision}`, payload: { reversalId: String(reversal._id) } });
  return { reversal: updated, ticketId: String(ticket?._id || "") };
}
async function confirmReversal(id, { user, note } = {}) {
  const { EstornoTaca } = models(); let reversal = await EstornoTaca.findOneAndUpdate({ _id: id, status: REVERSAL_STATUS.PENDING }, { $set: { status: REVERSAL_STATUS.COMPLETED, externalStatus: EXTERNAL_STATUS.REVERSED, confirmedAt: new Date(), confirmedBy: user || "system", confirmationNote: String(note || "") } }, { new: true, runValidators: true });
  if (!reversal) { reversal = await EstornoTaca.findById(id); if (!reversal) { const error = new Error("Reversal ticket not found."); error.statusCode = 404; throw error; } if (reversal.status !== REVERSAL_STATUS.COMPLETED) { const error = new Error("Reversal ticket cannot be confirmed."); error.statusCode = 409; throw error; } }
  if (reversal.callbackStatus !== CALLBACK_STATUS.SENT) await enqueueReversalCallback(reversal); return reversal;
}
async function resendOrderCallback(id) { const { PedidoNfse } = models(); const order = await PedidoNfse.findById(id); if (!order) { const error = new Error("Order not found."); error.statusCode = 404; throw error; } return enqueueOrderCallback(order); }
async function resendReversalCallback(id) { const { EstornoTaca } = models(); const reversal = await EstornoTaca.findById(id); if (!reversal) { const error = new Error("Reversal not found."); error.statusCode = 404; throw error; } if (reversal.status !== REVERSAL_STATUS.COMPLETED) { const error = new Error("Reversal callback is available only after manual confirmation."); error.statusCode = 409; throw error; } return enqueueReversalCallback(reversal); }
async function enqueueFiscalReconcile(id) {
  const { PedidoNfse } = models(); const order = await PedidoNfse.findById(id); if (!order) { const error = new Error("Order not found."); error.statusCode = 404; throw error; }
  const revision = Number(order.fiscalCheckAttempts || 0) + 1; const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_RECONCILIAR_NFSE", resource: "orders", operation: "reconcile-invoice", aggregateType: "PedidoNfse", aggregateId: String(order._id), idempotencyKey: `taca:order:${order.integrationCode}:reconcile:${revision}`, payload: { orderId: String(order._id) } });
  return { order: externalOrder(order), ticketId: String(ticket?._id || "") };
}

module.exports = { confirmReversal, currentUser, enqueueFiscalReconcile, externalOrder, externalReversal, handleFiscalReconcile, handleOmieWebhook, processOrder, receiveOrder, requestReversal, resendOrderCallback, resendReversalCallback };
