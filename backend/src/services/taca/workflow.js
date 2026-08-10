"use strict";

const crypto = require("node:crypto");
const {
  CALLBACK_STATUS,
  EXTERNAL_STATUS,
  INTERNAL_STATUS,
  ORDER_STAGE,
  REVERSAL_STAGE,
  REVERSAL_STATUS,
} = require("./constants");
const { defaultAddress, getConfig, requireOperationalConfig } = require("./config");
const { callOmie, customerCode, isNotFound } = require("./omieClient");
const { buildCustomerPayload, buildServiceOrderPayload, normalizeFiscal, normalizeOs, responseData } = require("./omiePayload");
const { enqueueIntegration, models } = require("./runtime");
const { ensureAddressPolicy, maskDocument, resolveAddress, validateOrderPayload } = require("./validation");

const ORDER_AUTOMATION = Object.freeze({
  [ORDER_STAGE.APPROVAL]: "automatizarAprovacao",
  [ORDER_STAGE.CUSTOMER_SYNC]: "automatizarSincronizacaoCliente",
  [ORDER_STAGE.CREATE_SERVICE_ORDER]: "automatizarCriacaoOs",
  [ORDER_STAGE.GENERATE_INVOICE]: "automatizarGeracaoNf",
  [ORDER_STAGE.AWAIT_BILLING_RETURN]: "automatizarRetornoFaturamento",
  [ORDER_STAGE.FINANCIAL_SETTLEMENT]: "automatizarBaixaFinanceira",
  [ORDER_STAGE.NOTIFY_PLATFORM]: "automatizarNotificacaoPlataforma",
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function bounded(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function currentUser(req) { return req?.usuario?.email || req?.usuario?.nome || "system"; }
function json(value) { return JSON.stringify(value || {}); }
function parseJson(value) { try { return JSON.parse(value || "{}"); } catch { return {}; } }
function fingerprint(order) { return crypto.createHash("sha256").update(JSON.stringify({ integrationCode: order.integrationCode, amount: order.amount, document: order.customer.document })).digest("hex"); }
function safeKey(value) { return String(value || "stage").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase(); }

function externalOrder(order) {
  const result = { integrationCode: order.integrationCode, status: order.externalStatus };
  if (order.numeroNfse || order.codigoVerificacaoNfse || order.urlNfse || order.urlPdfNfse) result.invoice = { number: order.numeroNfse || "", verificationCode: order.codigoVerificacaoNfse || "", url: order.urlNfse || order.urlPdfNfse || "" };
  if (order.externalStatus === EXTERNAL_STATUS.ERROR && order.lastError) result.message = order.lastError;
  return result;
}
function externalReversal(reversal) { return { integrationCode: reversal.integrationCode, status: reversal.externalStatus }; }

function stageFromLegacyStatus(order) {
  if (order?.etapa) return order.etapa;
  if (order?.callbackStatus === CALLBACK_STATUS.SENT && order?.externalStatus === EXTERNAL_STATUS.INVOICE_ISSUED) return ORDER_STAGE.COMPLETED;
  switch (order?.externalStatus) {
    case EXTERNAL_STATUS.VALIDATED: return ORDER_STAGE.CUSTOMER_SYNC;
    case EXTERNAL_STATUS.CUSTOMER_SYNCED: return ORDER_STAGE.CREATE_SERVICE_ORDER;
    case EXTERNAL_STATUS.SERVICE_ORDER_CREATED: return ORDER_STAGE.GENERATE_INVOICE;
    case EXTERNAL_STATUS.INVOICE_PROCESSING: return ORDER_STAGE.AWAIT_BILLING_RETURN;
    case EXTERNAL_STATUS.INVOICE_ISSUED: return ORDER_STAGE.FINANCIAL_SETTLEMENT;
    default: return ORDER_STAGE.APPROVAL;
  }
}

async function ensureOrderStage(order) {
  if (!order || order.etapa) return order;
  const { PedidoNfse } = models();
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { etapa: stageFromLegacyStatus(order) } }, { new: true });
}

async function ensureReversalStage(reversal) {
  if (!reversal || reversal.etapa) return reversal;
  const { EstornoTaca } = models();
  const etapa = reversal.status === REVERSAL_STATUS.COMPLETED
    ? REVERSAL_STAGE.COMPLETED
    : reversal.confirmedAt ? REVERSAL_STAGE.NOTIFY_PLATFORM : REVERSAL_STAGE.REQUEST;
  return EstornoTaca.findByIdAndUpdate(reversal._id, { $set: { etapa } }, { new: true });
}

function automaticStage(config, stage) {
  const field = ORDER_AUTOMATION[stage];
  return Boolean(field && config?.[field]);
}

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

async function enqueueOrderStage(orderOrId, { source = "manual", user = "system" } = {}) {
  const { PedidoNfse } = models();
  let order = typeof orderOrId === "object" && orderOrId?._id ? orderOrId : await PedidoNfse.findById(orderOrId);
  if (!order) { const error = new Error("Order not found."); error.statusCode = 404; throw error; }
  order = await ensureOrderStage(order);
  if (order.etapa === ORDER_STAGE.COMPLETED) return { ignored: true, reason: "already-completed", order: externalOrder(order) };

  const config = await getConfig();
  if (source === "automatic" && !automaticStage(config, order.etapa)) return { ignored: true, reason: "stage-is-manual", stage: order.etapa };

  order = await PedidoNfse.findByIdAndUpdate(order._id, { $inc: { stageRevision: 1 } }, { new: true });
  const revision = Number(order.stageRevision || 1);
  const expectedStage = order.etapa;
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TACA_PROCESSAR_ETAPA_PEDIDO",
    resource: "orders",
    operation: `stage-${safeKey(expectedStage)}`,
    aggregateType: "PedidoNfse",
    aggregateId: String(order._id),
    idempotencyKey: `taca:order:${order.integrationCode}:stage:${safeKey(expectedStage)}:r${revision}`,
    payload: { orderId: String(order._id), expectedStage, source, user, revision },
  });
  return { accepted: true, stage: expectedStage, ticketId: String(ticket?._id || ""), order: externalOrder(order) };
}

