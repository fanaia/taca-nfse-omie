"use strict";

const ORDER_STATUSES = [
  "RECEIVED",
  "VALIDATED",
  "CUSTOMER_SYNCED",
  "SERVICE_ORDER_CREATED",
  "INVOICE_PROCESSING",
  "INVOICE_ISSUED",
  "ERROR",
];

const document = {
  openapi: "3.0.3",
  info: {
    title: "Taça Platform API — NFS-e Omie",
    version: "1.0.0",
    description:
      "API pública da Plataforma Taça para autenticação, envio de pedidos pagos para emissão assíncrona de NFS-e e solicitação de estorno manual.",
  },
  servers: [{ url: "/", description: "Central Taça atual" }],
  tags: [
    { name: "Authentication", description: "Obtenção do token de acesso da Central." },
    { name: "Orders", description: "Emissão de NFS-e e solicitação de estorno." },
  ],
  paths: {
    "/api/auth/autenticar": {
      post: {
        tags: ["Authentication"],
        summary: "Autenticar a Plataforma Taça",
        description:
          "Envie as credenciais do usuário dedicado `integracao-taca` via HTTP Basic Auth. O token retornado deve ser usado como `Authorization: Bearer <token>` nos endpoints de pedidos.",
        security: [{ basicAuth: [] }],
        responses: {
          200: {
            description: "Autenticação realizada.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          401: { description: "Credenciais ausentes ou inválidas." },
          403: { description: "Usuário sem acesso ao aplicativo." },
          502: { description: "Falha de comunicação com o provedor de autenticação." },
          504: { description: "Timeout do provedor de autenticação." },
        },
      },
    },
    "/api/taca/v1/orders": {
      post: {
        tags: ["Orders"],
        summary: "Gerar pedido para emissão de NFS-e",
        description:
          "Recebe um pagamento confirmado, valida e persiste o pedido de forma idempotente e enfileira o processamento assíncrono no Omie.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderRequest" },
              example: {
                integrationCode: "PAY-123456",
                amount: 149.9,
                customer: {
                  document: "12.345.678/0001-90",
                  legalName: "Cliente Exemplo Ltda",
                  tradeName: "Cliente Exemplo",
                  email: "fiscal@example.com",
                  simpleNationalTaxpayer: false,
                  address: {
                    street: "Rua Exemplo",
                    number: "100",
                    complement: "Sala 2",
                    district: "Centro",
                    cityIbgeCode: "3550308",
                    state: "SP",
                    postalCode: "01001000",
                  },
                },
              },
            },
          },
        },
        responses: {
          202: {
            description: "Pedido novo aceito para processamento.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OrderResponse" } } },
          },
          200: {
            description: "Replay idempotente; retorna o estado já existente.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OrderResponse" } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          409: { $ref: "#/components/responses/Conflict" },
          422: { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/taca/v1/orders/{integrationCode}/reversal": {
      post: {
        tags: ["Orders"],
        summary: "Solicitar estorno do pedido",
        description:
          "Cria, de forma idempotente, um Ticket para execução manual do estorno. O cancelamento da OS permanece uma operação manual.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "integrationCode",
            required: true,
            description: "Código único do pedido informado na criação.",
            schema: { type: "string", maxLength: 60 },
            example: "PAY-123456",
          },
        ],
        responses: {
          202: {
            description: "Solicitação de estorno aceita.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReversalResponse" } } },
          },
          200: {
            description: "Replay idempotente; retorna a solicitação existente.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReversalResponse" } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
        description: "Credenciais do usuário dedicado da Plataforma Taça.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "token",
        description: "Token retornado por `POST /api/auth/autenticar`.",
      },
    },
    responses: {
      Unauthorized: {
        description: "Token ausente ou inválido.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Forbidden: {
        description: "Usuário autenticado sem role permitida.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      NotFound: {
        description: "Pedido não encontrado.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Conflict: {
        description: "Conflito de idempotência ou regra de negócio.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      ValidationError: {
        description: "Payload inválido ou política de endereço não atendida.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
    },
    schemas: {
      AuthResponse: {
        type: "object",
        description:
          "Resposta do mecanismo padrão de autenticação do OonCore. O campo `token` é usado nas chamadas autenticadas; campos adicionais do provedor podem ser retornados.",
        properties: {
          token: { type: "string", description: "Token Bearer de acesso." },
          usuario: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      Address: {
        type: "object",
        properties: {
          street: { type: "string" },
          number: { type: "string" },
          complement: { type: "string" },
          district: { type: "string" },
          cityIbgeCode: { type: "string" },
          state: { type: "string" },
          postalCode: { type: "string" },
        },
      },
      Customer: {
        type: "object",
        required: ["document", "legalName", "email"],
        properties: {
          document: { type: "string", description: "CPF ou CNPJ; pontuação é opcional." },
          legalName: { type: "string" },
          tradeName: { type: "string" },
          email: { type: "string", format: "email" },
          simpleNationalTaxpayer: { type: "boolean" },
          address: { $ref: "#/components/schemas/Address" },
        },
      },
      OrderRequest: {
        type: "object",
        required: ["integrationCode", "amount", "customer"],
        properties: {
          integrationCode: { type: "string", maxLength: 60 },
          amount: { type: "number", minimum: 0.01 },
          customer: { $ref: "#/components/schemas/Customer" },
        },
      },
      Invoice: {
        type: "object",
        properties: {
          number: { type: "string" },
          verificationCode: { type: "string" },
          url: { type: "string", format: "uri" },
        },
      },
      OrderResponse: {
        type: "object",
        required: ["integrationCode", "status"],
        properties: {
          integrationCode: { type: "string" },
          status: { type: "string", enum: ORDER_STATUSES },
          invoice: { $ref: "#/components/schemas/Invoice" },
          message: { type: "string" },
        },
      },
      ReversalResponse: {
        type: "object",
        required: ["integrationCode", "status"],
        properties: {
          integrationCode: { type: "string" },
          status: { type: "string", enum: ["REVERSAL_PENDING", "REVERSED"] },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "object", additionalProperties: true },
            },
          },
          message: { type: "string", description: "Formato de erro que também pode ser emitido pelo Core." },
        },
        additionalProperties: true,
      },
    },
  },
};

module.exports = document;
