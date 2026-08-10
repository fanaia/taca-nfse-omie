# Central Taça — NFS-e Omie

Side-Car Omie da Plataforma Taça para receber pagamentos confirmados, emitir NFS-e de forma assíncrona e operar estornos por Ticket manual.

## Documentação pública da API

Após a publicação da Central, a documentação de integração fica disponível no próprio backend, sem exigir login:

- `GET /api/taca/v1/docs` — Swagger UI interativo;
- `GET /api/taca/v1/openapi.json` — contrato OpenAPI 3.0.3 em JSON.

O Swagger documenta o fluxo completo da Plataforma:

1. `POST /auth/autenticar` com HTTP Basic Auth para obter o token do usuário dedicado `integracao-taca`;
2. uso do token como `Authorization: Bearer <token>` nas operações da API;
3. `POST /api/taca/v1/orders` para gerar o pedido de emissão;
4. `POST /api/taca/v1/orders/{integrationCode}/reversal` para solicitar o estorno manual.

A documentação é pública; os endpoints de negócio continuam protegidos pelo OonCore e pela role da Plataforma.

## Contratos principais

- Core backend/frontend fixos em `0.3.74`;
- `POST /api/taca/v1/orders` — entrada idempotente;
- `POST /api/taca/v1/orders/{integrationCode}/reversal` — solicitação idempotente de estorno manual;
- cliente único por CPF/CNPJ normalizado;
- OS única por `cCodIntOS = integrationCode`;
- conclusão somente após confirmação fiscal;
- callback independente e reprocessável;
- nenhum cancelamento automático de OS.

Documentação da integração no repositório:

- `docs/api/README.pt-BR.md`
- `docs/api/README.en.md`
- `docs/api/openapi.yaml`

## Desenvolvimento

```bash
cd backend && npm ci && npm test
cd ../frontend && npm ci && npm run build
```

Credenciais Omie são configuradas pelo módulo nativo de Integrações do OonCore. O segredo do callback é lido de variável de ambiente (`TACA_CALLBACK_SECRET` por padrão) e não deve ser versionado.