async function continueAutomaticOrder(order, config) {
  if (!order || order.etapa === ORDER_STAGE.COMPLETED || !automaticStage(config, order.etapa)) return null;
  return enqueueOrderStage(order, { source: "automatic", user: "system" });
}

async function receiveOrder(payload) {
  const validated = validateOrderPayload(payload);
  const fp = fingerprint(validated);
  const { PedidoNfse } = models();
  const existing = await PedidoNfse.findOne({ integrationCode: validated.integrationCode });
  if (existing) {
    if (existing.requestFingerprint !== fp) { const error = new Error("integrationCode already exists with a different amount or customer document."); error.statusCode = 409; error.code = "IDEMPOTENCY_CONFLICT"; throw error; }
    return { created: false, order: await ensureOrderStage(existing) };
  }
  const config = await getConfig();
  const resolved = ensureAddressPolicy(resolveAddress(validated.customer.address, defaultAddress(config)), Boolean(config.allowIssuanceWithoutAddress));
  const customer = await upsertLocalCustomer(validated, resolved);
  let order;
  try {
    order = await PedidoNfse.create({ integrationCode: validated.integrationCode, amount: validated.amount, requestFingerprint: fp, clienteId: customer._id, documentoNormalizado: validated.customer.document, documentoMascarado: maskDocument(validated.customer.document), customerLegalName: validated.customer.legalName, customerTradeName: validated.customer.tradeName, customerEmail: validated.customer.email, simpleNationalTaxpayer: validated.customer.simpleNationalTaxpayer, enderecoEfetivoJson: json(resolved.address), origemEnderecoJson: json(resolved.origin), etapa: ORDER_STAGE.APPROVAL, statusInterno: INTERNAL_STATUS.RECEIVED, externalStatus: EXTERNAL_STATUS.RECEIVED, receivedAt: new Date(), callbackStatus: CALLBACK_STATUS.NOT_REQUIRED });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    order = await PedidoNfse.findOne({ integrationCode: validated.integrationCode });
    if (!order || order.requestFingerprint !== fp) throw error;
    return { created: false, order: await ensureOrderStage(order) };
  }
  const automatic = await continueAutomaticOrder(order, config);
  return { created: true, order, ticketId: automatic?.ticketId || "" };
}

