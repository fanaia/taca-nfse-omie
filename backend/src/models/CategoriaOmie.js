"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "CategoriaOmie",
  singular: "categoriaOmie",
  basePath: "/categorias-omie",
  schema: {
    codigoCategoriaOmie: unique(fields.string({ required: true, label: "Código Omie" })),
    nome: indexed(fields.string({ required: true, label: "Categoria" })),
    descricao: fields.string({ label: "Descrição" }),
    natureza: fields.string({ label: "Natureza" }),
    tipoCategoria: indexed(fields.string({ label: "Tipo" })),
    status: indexed(fields.enum(["Ativo", "Inativo"], { label: "Status", default: "Ativo" })),
    selecionavel: indexed(fields.boolean({ label: "Disponível para seleção", default: true })),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] } },
});

module.exports = {};
