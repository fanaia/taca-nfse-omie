"use strict";

const INTERNAL_STATUS = Object.freeze({
  RECEIVED: "RECEBIDA",
  VALIDATED: "VALIDADA",
  CUSTOMER_SYNCED: "CLIENTE_SINCRONIZADO",
  SERVICE_ORDER_CREATED: "OS_INCLUIDA",
  INVOICE_PROCESSING: "NFSE_EM_PROCESSAMENTO",
  INVOICE_ISSUED: "NFSE_EMITIDA",
  ERROR: "ERRO",
});

const EXTERNAL_STATUS = Object.freeze({
  RECEIVED: "RECEIVED",
  VALIDATED: "VALIDATED",
  CUSTOMER_SYNCED: "CUSTOMER_SYNCED",
  SERVICE_ORDER_CREATED: "SERVICE_ORDER_CREATED",
  INVOICE_PROCESSING: "INVOICE_PROCESSING",
  INVOICE_ISSUED: "INVOICE_ISSUED",
  ERROR: "ERROR",
  REVERSAL_PENDING: "REVERSAL_PENDING",
  REVERSED: "REVERSED",
});

const CALLBACK_STATUS = Object.freeze({
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  SENT: "SENT",
  ERROR: "ERROR",
});

const ORDER_STAGE = Object.freeze({
  APPROVAL: "Aprovação",
  CUSTOMER_SYNC: "Sinc cliente (Omie)",
  CREATE_SERVICE_ORDER: "Criar OS (Omie)",
  GENERATE_INVOICE: "Gerar NF (Omie)",
  AWAIT_BILLING_RETURN: "Aguardando retorno faturamento (Omie)",
  FINANCIAL_SETTLEMENT: "Baixa financeira",
  NOTIFY_PLATFORM: "Notificar plataforma",
  COMPLETED: "Concluído",
});

const ORDER_STAGES = Object.freeze(Object.values(ORDER_STAGE));

const REVERSAL_STAGE = Object.freeze({
  REQUEST: "Requisição",
  CANCEL: "Cancelar",
  NOTIFY_PLATFORM: "Notificar plataforma",
  COMPLETED: "Concluído",
});

const REVERSAL_STAGES = Object.freeze(Object.values(REVERSAL_STAGE));

const REVERSAL_STATUS = Object.freeze({
  PENDING: "PENDENTE",
  COMPLETED: "CONCLUIDO",
});

const TACA_PERMISSIONS = Object.freeze({
  OPERATION_READ: "taca.operation.read",
  OPERATION_EXECUTE: "taca.operation.execute",
  CONFIGURATION_MANAGE: "taca.configuration.manage",
  DATA_WRITE: "taca.data.write",
  PLATFORM_ORDER_CREATE: "taca.platform.orders.create",
  PLATFORM_REVERSAL_CREATE: "taca.platform.reversals.create",
});

module.exports = {
  CALLBACK_STATUS,
  EXTERNAL_STATUS,
  INTERNAL_STATUS,
  ORDER_STAGE,
  ORDER_STAGES,
  REVERSAL_STAGE,
  REVERSAL_STAGES,
  REVERSAL_STATUS,
  TACA_PERMISSIONS,
};