async function syncCustomer(order, config, context) {
  const { ClienteTaca, PedidoNfse } = models();
  const customer = await ClienteTaca.findById(order.clienteId);
  if (!customer) throw new Error("Cliente local do pedido não encontrado.");
  if (Number(customer.codigoClienteOmie) > 0) {
    if (Number(order.codigoClienteOmie) !== Number(customer.codigoClienteOmie)) {
      await PedidoNfse.findByIdAndUpdate(order._id, { $set: { codigoClienteOmie: customer.codigoClienteOmie, statusInterno: INTERNAL_STATUS.CUSTOMER_SYNCED, externalStatus: EXTERNAL_STATUS.CUSTOMER_SYNCED, customerSyncedAt: new Date(), lastError: "" } });
    }
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
  if (!(Number(found?.codigoOsOmie) > 0)) {
    const reconciled = await consultServiceOrder(order, config, context);
    if (!reconciled) throw new Error("Omie não retornou nem permitiu reconciliar nCodOS após IncluirOS.");
    found = reconciled;
  }
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { codigoOsOmie: found.codigoOsOmie, numeroOs: found.numeroOs || order.numeroOs || "", statusInterno: INTERNAL_STATUS.SERVICE_ORDER_CREATED, externalStatus: EXTERNAL_STATUS.SERVICE_ORDER_CREATED, serviceOrderCreatedAt: new Date(), lastError: "" } }, { new: true });
}

async function enqueueOrderCallback(order) {
  const { PedidoNfse } = models();
  if (order.callbackStatus === CALLBACK_STATUS.SENT) return { order, alreadySent: true };
  const revision = Number(order.callbackRevision || 0) + 1;
  const updated = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { callbackStatus: CALLBACK_STATUS.PENDING, callbackRevision: revision } }, { new: true });
  const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_ENVIAR_CALLBACK_PEDIDO", resource: "callbacks", operation: "order-callback", aggregateType: "PedidoNfse", aggregateId: String(order._id), idempotencyKey: `taca:order:${order.integrationCode}:callback:r${revision}`, payload: { orderId: String(order._id) } });
  return { order: updated, ticketId: String(ticket?._id || "") };
}

async function applyFiscal(order, fiscal) {
  const { PedidoNfse } = models();
  const common = { fiscalStatusCode: fiscal.statusCode, numeroRps: fiscal.rpsNumber, fiscalMessage: fiscal.message, numeroOs: fiscal.os.numeroOs || order.numeroOs || "", codigoOsOmie: fiscal.os.codigoOsOmie || order.codigoOsOmie };
  if (fiscal.state === "ISSUED") {
    const updated = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { ...common, etapa: ORDER_STAGE.FINANCIAL_SETTLEMENT, statusInterno: INTERNAL_STATUS.INVOICE_ISSUED, externalStatus: EXTERNAL_STATUS.INVOICE_ISSUED, numeroNfse: fiscal.invoiceNumber, codigoVerificacaoNfse: fiscal.verificationCode, urlNfse: fiscal.url, urlPdfNfse: fiscal.pdfUrl, invoiceConfirmedAt: new Date(), lastError: "" } }, { new: true });
    return { terminal: true, order: updated };
  }
  if (["ERROR", "CANCELLED"].includes(fiscal.state)) {
    const message = fiscal.message || (fiscal.state === "CANCELLED" ? "NFS-e cancelled in Omie." : "NFS-e processing failed in Omie.");
    const updated = await PedidoNfse.findByIdAndUpdate(order._id, { $set: { ...common, statusInterno: INTERNAL_STATUS.ERROR, externalStatus: EXTERNAL_STATUS.ERROR, lastError: message } }, { new: true });
    return { terminal: true, order: updated, error: true };
  }
  return { terminal: false, order: await PedidoNfse.findByIdAndUpdate(order._id, { $set: { ...common, etapa: ORDER_STAGE.AWAIT_BILLING_RETURN, statusInterno: INTERNAL_STATUS.INVOICE_PROCESSING, externalStatus: EXTERNAL_STATUS.INVOICE_PROCESSING, lastError: "" } }, { new: true }) };
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

