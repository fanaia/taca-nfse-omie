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

test("public API contract stays English and protected by Core private routes", () => {
  const source = read("backend/src/routes/tacaApi.js");
  assert.match(source, /router\.private\.post\("\/orders"/);
  assert.match(source, /router\.private\.post\("\/orders\/:integrationCode\/reversal"/);
  assert.match(source, /PLATFORM_ROLES/);
  assert.doesNotMatch(source, /\/pedidos|\/estorno\b/);
});

test("NFS-e configuration is a singleton custom form instead of a CRUD datagrid", () => {
  const ui = JSON.parse(read("frontend/central.ui.json"));
  assert.equal(ui.collections.some((collection) => collection.model === "ConfiguracaoNfse"), false);
  const page = ui.pages.find((item) => item.id === "configuracao-nfse");
  assert.equal(page?.component, "ConfiguracaoNfsePage");
  assert.equal(page?.path, "/configuracoes-nfse");

  const main = read("frontend/src/main.tsx");
  assert.match(main, /ConfiguracaoNfsePage/);
  const form = read("frontend/src/ConfiguracaoNfsePage.tsx");
  for (const tab of ["Geral", "Endereço padrão", "API"]) assert.match(form, new RegExp(tab));
  assert.match(form, /Sincronizar listas Omie/);
});

test("Omie reference lists are declared and selectable configuration uses refs", () => {
  const mapping = read("backend/src/mappings/omie.js");
  for (const call of ["ListarCadastroServico", "ListarCategorias", "ListarContasCorrentes", "ListarFormasPagVendas", "PesquisarCidades"]) {
    assert.match(mapping, new RegExp(call));
  }
  const model = read("backend/src/models/ConfiguracaoNfse.js");
  for (const ref of ["ServicoOmie", "CategoriaOmie", "ContaCorrenteOmie", "CondicaoPagamentoOmie", "CidadeOmie"]) {
    assert.match(model, new RegExp(`fields\\.ref\\("${ref}"`));
  }
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
