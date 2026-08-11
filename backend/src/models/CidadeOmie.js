"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");
const { TACA_PERMISSIONS } = require("../services/taca/constants");

function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "CidadeOmie",
  singular: "cidadeOmie",
  basePath: "/cidades-omie",
  schema: {
    codigoCidadeOmie: unique(fields.string({ required: true, label: "Código Omie" })),
    nome: indexed(fields.string({ required: true, label: "Cidade" })),
    uf: indexed(fields.string({ required: true, label: "UF" })),
    codigoIbge: indexed(fields.string({ label: "Código IBGE" })),
    codigoSiafi: fields.number({ label: "Código SIAFI" }),
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