async function approveOrder(order) {
  const { PedidoNfse } = models();
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { etapa: ORDER_STAGE.CUSTOMER_SYNC, statusInterno: INTERNAL_STATUS.VALIDATED, externalStatus: EXTERNAL_STATUS.VALIDATED, validatedAt: order.validatedAt || new Date(), lastError: "" } }, { new: true });
}

async function syncCustomerStage(order, config, context) {
  const { PedidoNfse } = models();
  await syncCustomer(order, config, context);
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { etapa: ORDER_STAGE.CREATE_SERVICE_ORDER, lastError: "" } }, { new: true });
}

async function createServiceOrderStage(order, config, context) {
  const { PedidoNfse } = models();
  const customerCodeValue = Number(order.codigoClienteOmie) > 0 ? Number(order.codigoClienteOmie) : await syncCustomer(order, config, context);
  await ensureServiceOrder(await PedidoNfse.findById(order._id), customerCodeValue, config, context);
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { etapa: ORDER_STAGE.GENERATE_INVOICE, lastError: "" } }, { new: true });
}

async function generateInvoiceStage(order, config, context) {
  const { PedidoNfse } = models();
  let current = await PedidoNfse.findById(order._id);
  if (!(Number(current.codigoOsOmie) > 0)) {
    const error = new Error("A Ordem de Serviço ainda não foi criada no Omie.");
    error.statusCode = 409;
    error.retryable = false;
    throw error;
  }

  const beforeBilling = await consultServiceOrder(current, config, context);
  if (beforeBilling) {
    const fiscal = normalizeFiscal(beforeBilling.result || beforeBilling.raw || beforeBilling);
    if (beforeBilling.faturada || fiscal.statusCode) {
      const applied = await applyFiscal(current, fiscal);
      if (applied.terminal || beforeBilling.faturada || fiscal.statusCode) return applied.order;
    }
  }

  try {
    await callOmie("bill-service-order", config.instanceId, { cCodIntOS: current.integrationCode, nCodOS: Number(current.codigoOsOmie) }, context);
  } catch (billingError) {
    const reconciled = await consultServiceOrder(current, config, context).catch(() => null);
    if (reconciled) {
      const fiscal = normalizeFiscal(reconciled.result || reconciled.raw || reconciled);
      if (reconciled.faturada || fiscal.statusCode) return (await applyFiscal(current, fiscal)).order;
    }
    throw billingError;
  }

  current = await PedidoNfse.findByIdAndUpdate(current._id, { $set: { faturamentoSolicitadoEm: new Date(), etapa: ORDER_STAGE.AWAIT_BILLING_RETURN, statusInterno: INTERNAL_STATUS.INVOICE_PROCESSING, externalStatus: EXTERNAL_STATUS.INVOICE_PROCESSING, lastError: "" } }, { new: true });
  return current;
}

async function awaitBillingStage(order, config, context) {
  return (await reconcileFiscal(order, config, context, { boundedPolling: true })).order;
}

async function financialSettlementStage(order, user) {
  const { PedidoNfse } = models();
  return PedidoNfse.findByIdAndUpdate(order._id, { $set: { etapa: ORDER_STAGE.NOTIFY_PLATFORM, baixaFinanceiraConfirmadaEm: new Date(), baixaFinanceiraConfirmadaPor: user || "system", lastError: "" } }, { new: true });
}

async function notifyPlatformStage(order) {
  await enqueueOrderCallback(order);
  return order;
}

