"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");
function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "EstornoTaca",
  singular: "estornoTaca",
  basePath: "/estornos-taca",
  schema: {
    integrationCode: unique(fields.string({ required: true, label: "Código de integração" })),
    pedidoId: fields.ref("PedidoNfse", { required: true, label: "Pedido / NFS-e" }),
    status: indexed(fields.enum(["PENDENTE", "CONCLUIDO"], { required: true, label: "Status", default: "PENDENTE" })),
    externalStatus: indexed(fields.enum(["REVERSAL_PENDING", "REVERSED"], { required: true, label: "Status externo", default: "REVERSAL_PENDING" })),
    ticketKey: unique(fields.string({ required: true, label: "Ticket" })),
    requestedAt: indexed(fields.date({ required: true, label: "Solicitado em" })),
    requestedBy: fields.string({ label: "Solicitado por" }),
    confirmedAt: fields.date({ label: "Confirmado em" }),
    confirmedBy: fields.string({ label: "Confirmado por" }),
    confirmationNote: fields.string({ label: "Observação" }),
    invoiceNumber: fields.string({ label: "NFS-e" }),
    verificationCode: fields.string({ label: "Código de verificação" }),
    invoiceUrl: fields.string({ label: "URL NFS-e" }),
    callbackStatus: indexed(fields.enum(["NOT_REQUIRED", "PENDING", "SENT", "ERROR"], { label: "Callback", default: "NOT_REQUIRED" })),
    callbackRevision: fields.number({ label: "Revisão callback", default: 0 }),
    callbackAttempts: fields.number({ label: "Tentativas callback", default: 0 }),
    callbackLastHttpStatus: fields.number({ label: "Último HTTP callback" }),
    callbackLastError: fields.string({ label: "Último erro callback" }),
    callbackSentAt: fields.date({ label: "Callback enviado em" }),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] }, populateRefs: true },
});

module.exports = {};
