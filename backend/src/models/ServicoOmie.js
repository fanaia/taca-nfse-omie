"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "ServicoOmie",
  singular: "servicoOmie",
  basePath: "/servicos-omie",
  schema: {
    codigoServicoOmie: unique(fields.number({ required: true, label: "Código Omie" })),
    codigoIntegracao: indexed(fields.string({ label: "Código de integração" })),
    codigo: indexed(fields.string({ label: "Código do serviço" })),
    nome: indexed(fields.string({ required: true, label: "Serviço" })),
    descricao: fields.string({ label: "Descrição completa" }),
    codigoCategoriaOmie: indexed(fields.string({ label: "Categoria padrão do serviço" })),
    status: indexed(fields.enum(["Ativo", "Inativo"], { label: "Status", default: "Ativo" })),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] } },
});

module.exports = {};