async function processOrderStage(event, context = {}) {
  const { PedidoNfse } = models();
  let order = await PedidoNfse.findById(event.payload?.orderId || event.aggregateId);
  if (!order) return { ignored: true, reason: "order-not-found" };
  order = await ensureOrderStage(order);
  const expectedStage = String(event.payload?.expectedStage || order.etapa);
  if (expectedStage !== order.etapa) return { ignored: true, reason: "stale-stage-ticket", expectedStage, currentStage: order.etapa };
  if (order.etapa === ORDER_STAGE.COMPLETED) return { ignored: true, reason: "already-completed", order: externalOrder(order) };

  const previousStage = order.etapa;
  const user = String(event.payload?.user || "system");
  const config = await getConfig();
  try {
    switch (order.etapa) {
      case ORDER_STAGE.APPROVAL:
        order = await approveOrder(order);
        break;
      case ORDER_STAGE.CUSTOMER_SYNC:
        order = await syncCustomerStage(order, config, context);
        break;
      case ORDER_STAGE.CREATE_SERVICE_ORDER:
        order = await createServiceOrderStage(order, requireOperationalConfig(config), context);
        break;
      case ORDER_STAGE.GENERATE_INVOICE:
        order = await generateInvoiceStage(order, requireOperationalConfig(config), context);
        break;
      case ORDER_STAGE.AWAIT_BILLING_RETURN:
        order = await awaitBillingStage(order, requireOperationalConfig(config), context);
        break;
      case ORDER_STAGE.FINANCIAL_SETTLEMENT:
        order = await financialSettlementStage(order, user);
        break;
      case ORDER_STAGE.NOTIFY_PLATFORM:
        order = await notifyPlatformStage(order);
        break;
      default: {
        const error = new Error(`Etapa de pedido não suportada: ${order.etapa}`);
        error.statusCode = 409;
        error.retryable = false;
        throw error;
      }
    }

    const output = { ...externalOrder(order), stage: order.etapa };
    context.recordItem?.(output);
    if (order.etapa !== previousStage) await continueAutomaticOrder(order, config);
    return output;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    const statusCode = Number(error?.statusCode || error?.response?.status || 0);
    const definitive = error?.retryable === false || (statusCode >= 400 && statusCode < 500 && ![408, 409, 425, 429].includes(statusCode));
    const patch = { lastError: message };
    if (definitive) Object.assign(patch, { statusInterno: INTERNAL_STATUS.ERROR, externalStatus: EXTERNAL_STATUS.ERROR });
    await PedidoNfse.findByIdAndUpdate(order._id, { $set: patch });
    error.retryable = !definitive;
    throw error;
  }
}

async function legacyProcessOrder(event) {
  const { PedidoNfse } = models();
  const order = await PedidoNfse.findById(event.payload?.orderId || event.aggregateId);
  if (order) await ensureOrderStage(order);
  return { ignored: true, reason: "legacy-full-flow-disabled-use-process-pipeline" };
}

async function handleFiscalReconcile(event, context = {}) {
  const { PedidoNfse } = models();
  let order = await PedidoNfse.findById(event.payload?.orderId || event.aggregateId);
  if (!order) return { ignored: true, reason: "order-not-found" };
  order = await ensureOrderStage(order);
  if (order.externalStatus === EXTERNAL_STATUS.INVOICE_ISSUED && order.etapa !== ORDER_STAGE.AWAIT_BILLING_RETURN) return externalOrder(order);
  const config = requireOperationalConfig(await getConfig());
  const previousStage = order.etapa;
  order = (await reconcileFiscal(order, config, context, { boundedPolling: true })).order;
  if (order.etapa !== previousStage) await continueAutomaticOrder(order, config);
  return externalOrder(order);
}

function findDeep(value, keys, depth = 0) {
  if (!value || depth > 6 || typeof value !== "object") return undefined;
  for (const key of keys) if (value[key] !== undefined && value[key] !== null && String(value[key]).trim()) return value[key];
  for (const child of Object.values(value)) { const found = findDeep(child, keys, depth + 1); if (found !== undefined) return found; }
  return undefined;
}

