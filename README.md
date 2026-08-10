# Central Taça — NFS-e Omie

Side-Car Omie da Plataforma Taça para receber pagamentos confirmados, emitir NFS-e de forma assíncrona e operar estornos por Ticket manual.

## Contratos principais

- Core backend/frontend fixos em `0.3.74`;
- `POST /api/taca/v1/orders` — entrada idempotente;
- `POST /api/taca/v1/orders/{integrationCode}/reversal` — solicitação idempotente de estorno manual;
- cliente único por CPF/CNPJ normalizado;
- OS única por `cCodIntOS = integrationCode`;
- conclusão somente após confirmação fiscal;
- callback independente e reprocessável;
- nenhum `CancelarOS` automático.

Documentação da integração:

- `docs/api/README.pt-BR.md`
- `docs/api/README.en.md`
- `docs/api/openapi.yaml`

## Desenvolvimento

```bash
cd backend && npm ci && npm test
cd ../frontend && npm ci && npm run build
```

Credenciais Omie são configuradas pelo módulo nativo de Integrações do OonCore. O segredo do callback é lido de variável de ambiente (`TACA_CALLBACK_SECRET` por padrão) e não deve ser versionado.
