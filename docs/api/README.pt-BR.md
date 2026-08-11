# API da Plataforma Taça — Central NFS-e Omie

Esta documentação descreve o contrato externo da Plataforma Taça. **Endpoints, campos JSON e status externos permanecem em inglês**.

## 0. URL pública da API

A Central publica frontend e backend em hosts diferentes. No ambiente de desenvolvimento:

- Frontend: `https://taca-nfse-omie-dev.central.oondemand.online`
- Base da API: `https://api-taca-nfse-omie-dev.central.oondemand.online/api`
- Swagger UI: `https://api-taca-nfse-omie-dev.central.oondemand.online/api/taca/v1/docs`
- OpenAPI JSON: `https://api-taca-nfse-omie-dev.central.oondemand.online/api/taca/v1/openapi.json`

Integrações externas devem usar o host `api-*`; o host do frontend não é a base da API.

## 1. Autenticação

A Plataforma deve usar um usuário dedicado da Central com o perfil RBAC `Canal de Vendas (plataforma)` (`canal-vendas`), criado no OonCore e sem uso humano compartilhado. O token/sessão segue o mecanismo padrão de autenticação do OonCore 0.3.75.

- guardar a credencial fora do código-fonte;
- rotacionar a credencial pelo processo padrão de usuários do OonCore;
- não atribuir os perfis `Administrador` ou `Operador` ao usuário da Plataforma;
- ausência de autenticação retorna `401` pelo Core;
- usuário autenticado sem a permissão RBAC exigida retorna `403` pelo Core.

A autenticação pública é feita em `POST /api/auth/autenticar` usando HTTP Basic Auth. O token retornado deve ser enviado como `Authorization: Bearer <token>` nas operações da Taça.

## 2. Criar pedido para emissão

`POST /api/taca/v1/orders`

O endpoint valida e persiste rapidamente e retorna antes das chamadas Omie. O processamento segue pela fila de Tickets.

### Request

```json
{
  "integrationCode": "PAY-123456",
  "amount": 149.9,
  "customer": {
    "document": "12.345.678/0001-90",
    "legalName": "Cliente Exemplo Ltda",
    "tradeName": "Cliente Exemplo",
    "email": "fiscal@example.com",
    "simpleNationalTaxpayer": false,
    "address": {
      "street": "Rua Exemplo",
      "number": "100",
      "complement": "Sala 2",
      "district": "Centro",
      "cityIbgeCode": "3550308",
      "state": "SP",
      "postalCode": "01001000"
    }
  }
}
```

`simpleNationalTaxpayer` é opcional no contrato da Taça. Para cliente novo, recomenda-se enviá-lo quando conhecido, pois o cadastro fiscal do Omie pode exigir informações adicionais conforme a operação.

### Response novo

HTTP `202`

```json
{
  "integrationCode": "PAY-123456",
  "status": "RECEIVED"
}
```

### Replay idempotente

O mesmo `integrationCode`, `amount` e Documento retorna o estado já existente com HTTP `200`; não cria segunda OS/NFS-e. Se o mesmo `integrationCode` for reutilizado com outro valor ou Documento, retorna HTTP `409` com `IDEMPOTENCY_CONFLICT`.

### Status externos

`RECEIVED`, `VALIDATED`, `CUSTOMER_SYNCED`, `SERVICE_ORDER_CREATED`, `INVOICE_PROCESSING`, `INVOICE_ISSUED`, `ERROR`.

## 3. Endereço e fallback

A resolução é campo a campo:

1. valor de `customer.address` enviado no request;
2. valor padrão em **Configurações → Emissão NFS-e**;
3. campo ausente.

Os campos usados na política local são `street`, `number`, `district`, `cityIbgeCode`, `state` e `postalCode`; `complement` é opcional na API da Taça.