async function handleOmieWebhook(event, context = {}) {
  const { PedidoNfse } = models();
  const body = event.payload?.body || event.payload || {};
  const integrationCode = String(findDeep(body, ["cCodIntOS", "codigo_integracao_os", "integrationCode"]) || "").trim();
  const osCode = Number(findDeep(body, ["nCodOS", "codigo_os", "codigoOs"]) || 0) || 0;
  const invoiceNumber = String(findDeep(body, ["nNfse", "numero_nfse", "numeroNfse"]) || "").trim();
  let order = integrationCode ? await PedidoNfse.findOne({ integrationCode }) : null;
  if (!order && osCode > 0) order = await PedidoNfse.findOne({ codigoOsOmie: osCode });
  if (!order && invoiceNumber) order = await PedidoNfse.findOne({ numeroNfse: invoiceNumber });
  if (!order) return { ignored: true, reason: "order-not-correlated" };
  order = await ensureOrderStage(order);
  if (order.externalStatus === EXTERNAL_STATUS.INVOICE_ISSUED && order.etapa !== ORDER_STAGE.AWAIT_BILLING_RETURN) return { ignored: true, reason: "already-issued" };

  const config = await getConfig();
  if (order.etapa !== ORDER_STAGE.AWAIT_BILLING_RETURN) return { ignored: true, reason: "order-not-awaiting-billing", stage: order.etapa };
  if (!automaticStage(config, ORDER_STAGE.AWAIT_BILLING_RETURN)) return { ignored: true, reason: "billing-return-stage-is-manual" };

  const previousStage = order.etapa;
  order = (await reconcileFiscal(order, requireOperationalConfig(config), context, { boundedPolling: false })).order;
  if (order.etapa !== previousStage) await continueAutomaticOrder(order, config);
  return externalOrder(order);
}

async function requestReversal(integrationCode, requestedBy) {
  const { PedidoNfse, EstornoTaca } = models();
  const order = await PedidoNfse.findOne({ integrationCode: String(integrationCode || "").trim() });
  if (!order) { const error = new Error("Order not found."); error.statusCode = 404; error.code = "ORDER_NOT_FOUND"; throw error; }
  if (order.externalStatus !== EXTERNAL_STATUS.INVOICE_ISSUED) { const error = new Error("Reversal is allowed only after the invoice has been issued."); error.statusCode = 409; error.code = "REVERSAL_NOT_ALLOWED"; throw error; }
  let reversal = await EstornoTaca.findOne({ integrationCode: order.integrationCode });
  if (reversal) return { created: false, reversal: await ensureReversalStage(reversal) };
  try {
    reversal = await EstornoTaca.create({ integrationCode: order.integrationCode, pedidoId: order._id, etapa: REVERSAL_STAGE.REQUEST, status: REVERSAL_STATUS.PENDING, externalStatus: EXTERNAL_STATUS.REVERSAL_PENDING, ticketKey: `taca:reversal:${order.integrationCode}`, requestedAt: new Date(), requestedBy, invoiceNumber: order.numeroNfse || "", verificationCode: order.codigoVerificacaoNfse || "", invoiceUrl: order.urlNfse || order.urlPdfNfse || "", callbackStatus: CALLBACK_STATUS.NOT_REQUIRED });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    reversal = await EstornoTaca.findOne({ integrationCode: order.integrationCode });
    return { created: false, reversal: await ensureReversalStage(reversal) };
  }
  return { created: true, reversal };
}

async function enqueueReversalCallback(reversal) {
  const { EstornoTaca } = models();
  if (reversal.callbackStatus === CALLBACK_STATUS.SENT) return { reversal, alreadySent: true };
  const revision = Number(reversal.callbackRevision || 0) + 1;
  const updated = await EstornoTaca.findByIdAndUpdate(reversal._id, { $set: { callbackStatus: CALLBACK_STATUS.PENDING, callbackRevision: revision } }, { new: true });
  const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_ENVIAR_CALLBACK_ESTORNO", resource: "callbacks", operation: "reversal-callback", aggregateType: "EstornoTaca", aggregateId: String(reversal._id), idempotencyKey: `taca:reversal:${reversal.integrationCode}:callback:r${revision}`, payload: { reversalId: String(reversal._id) } });
  return { reversal: updated, ticketId: String(ticket?._id || "") };
}

