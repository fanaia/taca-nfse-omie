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