Com `allowIssuanceWithoutAddress=false`, qualquer campo obrigatório ainda ausente gera `422` **antes** do Omie:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Address data is insufficient after applying configured defaults.",
    "details": { "missingFields": ["street", "postalCode"] }
  }
}
```

Com `allowIssuanceWithoutAddress=true`, a Central permite o processamento local e deixa o Omie aplicar sua validação fiscal. O endereço efetivamente usado e a origem de cada campo ficam persistidos para auditoria.

## 4. Idempotência

- cliente: CPF/CNPJ somente dígitos em `documentoNormalizado`, índice único;
- pedido: `integrationCode`, índice único + fingerprint de valor/Documento;
- OS Omie: `cCodIntOS = integrationCode`; antes de `IncluirOS`, a Central executa `ConsultarOS`;
- falha ambígua após `IncluirOS`: reconcilia por `cCodIntOS` antes de permitir retry;
- callback: Ticket por revisão, independente da NFS-e;
- estorno: um Ticket por `integrationCode`.

## 5. Fluxo Omie

Para cliente ainda sem vínculo local, a Central usa `UpsertClienteCpfCnpj` e persiste `codigo_cliente_omie`. Cliente já vinculado não gera consulta repetitiva a cada pedido.

A OS usa `cCodIntOS = integrationCode`, `nCodCli`, o `nCodServico` configurado, `nQtde = 1`, `nValUnit = amount`, categoria, cidade de prestação e conta corrente quando configurada. A condição de pagamento padrão é `000` (à vista), configurável.

Após `FaturarOS`, a Central não marca sucesso apenas pelo aceite do método. Ela consulta a OS e observa `ListaRpsNfse`: `001/002` permanecem `INVOICE_PROCESSING`, `003` vira `ERROR` e `004` só vira `INVOICE_ISSUED` quando há número de NFS-e. Webhook Omie também aciona a reconciliação da OS correlacionada.

## 6. Callback do pedido

Callback terminal:

```json
{
  "integrationCode": "PAY-123456",
  "type": "order",
  "status": "INVOICE_ISSUED",
  "invoice": {
    "number": "12345",
    "verificationCode": "ABC123",
    "url": "https://..."
  },
  "message": ""
}
```

A URL, timeout, quantidade de tentativas e modo de autenticação ficam em Configurações. O segredo **não** é armazenado no banco; a configuração guarda somente o nome da variável de ambiente, por padrão `TACA_CALLBACK_SECRET`.

Modos:

- `none`: sem assinatura;
- `bearer`: `Authorization: Bearer <secret>`;
- `hmac-sha256`: header `X-Taca-Signature` no formato `sha256=<hex>` calculado sobre o body JSON bruto.

Falha de callback não altera o estado fiscal e nunca refatura. O operador pode usar **Reenviar callback**.

## 7. Solicitar estorno

`POST /api/taca/v1/orders/{integrationCode}/reversal`

O pedido precisa estar em `INVOICE_ISSUED`. A Central **não chama `CancelarOS`**. Ela cria um Ticket manual.

HTTP `202`:

```json
{
  "integrationCode": "PAY-123456",
  "status": "REVERSAL_PENDING"
}
```

Replay retorna HTTP `200` e o Ticket existente.

O operador abre **Estornos**, executa o cancelamento/estorno fora da automação e usa **Confirmar estorno concluído**. A ação registra usuário/data e dispara:

```json
{
  "integrationCode": "PAY-123456",
  "type": "reversal",
  "status": "REVERSED",
  "invoice": {
    "number": "12345",
    "verificationCode": "ABC123",
    "url": "https://..."
  },
  "message": ""
}
```

## 8. Operação e telas

- **Dashboard:** emissões hoje, emitidas, em processamento, erros, callbacks pendentes, estornos pendentes, taxa de sucesso, tempo médio, throughput e idade do pendente mais antigo;
- **Pedidos / NFS-e:** Documento mascarado, cliente, valor, status, OS, NFS-e, callback e ações de reconciliação/reenvio;
- **Estornos:** Tickets manuais e confirmação humana;
- **Integrações:** configuração e Tickets do Omie;
- **Configurações → Emissão NFS-e:** serviço, categoria, conta, cidade, endereço padrão e callback;
- **Ajuda:** resumo operacional e troubleshooting.

## 9. Capacidade e concorrência

A entrada é desacoplada do Omie. O auto-processamento usa `TACA_INTEGRATION_BATCH_SIZE` (default 100, máximo 500) e não possui throttle fixo herdado do Tazay. As chamadas Omie usam `maxAttempts: 1` por chamada; retries acontecem na esteira idempotente, não dentro de um storm de requests.

A confirmação fiscal consulta **somente a OS do Ticket atual**, com número explícito e limitado de tentativas e backoff. Se continuar pendente, permanece `INVOICE_PROCESSING` para webhook Omie ou ação manual **Reprocessar confirmação fiscal**.

Antes do Go-Live de ~200 mil emissões/mês, executar teste de carga e E2E de homologação com credenciais reais.

## 10. Checklist E2E de homologação

1. criar usuário dedicado `integracao-taca`;
2. validar `401`, `403` e autenticação válida;
3. enviar pedido com endereço próprio;
4. validar cliente por Documento;
5. validar uma única OS e `FaturarOS`;
6. confirmar NFS-e real e callback;
7. repetir o mesmo request e comprovar ausência de segunda NFS-e;
8. testar endereço 100% padrão e parcial;
9. testar bloqueio e permissão sem endereço;
10. solicitar estorno, executar manualmente, confirmar e validar callback `REVERSED`;
11. executar teste de carga com perfil equivalente aos picos esperados.