async function advanceReversal(id, { user, note } = {}) {
  const { EstornoTaca } = models();
  let reversal = await EstornoTaca.findById(id);
  if (!reversal) { const error = new Error("Reversal ticket not found."); error.statusCode = 404; throw error; }
  reversal = await ensureReversalStage(reversal);

  if (reversal.etapa === REVERSAL_STAGE.REQUEST) {
    return EstornoTaca.findByIdAndUpdate(reversal._id, { $set: { etapa: REVERSAL_STAGE.CANCEL } }, { new: true });
  }
  if (reversal.etapa === REVERSAL_STAGE.CANCEL) {
    return EstornoTaca.findByIdAndUpdate(reversal._id, { $set: { etapa: REVERSAL_STAGE.NOTIFY_PLATFORM, externalStatus: EXTERNAL_STATUS.REVERSED, confirmedAt: new Date(), confirmedBy: user || "system", confirmationNote: String(note || "") } }, { new: true, runValidators: true });
  }
  if (reversal.etapa === REVERSAL_STAGE.NOTIFY_PLATFORM) {
    await enqueueReversalCallback(reversal);
    return EstornoTaca.findById(reversal._id);
  }
  if (reversal.etapa === REVERSAL_STAGE.COMPLETED) return reversal;
  const error = new Error(`Etapa de estorno não suportada: ${reversal.etapa}`);
  error.statusCode = 409;
  throw error;
}

async function confirmReversal(id, { user, note } = {}) {
  const { EstornoTaca } = models();
  let reversal = await EstornoTaca.findById(id);
  if (!reversal) { const error = new Error("Reversal ticket not found."); error.statusCode = 404; throw error; }
  reversal = await ensureReversalStage(reversal);
  if (reversal.etapa === REVERSAL_STAGE.COMPLETED) return reversal;
  if (reversal.etapa === REVERSAL_STAGE.NOTIFY_PLATFORM) return reversal;
  return EstornoTaca.findByIdAndUpdate(reversal._id, { $set: { etapa: REVERSAL_STAGE.NOTIFY_PLATFORM, externalStatus: EXTERNAL_STATUS.REVERSED, confirmedAt: new Date(), confirmedBy: user || "system", confirmationNote: String(note || "") } }, { new: true, runValidators: true });
}

async function resendOrderCallback(id) {
  const { PedidoNfse } = models();
  const order = await PedidoNfse.findById(id);
  if (!order) { const error = new Error("Order not found."); error.statusCode = 404; throw error; }
  return enqueueOrderCallback(order);
}

async function resendReversalCallback(id) {
  const { EstornoTaca } = models();
  const reversal = await EstornoTaca.findById(id);
  if (!reversal) { const error = new Error("Reversal not found."); error.statusCode = 404; throw error; }
  if (reversal.externalStatus !== EXTERNAL_STATUS.REVERSED) { const error = new Error("Reversal callback is available only after cancellation confirmation."); error.statusCode = 409; throw error; }
  return enqueueReversalCallback(reversal);
}

async function enqueueFiscalReconcile(id) {
  const { PedidoNfse } = models();
  const order = await PedidoNfse.findById(id);
  if (!order) { const error = new Error("Order not found."); error.statusCode = 404; throw error; }
  const revision = Number(order.fiscalCheckAttempts || 0) + 1;
  const ticket = await enqueueIntegration({ provider: "omie", handler: "TACA_RECONCILIAR_NFSE", resource: "orders", operation: "reconcile-invoice", aggregateType: "PedidoNfse", aggregateId: String(order._id), idempotencyKey: `taca:order:${order.integrationCode}:reconcile:${revision}`, payload: { orderId: String(order._id) } });
  return { order: externalOrder(order), ticketId: String(ticket?._id || "") };
}

module.exports = {
  ORDER_AUTOMATION,
  advanceReversal,
  automaticStage,
  confirmReversal,
  continueAutomaticOrder,
  currentUser,
  enqueueFiscalReconcile,
  enqueueOrderStage,
  externalOrder,
  externalReversal,
  handleFiscalReconcile,
  handleOmieWebhook,
  legacyProcessOrder,
  processOrderStage,
  receiveOrder,
  requestReversal,
  resendOrderCallback,
  resendReversalCallback,
};
