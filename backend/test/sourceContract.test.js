"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function walk(dir) {
  const values = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) values.push(...walk(full)); else values.push(full);
  }
  return values;
}

test("Core packages are pinned exactly to 0.3.74", () => {
  const backend = JSON.parse(read("backend/package.json"));
  const frontend = JSON.parse(read("frontend/package.json"));
  assert.equal(backend.dependencies["@oondemand/oon-core-back"], "0.3.74");
  assert.equal(frontend.dependencies["@oondemand/oon-core-front"], "0.3.74");
});

test("public API contract stays English, authenticated and restricted to Platform access", () => {
  const source = read("backend/src/routes/tacaApi.js");
  const access = read("backend/src/services/taca/access.js");
  const constants = read("backend/src/services/taca/constants.js");

  assert.match(source, /defineRoutes\("\/taca\/v1"/);
  assert.doesNotMatch(source, /defineRoutes\("\/api\/taca\/v1"/);
  assert.match(source, /router\.private\.post\("\/orders"/);
  assert.match(source, /router\.private\.post\("\/orders\/:integrationCode\/reversal"/);
  assert.match(source, /assertPlatformAccess\(req\)/);
  assert.doesNotMatch(source, /roles:\s*PLATFORM_ROLES/);
  assert.match(access, /PLATFORM_SERVICE_ACCOUNTS/);
  assert.match(constants, /api-plataforma-taca@email\.com/);
  assert.match(constants, /"operador"/);
  assert.doesNotMatch(source, /\/pedidos|\/estorno\b/);
});

test("NFS-e configuration is a singleton custom form with process automation", () => {
  const ui = JSON.parse(read("frontend/central.ui.json"));
  assert.equal(ui.collections.some((collection) => collection.model === "ConfiguracaoNfse"), false);
  const page = ui.pages.find((item) => item.id === "configuracao-nfse");
  assert.equal(page?.component, "ConfiguracaoNfsePage");
  assert.equal(page?.path, "/configuracoes-nfse");

  const main = read("frontend/src/main.tsx");
  assert.match(main, /ConfiguracaoNfsePage/);
  const form = read("frontend/src/ConfiguracaoNfsePage.tsx");
  for (const tab of ["Geral", "Endereço padrão", "Automação", "API"]) assert.match(form, new RegExp(tab));
  assert.match(form, /Todas as etapas começam em modo manual/);
  assert.match(form, /Sincronizar listas Omie/);
});

test("Pedidos and estornos are exposed as process pipelines", () => {
  const ui = JSON.parse(read("frontend/central.ui.json"));
  assert.equal(ui.collections.some((collection) => ["PedidoNfse", "EstornoTaca"].includes(collection.model)), false);
  const order = ui.pipelines.find((pipeline) => pipeline.model === "PedidoNfse");
  const reversal = ui.pipelines.find((pipeline) => pipeline.model === "EstornoTaca");
  assert.ok(order);
  assert.ok(reversal);
  assert.equal(order.stageField, "etapa");
  assert.equal(reversal.stageField, "etapa");
  assert.deepEqual(order.stages.map((stage) => stage.id), [
    "Aprovação",
    "Sinc cliente (Omie)",
    "Criar OS (Omie)",
    "Gerar NF (Omie)",
    "Aguardando retorno faturamento (Omie)",
    "Baixa financeira",
    "Notificar plataforma",
    "Concluído",
  ]);
  assert.deepEqual(reversal.stages.map((stage) => stage.id), ["Requisição", "Cancelar", "Notificar plataforma", "Concluído"]);
  assert.equal(order.defaultActions, false);
  assert.equal(reversal.defaultActions, false);

  assert.equal(order.ticketActions.length, 1);
  const approve = order.ticketActions[0];
  assert.equal(approve.id, "aprovar-etapa");
  assert.equal(approve.label, "Aprovar");
  assert.equal(approve.type, "apiAction");
  assert.equal(approve.method, "POST");
  assert.equal(approve.endpoint, "/api/taca/ops/orders/:id/advance");
  assert.deepEqual(approve.hiddenWhen, { field: "etapa", equals: "Concluído" });
  assert.equal(Object.prototype.hasOwnProperty.call(approve, "visibleWhen"), false);

  assert.equal(reversal.ticketActions.some((action) => /automat/i.test(action.id || action.label)), false);
});

test("the single order approval delegates execution to the current process stage", () => {
  const workflow = read("backend/src/services/taca/workflow.js");
  assert.match(workflow, /switch \(order\.etapa\)/);
  for (const stage of [
    "ORDER_STAGE.APPROVAL",
    "ORDER_STAGE.CUSTOMER_SYNC",
    "ORDER_STAGE.CREATE_SERVICE_ORDER",
    "ORDER_STAGE.GENERATE_INVOICE",
    "ORDER_STAGE.AWAIT_BILLING_RETURN",
    "ORDER_STAGE.FINANCIAL_SETTLEMENT",
    "ORDER_STAGE.NOTIFY_PLATFORM",
  ]) {
    assert.match(workflow, new RegExp(`case ${stage.replace(".", "\\.")}:`));
  }
});

test("all order process automations default to manual", () => {
  const config = read("backend/src/services/taca/config.js");
  for (const field of [
    "automatizarAprovacao",
    "automatizarSincronizacaoCliente",
    "automatizarCriacaoOs",
    "automatizarGeracaoNf",
    "automatizarRetornoFaturamento",
    "automatizarBaixaFinanceira",
    "automatizarNotificacaoPlataforma",
  ]) {
    assert.match(config, new RegExp(`${field}: false`));
  }
  const workflow = read("backend/src/services/taca/workflow.js");
  assert.match(workflow, /TACA_PROCESSAR_ETAPA_PEDIDO/);
  assert.match(workflow, /legacy-full-flow-disabled-use-process-pipeline/);
});

test("Omie reference lists are declared and selectable configuration uses refs", () => {
  const mapping = read("backend/src/mappings/omie.js");
  for (const call of ["ListarCadastroServico", "ListarCategorias", "ListarContasCorrentes", "ListarFormasPagVendas", "PesquisarCidades"]) assert.match(mapping, new RegExp(call));
  const model = read("backend/src/models/ConfiguracaoNfse.js");
  for (const ref of ["ServicoOmie", "CategoriaOmie", "ContaCorrenteOmie", "CondicaoPagamentoOmie", "CidadeOmie"]) assert.match(model, new RegExp(`fields\\.ref\\("${ref}"`));
});

test("implementation never calls automatic Omie cancellation", () => {
  const sources = walk(path.join(root, "backend/src")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /callOmie\(["']cancel/i);
  assert.doesNotMatch(sources, /CancelarOS/);
});

test("no destructive dropDatabase is introduced", () => {
  const sources = walk(path.join(root, "backend/src")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /dropDatabase\s*\(/);
});

test("PT-BR and EN docs contain the same external endpoints and statuses", () => {
  for (const file of ["docs/api/README.pt-BR.md", "docs/api/README.en.md"]) {
    const doc = read(file);
    assert.match(doc, /POST \/api\/taca\/v1\/orders/);
    assert.match(doc, /POST \/api\/taca\/v1\/orders\/\{integrationCode\}\/reversal/);
    for (const status of ["INVOICE_ISSUED", "ERROR", "REVERSAL_PENDING", "REVERSED"]) assert.match(doc, new RegExp(status));
  }
});