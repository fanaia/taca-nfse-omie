"use strict";

const { defineOmieMapping } = require("@oondemand/oon-core-back");
const { handleOrderCallback, handleReversalCallback } = require("../services/taca/callback");
const { handleFiscalReconcile, handleOmieWebhook, processOrder } = require("../services/taca/workflow");

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

defineOmieMapping("taca-nfse-omie", {
  instances: [{ id: "default", label: "Omie Taça" }],
  calls: {
    "test-connection": {
      label: "Testar conexão com o Omie",
      endpoint: "geral/clientes/",
      call: "ListarClientes",
      param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: "N" }],
      maxAttempts: 1,
      connectionTest: true,
    },
    "upsert-customer-by-document": {
      label: "Criar/recuperar cliente por CPF/CNPJ",
      endpoint: "geral/clientes/",
      call: "UpsertClienteCpfCnpj",
      param: { $path: "$input.param" },
      maxAttempts: 1,
    },
    "consult-service-order": {
      label: "Consultar Ordem de Serviço",
      endpoint: "servicos/os/",
      call: "ConsultarOS",
      param: { $path: "$input.param" },
      maxAttempts: 1,
    },
    "include-service-order": {
      label: "Incluir Ordem de Serviço",
      endpoint: "servicos/os/",
      call: "IncluirOS",
      param: { $path: "$input.param" },
      maxAttempts: 1,
    },
    "bill-service-order": {
      label: "Faturar Ordem de Serviço",
      endpoint: "servicos/osp/",
      call: "FaturarOS",
      param: { $path: "$input.param" },
      maxAttempts: 1,
    },
  },
  lists: [],
  webhooks: [webhookAction()],
  handlers: {
    TACA_PROCESSAR_PEDIDO: processOrder,
    TACA_RECONCILIAR_NFSE: handleFiscalReconcile,
    TACA_PROCESSAR_WEBHOOK_OMIE: handleOmieWebhook,
    TACA_ENVIAR_CALLBACK_PEDIDO: handleOrderCallback,
    TACA_ENVIAR_CALLBACK_ESTORNO: handleReversalCallback,
  },
});

module.exports = { webhookAction };
