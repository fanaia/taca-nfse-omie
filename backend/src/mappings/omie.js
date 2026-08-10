"use strict";

const { defineOmieMapping } = require("@oondemand/oon-core-back");
const { handleOrderCallback, handleReversalCallback } = require("../services/taca/callback");
const { processOrderStage } = require("../services/taca/orderStageHandler");
const { mapCategory, mapCity, mapCurrentAccount, mapPaymentTerm, mapService, syncReferenceList } = require("../services/taca/referenceData");
const { handleFiscalReconcile, handleOmieWebhook, legacyProcessOrder } = require("../services/taca/workflow");

function webhookAction() {
  return {
    eventType: "*",
    resource: "orders",
    actions: [{
      handler: "TACA_PROCESSAR_WEBHOOK_OMIE",
      aggregateType: "PedidoNfse",
      payload: { eventType: "$event.eventType", body: { $path: "$payload" } },
    }],
  };
}

function inboundList({ key, label, description, call, model, externalKey, mapping, order, activeField }) {
  const target = { model, externalKey };
  if (activeField) { target.activeField = activeField; target.inactiveValue = "Inativo"; }
  return {
    key, label, description, call, mode: "full", direction: "inbound", target, mapping,
    policies: { create: true, update: true, inactivate: Boolean(activeField), conflict: "remote-wins" },
    batchSize: 100, includeInFullSync: true, order,
  };
}

defineOmieMapping("taca-nfse-omie", {
  instances: [{ id: "default", label: "Omie Taça" }],
  calls: {
    "test-connection": { label: "Testar conexão com o Omie", endpoint: "geral/clientes/", call: "ListarClientes", param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: "N" }], maxAttempts: 1, connectionTest: true },
    "list-services": { label: "Listar serviços", endpoint: "servicos/servico/", call: "ListarCadastroServico", param: [{ nPagina: "$input.page", nRegPorPagina: "$input.pageSize" }], maxAttempts: 1, pagination: { itemsPath: "cadastros", totalPagesPath: "nTotPaginas", pageSize: 100 } },
    "list-categories": { label: "Listar categorias", endpoint: "geral/categorias/", call: "ListarCategorias", param: [{ pagina: "$input.page", registros_por_pagina: "$input.pageSize" }], maxAttempts: 1, pagination: { itemsPath: "categoria_cadastro", totalPagesPath: "total_de_paginas", pageSize: 100 } },
    "list-current-accounts": { label: "Listar contas correntes", endpoint: "geral/contacorrente/", call: "ListarContasCorrentes", param: [{ pagina: "$input.page", registros_por_pagina: "$input.pageSize", apenas_importado_api: "N" }], maxAttempts: 1, pagination: { itemsPath: "ListarContasCorrentes", totalPagesPath: "total_de_paginas", pageSize: 100 } },
    "list-payment-terms": { label: "Listar condições de pagamento", endpoint: "produtos/formaspagvendas/", call: "ListarFormasPagVendas", param: [{ pagina: "$input.page", registros_por_pagina: "$input.pageSize" }], maxAttempts: 1, pagination: { itemsPath: "cadastros", totalPagesPath: "total_de_paginas", pageSize: 100 } },
    "list-cities": { label: "Listar cidades", endpoint: "geral/cidades/", call: "PesquisarCidades", param: [{ pagina: "$input.page", registros_por_pagina: "$input.pageSize" }], maxAttempts: 1, pagination: { itemsPath: "lista_cidades", totalPagesPath: "total_de_paginas", pageSize: 100 } },
    "upsert-customer-by-document": { label: "Criar/atualizar cliente por CPF/CNPJ", endpoint: "geral/clientes/", call: "UpsertClienteCpfCnpj", param: { $path: "$input.param" }, maxAttempts: 1 },
    "consult-service-order": { label: "Consultar Ordem de Serviço", endpoint: "servicos/os/", call: "ConsultarOS", param: { $path: "$input.param" }, maxAttempts: 1 },
    "include-service-order": { label: "Incluir Ordem de Serviço", endpoint: "servicos/os/", call: "IncluirOS", param: { $path: "$input.param" }, maxAttempts: 1 },
    "bill-service-order": { label: "Faturar Ordem de Serviço", endpoint: "servicos/osp/", call: "FaturarOS", param: { $path: "$input.param" }, maxAttempts: 1 },
  },
  lists: [
    inboundList({ key: "services", label: "Serviços", description: "Serviços prestados cadastrados no Omie para seleção na emissão de NFS-e.", call: "list-services", model: "ServicoOmie", externalKey: "codigoServicoOmie", mapping: mapService, activeField: "status", order: 10 }),
    inboundList({ key: "categories", label: "Categorias", description: "Categorias financeiras do Omie usadas na Ordem de Serviço.", call: "list-categories", model: "CategoriaOmie", externalKey: "codigoCategoriaOmie", mapping: mapCategory, activeField: "status", order: 20 }),
    inboundList({ key: "current-accounts", label: "Contas correntes", description: "Contas correntes disponíveis para a Ordem de Serviço.", call: "list-current-accounts", model: "ContaCorrenteOmie", externalKey: "codigoContaCorrenteOmie", mapping: mapCurrentAccount, activeField: "status", order: 30 }),
    inboundList({ key: "payment-terms", label: "Condições de pagamento", description: "Formas/condições de pagamento de vendas aceitas em cCodParc.", call: "list-payment-terms", model: "CondicaoPagamentoOmie", externalKey: "codigoCondicaoPagamento", mapping: mapPaymentTerm, order: 40 }),
    inboundList({ key: "cities", label: "Cidades", description: "Cidades do Omie usadas em cCidPrestServ.", call: "list-cities", model: "CidadeOmie", externalKey: "codigoCidadeOmie", mapping: mapCity, order: 50 }),
  ],
  webhooks: [webhookAction()],
  handlers: {
    TACA_PROCESSAR_PEDIDO: legacyProcessOrder,
    TACA_PROCESSAR_ETAPA_PEDIDO: processOrderStage,
    TACA_RECONCILIAR_NFSE: handleFiscalReconcile,
    TACA_PROCESSAR_WEBHOOK_OMIE: handleOmieWebhook,
    TACA_ENVIAR_CALLBACK_PEDIDO: handleOrderCallback,
    TACA_ENVIAR_CALLBACK_ESTORNO: handleReversalCallback,
    TACA_SINCRONIZAR_LISTA_REFERENCIA: syncReferenceList,
  },
});

module.exports = { inboundList, webhookAction };
