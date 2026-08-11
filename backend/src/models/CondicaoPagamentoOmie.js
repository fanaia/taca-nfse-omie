"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");
const { TACA_PERMISSIONS } = require("../services/taca/constants");

function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "CondicaoPagamentoOmie",
  singular: "condicaoPagamentoOmie",
  basePath: "/condicoes-pagamento-omie",
  schema: {
    codigoCondicaoPagamento: unique(fields.string({ required: true, label: "Código Omie" })),
    nome: indexed(fields.string({ required: true, label: "Condição de pagamento" })),
    numeroParcelas: fields.number({ label: "Quantidade de parcelas" }),
    listaParcelas: fields.string({ label: "Lista de vencimentos" }),
    diasParcela: fields.number({ label: "Dias da parcela" }),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
  },
  crud: {
    enabled: true,
    permissions: {
      read: TACA_PERMISSIONS.CONFIGURATION_MANAGE,
      write: TACA_PERMISSIONS.CONFIGURATION_MANAGE,
    },
  },
});

module.exports = {};
