# Taca Platform API — Omie NFS-e Central

This document defines the external contract used by the Taca Platform. Endpoints, JSON fields and external statuses are intentionally English-only.

## 1. Authentication

The Platform must use a dedicated OonCore user with the `Canal de Vendas (plataforma)` RBAC profile (`canal-vendas`). Do not reuse a human account. Token/session handling follows the standard OonCore 0.3.75 authentication flow.

- keep credentials outside source control;
- rotate credentials through the standard OonCore user process;
- do not grant the `Administrador` or `Operador` profiles to the Platform account;
- missing authentication is rejected with `401` by the Core;
- an authenticated user without the required RBAC permission is rejected with `403` by the Core.

## 2. Submit an order

`POST /api/taca/v1/orders`

The HTTP request validates, persists and enqueues work; it does not wait for Omie.

```json
{
  "integrationCode": "PAY-123456",
  "amount": 149.9,
  "customer": {
    "document": "12.345.678/0001-90",
    "legalName": "Example Customer Ltd",
    "tradeName": "Example Customer",
    "email": "billing@example.com",
    "simpleNationalTaxpayer": false,
    "address": {
      "street": "Example Street",
      "number": "100",
      "complement": "Suite 2",
      "district": "Downtown",
      "cityIbgeCode": "3550308",
      "state": "SP",
      "postalCode": "01001000"
    }
  }
}
```

`simpleNationalTaxpayer` is optional in the Taca contract; send it when known for a new customer because Omie fiscal validation may require additional customer data depending on the operation.

New request: HTTP `202`.

```json
{ "integrationCode": "PAY-123456", "status": "RECEIVED" }
```

An idempotent replay with the same `integrationCode`, amount and customer document returns the existing state with HTTP `200`. Reusing the code with a different amount or document returns `409` / `IDEMPOTENCY_CONFLICT`.

External statuses: `RECEIVED`, `VALIDATED`, `CUSTOMER_SYNCED`, `SERVICE_ORDER_CREATED`, `INVOICE_PROCESSING`, `INVOICE_ISSUED`, `ERROR`.

## 3. Address fallback

Each address field is resolved independently:

1. request value;
2. configured default value;
3. missing.

The local address policy requires `street`, `number`, `district`, `cityIbgeCode`, `state` and `postalCode`. `complement` is optional in the Taca API.

When `allowIssuanceWithoutAddress=false`, unresolved required fields return HTTP `422` before any Omie call. When it is `true`, local processing continues and Omie performs its own fiscal validation. Effective address values and their origins are stored for audit.

## 4. Idempotency

- customer: normalized CPF/CNPJ is unique;
- order: `integrationCode` is unique and protected by a request fingerprint;
- Omie service order: `cCodIntOS = integrationCode`; `ConsultarOS` runs before `IncluirOS`;
- an ambiguous `IncluirOS` failure is reconciled by `cCodIntOS` before a retry;
- callback delivery has its own revisioned Ticket;
- one reversal Ticket exists per `integrationCode`.

## 5. Omie flow

For a customer without a local Omie link, the Central calls `UpsertClienteCpfCnpj` and persists `codigo_cliente_omie`. A linked customer is reused without a lookup on every order.

The service order uses the configured `nCodServico`, `nQtde = 1`, `nValUnit = amount`, `cCodIntOS = integrationCode`, customer code, category, service city and current account when configured. Payment condition defaults to `000` (cash/immediate) and is configurable.

`FaturarOS` acceptance is not treated as final fiscal confirmation. The Central reads the correlated OS and `ListaRpsNfse`: `001/002` means `INVOICE_PROCESSING`, `003` means `ERROR`, and `004` becomes `INVOICE_ISSUED` only when an invoice number is present. Omie webhooks trigger the same correlated reconciliation path.

## 6. Order callback

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

Callback URL, timeout, retry count and authentication mode are configurable. The secret itself is read from an environment variable (default variable name: `TACA_CALLBACK_SECRET`) and is never stored in the database.

Modes: `none`, `bearer`, or `hmac-sha256`. HMAC uses header `X-Taca-Signature: sha256=<hex>` over the exact JSON request body.

Callback failure never changes the fiscal result and never reissues the invoice. Operators can use **Resend callback**.

## 7. Request a reversal

`POST /api/taca/v1/orders/{integrationCode}/reversal`

The order must already be `INVOICE_ISSUED`. The Central does **not** call `CancelarOS`; it creates a manual reversal Ticket.

HTTP `202`:

```json
{ "integrationCode": "PAY-123456", "status": "REVERSAL_PENDING" }
```

A replay returns the existing Ticket with HTTP `200`. After the operator manually completes the reversal in Omie/city system, **Confirm reversal completed** records the operator and timestamp and sends:

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

## 8. Operations

The Central provides Dashboard, Orders / NFS-e, Reversals, Omie Integrations, NFS-e Settings and Help. Order actions reconcile only that invoice or resend only that callback. Manual reversal state cannot be reverted by automation.

## 9. Throughput

Ingress is decoupled from Omie. Automatic queue processing uses `TACA_INTEGRATION_BATCH_SIZE` (default 100, max 500) with no fixed five-second throttle. Every Omie call uses a single technical attempt; retries happen through idempotent workflow steps.

Fiscal fallback checks only the current service order with bounded attempts and exponential backoff. If the city remains pending, the order remains `INVOICE_PROCESSING` for an Omie webhook or an operator-triggered reconcile.

Run homologation E2E and a load test matching expected peaks before a ~200,000 invoice/month Go-Live.
