"use strict";

const crypto = require("node:crypto");

function text(value) {
  return String(value ?? "").trim();
}

function parseAddress(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function snapshotCustomer(value = {}) {
  const address = parseAddress(value.address || value.enderecoEfetivoJson);
  const simple = value.simpleNationalTaxpayer;
  return {
    document: text(value.documentoNormalizado || value.document).replace(/\D/g, ""),
    legalName: text(value.customerLegalName || value.razaoSocial),
    tradeName: text(value.customerTradeName || value.nomeFantasia),
    email: text(value.customerEmail || value.email).toLowerCase(),
    simpleNationalTaxpayer: simple === undefined || simple === null ? null : Boolean(simple),
    address: {
      street: text(address.street),
      number: text(address.number),
      complement: text(address.complement),
      district: text(address.district),
      cityIbgeCode: text(address.cityIbgeCode),
      state: text(address.state).toUpperCase(),
      postalCode: text(address.postalCode).replace(/\D/g, ""),
    },
  };
}

function customerFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshotCustomer(value))).digest("hex");
}

function customerNeedsSync(customer, currentFingerprint) {
  const code = Number(customer?.codigoClienteOmie || 0);
  const synced = text(customer?.sincronizadoFingerprint);
  return !(code > 0 && synced && synced === currentFingerprint);
}

module.exports = { customerFingerprint, customerNeedsSync, snapshotCustomer };
