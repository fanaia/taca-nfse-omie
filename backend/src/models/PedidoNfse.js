"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");
const { ORDER_STAGES, TACA_PERMISSIONS } = require("../services/taca/constants");
function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

const INTERNAL = ["RECEBIDA", "VALIDADA", "CLIENTE_SINCRONIZADO", "OS_INCLUIDA", "NFSE_EM_PROCESSAMENTO", "NFSE_EMITIDA", "ERRO"];
const EXTERNAL = ["RECEIVED", "VALIDATED", "CUSTOMER_SYNCED", "SERVICE_ORDER_CREATED", "INVOICE_PROCESSING", "INVOICE_ISSUED", "ERROR"];
const CALLBACK = ["NOT_REQUIRED", "PENDING", "SENT", "ERROR"];

defineModel({
  name: "PedidoNfse",
  singular: "pedidoNfse",
  basePath: "/pedidos-nfse",
  schema: {
    integrationCode: unique(fields.string({ required: true, label: "Código de integração" })),
    amount: fields.currency({ required: true, label: "Valor", default: 0 }),
    requestFingerprint: fields.string({ required: true, label: "Fingerprint idempotente" }),
    clienteId: fields.ref("ClienteTaca", { label: "Cliente" }),
    documentoNormalizado: indexed(fields.string({ required: true, label: "Documento normalizado" })),
    documentoMascarado: indexed(fields.string({ required: true, label: "Documento" })),
    customerLegalName: indexed(fields.string({ required: true, label: "Cliente" })),
    customerTradeName: fields.string({ label: "Nome fantasia" }),
    customerEmail: fields.string({ required: true, label: "E-mail" }),
    simpleNationalTaxpayer: fields.boolean({ label: "Optante do Simples Nacional" }),
    enderecoEfetivoJson: fields.string({ label: "Endereço efetivo" }),
    origemEnderecoJson: fields.string({ label: "Origem do endereço" }),

    etapa: indexed(fields.enum(ORDER_STAGES, { required: true, label: "Etapa", default: "Aprovação", readonly: true })),
    stageRevision: fields.number({ label: "Revisão da etapa", default: 0 }),
    statusInterno: indexed(fields.enum(INTERNAL, { required: true, label: "Status interno", default: "RECEBIDA", readonly: true })),
    externalStatus: indexed(fields.enum(EXTERNAL, { required: true, label: "Status externo", default: "RECEIVED", readonly: true })),

    codigoClienteOmie: indexed(fields.number({ label: "Cliente Omie" })),
    codigoOsOmie: indexed(fields.number({ label: "Código OS Omie" })),
    numeroOs: indexed(fields.string({ label: "Número OS" })),
    faturamentoSolicitadoEm: fields.date({ label: "Faturamento solicitado em" }),
    fiscalStatusCode: indexed(fields.string({ label: "Status fiscal Omie" })),
    numeroRps: fields.string({ label: "RPS" }),
    numeroNfse: indexed(fields.string({ label: "NFS-e" })),
    codigoVerificacaoNfse: fields.string({ label: "Código de verificação" }),
    urlNfse: fields.string({ label: "URL NFS-e" }),
    urlPdfNfse: fields.string({ label: "PDF NFS-e" }),
    fiscalMessage: fields.string({ label: "Mensagem fiscal" }),
    fiscalCheckAttempts: fields.number({ label: "Consultas fiscais", default: 0 }),

    baixaFinanceiraConfirmadaEm: fields.date({ label: "Baixa financeira confirmada em" }),
    baixaFinanceiraConfirmadaPor: fields.string({ label: "Baixa financeira confirmada por" }),

    callbackStatus: indexed(fields.enum(CALLBACK, { label: "Callback", default: "NOT_REQUIRED", readonly: true })),
    callbackRevision: fields.number({ label: "Revisão callback", default: 0 }),
    callbackAttempts: fields.number({ label: "Tentativas callback", default: 0 }),
    callbackLastHttpStatus: fields.number({ label: "Último HTTP callback" }),
    callbackLastError: fields.string({ label: "Último erro callback" }),
    callbackSentAt: fields.date({ label: "Callback enviado em" }),

    receivedAt: indexed(fields.date({ required: true, label: "Recebido em" })),
    validatedAt: fields.date({ label: "Validado em" }),
    customerSyncedAt: fields.date({ label: "Cliente sincronizado em" }),
    serviceOrderCreatedAt: fields.date({ label: "OS criada em" }),
    invoiceConfirmedAt: indexed(fields.date({ label: "NFS-e confirmada em" })),
    completedAt: indexed(fields.date({ label: "Concluído em" })),
    lastError: fields.string({ label: "Último erro" }),
  },
  crud: {
    enabled: true,
    permissions: {
      read: TACA_PERMISSIONS.OPERATION_READ,
      write: TACA_PERMISSIONS.DATA_WRITE,
    },
    populateRefs: true,
  },
});

module.exports = { CALLBACK, EXTERNAL, INTERNAL };
