"use strict";

const crypto = require("node:crypto");

function buildOrderCallback(order) {
  return {
    integrationCode: order.integrationCode,
    type: "order",
    status: order.externalStatus,
    invoice: {
      number: order.numeroNfse || "",
      verificationCode: order.codigoVerificacaoNfse || "",
      url: order.urlNfse || order.urlPdfNfse || "",
    },
    message: order.lastError || order.fiscalMessage || "",
  };
}

function buildReversalCallback(reversal) {
  return {
    integrationCode: reversal.integrationCode,
    type: "reversal",
    status: reversal.externalStatus,
    invoice: {
      number: reversal.invoiceNumber || "",
      verificationCode: reversal.verificationCode || "",
      url: reversal.invoiceUrl || "",
    },
    message: reversal.confirmationNote || "",
  };
}

function signHmac(bodyText, secret) {
  return `sha256=${crypto.createHmac("sha256", secret).update(bodyText).digest("hex")}`;
}

module.exports = { buildOrderCallback, buildReversalCallback, signHmac };
