"use strict";

const { EXTERNAL_STATUS, INTERNAL_STATUS, ORDER_STAGE } = require("./constants");
const { getConfig } = require("./config");
const { callOmie, customerCode } = require("./omieClient");
const { buildCustomerPayload } = require("./omiePayload");
const { customerFingerprint } = require("./customerSync");
const { models } = require("./runtime");
const {
  continueAutomaticOrder,
  externalOrder,
  processOrderStage: processOrderStageBase,
} = require("./workflow");

function parseJson(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function omieCustomerPayload(order) {
  return buildCustomerPayload({
    documentoNormalizado: order.documentoNormalizado,
    customerLegalName: order.customerLegalName,
    customerTradeName: order.customerTradeName,
    customerEmail: order.customerEmail,
    simpleNationalTaxpayer: order.simpleNationalTaxpayer,
    address: parseJson(order.enderecoEfetivoJson),
  }, {});
}

function isOmieClientFault(error) {
  return /^SOAP-ENV:Client/i.test(String(error?.code || ""));
}

async function legacySyncedFingerprint(PedidoNfse, order) {
  const previous = await PedidoNfse.findOne({
    clienteId: order.clienteId,
    _id: { $ne: order._id },
    customerSyncedAt: { $exists: true, $ne: null },
  }).sort({ customerSyncedAt: -1 });
  return previous ? customerFingerprint(previous) : "";
}

async function synchronizeCustomer(order, config, context = {}) {
  const { ClienteTaca, PedidoNfse } = models();
  const customer = await ClienteTaca.findById(order.clienteId);
  if (!customer) throw new Error("Cliente local do pedido não encontrado.");

  const currentFingerprint = customerFingerprint(order);
  const existingCode = Number(customer.codigoClienteOmie || 0);
  let syncedFingerprint = String(customer.sincronizadoFingerprint || "").trim();

  if (existingCode > 0 && !syncedFingerprint) {
    syncedFingerprint = await legacySyncedFingerprint(PedidoNfse, order);
  }

  if (existingCode > 0 && syncedFingerprint && syncedFingerprint === currentFingerprint) {
    const now = new Date();
    if (customer.sincronizadoFingerprint !== currentFingerprint) {
      await ClienteTaca.findByIdAndUpdate(customer._id, {
        $set: { sincronizadoFingerprint: currentFingerprint, ultimoErro: "" },
      });
    }
    await PedidoNfse.findByIdAndUpdate(order._id, {
      $set: {
        codigoClienteOmie: existingCode,
        statusInterno: INTERNAL_STATUS.CUSTOMER_SYNCED,
        externalStatus: EXTERNAL_STATUS.CUSTOMER_SYNCED,
        customerSyncedAt: now,
        lastError: "",
      },
    });
    return { code: existingCode, skipped: true, fingerprint: currentFingerprint };
  }

  try {
    const result = await callOmie(
      "upsert-customer-by-document",
      config.instanceId,
      omieCustomerPayload(order),
      context,
    );
    const code = customerCode(result) || existingCode;
    if (!(code > 0)) throw new Error("Omie não retornou codigo_cliente_omie no UpsertClienteCpfCnpj.");

    const now = new Date();
    await ClienteTaca.findByIdAndUpdate(customer._id, {
      $set: {
        codigoClienteOmie: code,
        sincronizadoEm: now,
        sincronizadoFingerprint: currentFingerprint,
        ultimoErro: "",
      },
    });
    await PedidoNfse.findByIdAndUpdate(order._id, {
      $set: {
        codigoClienteOmie: code,
        statusInterno: INTERNAL_STATUS.CUSTOMER_SYNCED,
        externalStatus: EXTERNAL_STATUS.CUSTOMER_SYNCED,
        customerSyncedAt: now,
        lastError: "",
      },
    });
    return { code, skipped: false, fingerprint: currentFingerprint };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ClienteTaca.findByIdAndUpdate(customer._id, { $set: { ultimoErro: message } });
    if (isOmieClientFault(error)) error.retryable = false;
    throw error;
  }
}

async function processOrderStage(event, context = {}) {
  const { PedidoNfse } = models();
  let order = await PedidoNfse.findById(event.payload?.orderId || event.aggregateId);
  if (!order || order.etapa !== ORDER_STAGE.CUSTOMER_SYNC) {
    return processOrderStageBase(event, context);
  }

  const expectedStage = String(event.payload?.expectedStage || order.etapa);
  if (expectedStage !== order.etapa) {
    return { ignored: true, reason: "stale-stage-ticket", expectedStage, currentStage: order.etapa };
  }

  const config = await getConfig();
  try {
    const sync = await synchronizeCustomer(order, config, context);
    order = await PedidoNfse.findByIdAndUpdate(order._id, {
      $set: { etapa: ORDER_STAGE.CREATE_SERVICE_ORDER, lastError: "" },
    }, { new: true });

    const output = { ...externalOrder(order), stage: order.etapa, customerSyncSkipped: sync.skipped };
    context.recordItem?.(output);
    await continueAutomaticOrder(order, config);
    return output;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    const statusCode = Number(error?.statusCode || error?.response?.status || 0);
    const definitive = error?.retryable === false
      || isOmieClientFault(error)
      || (statusCode >= 400 && statusCode < 500 && ![408, 409, 425, 429].includes(statusCode));
    const patch = { lastError: message };
    if (definitive) Object.assign(patch, {
      statusInterno: INTERNAL_STATUS.ERROR,
      externalStatus: EXTERNAL_STATUS.ERROR,
    });
    await PedidoNfse.findByIdAndUpdate(order._id, { $set: patch });
    error.retryable = !definitive;
    throw error;
  }
}

module.exports = {
  isOmieClientFault,
  legacySyncedFingerprint,
  processOrderStage,
  synchronizeCustomer,
};
