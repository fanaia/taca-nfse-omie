"use strict";

const ADDRESS_FIELDS = Object.freeze([
  "street",
  "number",
  "complement",
  "district",
  "cityIbgeCode",
  "state",
  "postalCode",
]);
const REQUIRED_ADDRESS_FIELDS = Object.freeze([
  "street",
  "number",
  "district",
  "cityIbgeCode",
  "state",
  "postalCode",
]);

class ApiValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiValidationError";
    this.statusCode = 422;
    this.code = "VALIDATION_ERROR";
    this.details = details;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeDocument(value) {
  const normalized = text(value).replace(/\D/g, "");
  if (![11, 14].includes(normalized.length)) {
    throw new ApiValidationError("customer.document must contain a valid CPF or CNPJ length.", {
      field: "customer.document",
    });
  }
  return normalized;
}

function maskDocument(value) {
  const document = String(value || "").replace(/\D/g, "");
  if (document.length === 11) return `***.${document.slice(3, 6)}.${document.slice(6, 9)}-**`;
  if (document.length === 14) return `**.${document.slice(2, 5)}.${document.slice(5, 8)}/****-${document.slice(12)}`;
  return document ? "***" : "";
}

function validateOrderPayload(payload = {}) {
  const integrationCode = text(payload.integrationCode);
  if (!integrationCode || integrationCode.length > 60) {
    throw new ApiValidationError("integrationCode is required and must contain at most 60 characters.", {
      field: "integrationCode",
    });
  }
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError("amount must be a number greater than zero.", { field: "amount" });
  }
  const customer = payload.customer && typeof payload.customer === "object" ? payload.customer : {};
  const legalName = text(customer.legalName);
  const email = text(customer.email);
  if (!legalName) throw new ApiValidationError("customer.legalName is required.", { field: "customer.legalName" });
  if (!email || !email.includes("@")) throw new ApiValidationError("customer.email is required and must be valid.", { field: "customer.email" });
  const document = normalizeDocument(customer.document);
  if (customer.simpleNationalTaxpayer !== undefined && typeof customer.simpleNationalTaxpayer !== "boolean") {
    throw new ApiValidationError("customer.simpleNationalTaxpayer must be boolean when provided.", {
      field: "customer.simpleNationalTaxpayer",
    });
  }
  return {
    integrationCode,
    amount: Math.round(amount * 100) / 100,
    customer: {
      document,
      legalName,
      tradeName: text(customer.tradeName) || legalName,
      email,
      simpleNationalTaxpayer: customer.simpleNationalTaxpayer,
      address: customer.address && typeof customer.address === "object" ? customer.address : {},
    },
  };
}

function resolveAddress(requestAddress = {}, defaults = {}) {
  const address = {};
  const origin = {};
  for (const field of ADDRESS_FIELDS) {
    const fromRequest = text(requestAddress[field]);
    const fromDefault = text(defaults[field]);
    if (fromRequest) {
      address[field] = fromRequest;
      origin[field] = "request";
    } else if (fromDefault) {
      address[field] = fromDefault;
      origin[field] = "default";
    } else {
      address[field] = "";
      origin[field] = "missing";
    }
  }
  const missingFields = REQUIRED_ADDRESS_FIELDS.filter((field) => !address[field]);
  return { address, origin, missingFields };
}

function ensureAddressPolicy(resolved, allowIssuanceWithoutAddress) {
  if (resolved.missingFields.length && !allowIssuanceWithoutAddress) {
    throw new ApiValidationError("Address data is insufficient after applying configured defaults.", {
      field: "customer.address",
      missingFields: resolved.missingFields,
    });
  }
  return resolved;
}

module.exports = {
  ADDRESS_FIELDS,
  REQUIRED_ADDRESS_FIELDS,
  ApiValidationError,
  ensureAddressPolicy,
  maskDocument,
  normalizeDocument,
  resolveAddress,
  validateOrderPayload,
};
