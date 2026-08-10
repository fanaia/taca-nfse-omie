"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");
function indexed(descriptor) { descriptor.index = true; return descriptor; }
function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "ClienteTaca",
  singular: "clienteTaca",
  basePath: "/clientes-taca",
  schema: {
    documentoNormalizado: unique(fields.string({ required: true, label: "Documento normalizado" })),
    documentoMascarado: indexed(fields.string({ required: true, label: "Documento" })),
    razaoSocial: indexed(fields.string({ required: true, label: "Razão social / nome" })),
    nomeFantasia: fields.string({ label: "Nome fantasia" }),
    email: fields.string({ required: true, label: "E-mail" }),
    codigoClienteOmie: indexed(fields.number({ label: "Código do cliente Omie" })),
    enderecoEfetivoJson: fields.string({ label: "Endereço efetivo" }),
    origemEnderecoJson: fields.string({ label: "Origem do endereço" }),
    sincronizadoEm: fields.date({ label: "Sincronizado no Omie em" }),
    sincronizadoFingerprint: fields.string({ label: "Fingerprint dos dados sincronizados" }),
    ultimoErro: fields.string({ label: "Último erro" }),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] }, populateRefs: true },
});

module.exports = {};
