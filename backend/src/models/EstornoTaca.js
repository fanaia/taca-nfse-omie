"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");
const { REVERSAL_STAGES } = require("../services/taca/constants");
function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "EstornoTaca",
  singular: "estornoTaca",
  basePath: "/estornos-taca",
  schema: {
    integrationCode: unique(fields.string({ required: true, label: "Código de integração" })),
    pedidoId: fields.ref("PedidoNfse", { required: true, label: "Pedido / NFS-e" }),
    etapa: indexed(fields.enum(REVERSAL_STAGES, { required: true, label: "Etapa", default: "Requisição", readonly: true })),
    status: indexed(fields.enum(["PENDENTE", "CONCLUIDO"], { required: true, label: "Status", default: "PENDENTE", readonly: true })),
    externalStatus: indexed(fields.enum(["REVERSAL_PENDING", "REVERSED"], { required: true, label: "Status externo", default: "REVERSAL_PENDING", readonly: true })),
    ticketKey: unique(fields.string({ required: true, label: "Ticket" })),
    requestedAt: indexed(fields.date({ required: true, label: "Solicitado em" })),
    requestedBy: fields.string({ label: "Solicitado por" }),
    confirmedAt: fields.date({ label: "Cancelamento confirmado em" }),
    confirmedBy: fields.string({ label: "Cancelamento confirmado por" }),
    confirmationNote: fields.string({ label: "Observação" }),
    invoiceNumber: fields.string({ label: "NFS-e" }),
    verificationCode: fields.string({ label: "Código de verificação" }),
    invoiceUrl: fields.string({ label: "URL NFS-e" }),
    callbackStatus: indexed(fields.enum(["NOT_REQUIRED", "PENDING", "SENT", "ERROR"], { label: "Callback", default: "NOT_REQUIRED", readonly: true })),
    callbackRevision: fields.number({ label: "Revisão callback", default: 0 }),
    callbackAttempts: fields.number({ label: "Tentativas callback", default: 0 }),
    callbackLastHttpStatus: fields.number({ label: "Último HTTP callback" }),
    callbackLastError: fields.string({ label: "Último erro callback" }),
    callbackSentAt: fields.date({ label: "Callback enviado em" }),
    completedAt: indexed(fields.date({ label: "Concluído em" })),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] }, populateRefs: true },
});

module.exports = {};
