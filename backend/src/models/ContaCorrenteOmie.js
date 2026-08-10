"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "ContaCorrenteOmie",
  singular: "contaCorrenteOmie",
  basePath: "/contas-correntes-omie",
  schema: {
    codigoContaCorrenteOmie: unique(fields.number({ required: true, label: "Código Omie" })),
    codigoIntegracao: indexed(fields.string({ label: "Código de integração" })),
    nome: indexed(fields.string({ required: true, label: "Conta corrente" })),
    tipo: fields.string({ label: "Tipo" }),
    codigoBanco: fields.string({ label: "Banco" }),
    status: indexed(fields.enum(["Ativo", "Inativo"], { label: "Status", default: "Ativo" })),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] } },
});

module.exports = {};
