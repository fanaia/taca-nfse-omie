"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function unique(descriptor) { descriptor.unique = true; descriptor.index = true; return descriptor; }

defineModel({
  name: "ConfiguracaoNfse",
  singular: "configuracaoNfse",
  basePath: "/configuracoes-nfse",
  schema: {
    chave: unique(fields.string({ required: true, label: "Configuração", default: "default" })),
    instanceId: fields.string({ required: true, label: "Instância Omie", default: "default" }),

    servicoOmieId: fields.ref("ServicoOmie", { label: "Serviço Omie" }),
    codigoServicoOmie: fields.number({ label: "Código do serviço Omie" }),
    categoriaOmieId: fields.ref("CategoriaOmie", { label: "Categoria Omie" }),
    codigoCategoriaOmie: fields.string({ label: "Código da categoria Omie" }),
    contaCorrenteOmieId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente Omie" }),
    codigoContaCorrenteOmie: fields.number({ label: "Código da conta corrente Omie" }),
    cidadePrestacaoServicoId: fields.ref("CidadeOmie", { label: "Cidade da prestação do serviço" }),
    cidadePrestacaoServico: fields.string({ label: "Cidade da prestação do serviço" }),
    condicaoPagamentoOmieId: fields.ref("CondicaoPagamentoOmie", { label: "Condição de pagamento Omie" }),
    codigoCondicaoPagamento: fields.string({ label: "Código da condição de pagamento Omie", default: "000" }),

    enviarLinkNfsePorEmail: fields.boolean({ label: "Enviar link da NFS-e por e-mail pelo Omie", default: false }),
    dadosAdicionaisNf: fields.string({ label: "Dados adicionais da NFS-e" }),

    defaultStreet: fields.string({ label: "Logradouro padrão" }),
    defaultNumber: fields.string({ label: "Número padrão" }),
    defaultComplement: fields.string({ label: "Complemento padrão" }),
    defaultDistrict: fields.string({ label: "Bairro padrão" }),
    defaultCityIbgeCode: fields.string({ label: "Código IBGE da cidade padrão" }),
    defaultState: fields.string({ label: "UF padrão" }),
    defaultPostalCode: fields.string({ label: "CEP padrão" }),
    defaultCountryCode: fields.string({ label: "Código do país padrão", default: "1058" }),
    allowIssuanceWithoutAddress: fields.boolean({ label: "Permitir emissão sem dados de endereço", default: false }),

    automatizarAprovacao: fields.boolean({ label: "Automatizar aprovação", default: false }),
    automatizarSincronizacaoCliente: fields.boolean({ label: "Automatizar sincronização do cliente", default: false }),
    automatizarCriacaoOs: fields.boolean({ label: "Automatizar criação da OS", default: false }),
    automatizarGeracaoNf: fields.boolean({ label: "Automatizar geração da NFS-e", default: false }),
    automatizarRetornoFaturamento: fields.boolean({ label: "Automatizar retorno do faturamento", default: false }),
    automatizarBaixaFinanceira: fields.boolean({ label: "Automatizar baixa financeira", default: false }),
    automatizarNotificacaoPlataforma: fields.boolean({ label: "Automatizar notificação da Plataforma", default: false }),

    callbackUrl: fields.string({ label: "URL de callback da Plataforma" }),
    callbackAuthMode: fields.enum(["none", "bearer", "hmac-sha256"], { label: "Autenticação do callback", default: "hmac-sha256" }),
    callbackSecretEnv: fields.string({ label: "Variável de ambiente do segredo do callback", default: "TACA_CALLBACK_SECRET" }),
    callbackTimeoutMs: fields.number({ label: "Timeout do callback (ms)", default: 5000 }),
    callbackMaxAttempts: fields.number({ label: "Tentativas do callback", default: 3 }),
    callbackBackoffMs: fields.number({ label: "Backoff inicial do callback (ms)", default: 500 }),
    fiscalCheckAttempts: fields.number({ label: "Consultas fiscais por Ticket", default: 3 }),
    fiscalCheckBackoffMs: fields.number({ label: "Backoff inicial da confirmação fiscal (ms)", default: 1000 }),
  },
  crud: { enabled: true, roles: { write: ["admin", "desenvolvedor"] }, populateRefs: true },
});

module.exports = {};
