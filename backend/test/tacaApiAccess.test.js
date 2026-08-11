"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "central.app.json"), "utf8"),
);
const apiSource = fs.readFileSync(
  path.join(root, "backend/src/routes/tacaApi.js"),
  "utf8",
);
const opsSource = fs.readFileSync(
  path.join(root, "backend/src/routes/tacaOps.js"),
  "utf8",
);

function role(code) {
  return manifest.rbac.roles.find((item) => item.code === code);
}

test("RBAC da Central Taça declara os três perfis esperados", () => {
  assert.deepEqual(
    manifest.rbac.roles.map((item) => item.name),
    ["Administrador", "Operador", "Canal de Vendas (plataforma)"],
  );

  assert.deepEqual(role("admin").permissions, ["*"]);
  assert.deepEqual(role("operador").permissions, [
    "taca.operation.read",
    "taca.operation.execute",
  ]);
  assert.deepEqual(role("canal-vendas").permissions, [
    "taca.platform.orders.create",
    "taca.platform.reversals.create",
  ]);
});

test("Canal de Vendas não recebe permissões internas da Central", () => {
  const permissions = role("canal-vendas").permissions;
  assert.equal(permissions.includes("taca.operation.read"), false);
  assert.equal(permissions.includes("taca.operation.execute"), false);
  assert.equal(permissions.includes("taca.configuration.manage"), false);
  assert.equal(permissions.includes("taca.data.write"), false);
});

test("API pública autenticada usa permissões específicas da plataforma", () => {
  assert.match(apiSource, /TACA_PERMISSIONS\.PLATFORM_ORDER_CREATE/);
  assert.match(apiSource, /TACA_PERMISSIONS\.PLATFORM_REVERSAL_CREATE/);
  assert.doesNotMatch(apiSource, /assertPlatformAccess|PLATFORM_SERVICE_ACCOUNTS/);
});

test("rotas operacionais usam permissões e não roles legadas", () => {
  assert.match(opsSource, /TACA_PERMISSIONS\.OPERATION_READ/);
  assert.match(opsSource, /TACA_PERMISSIONS\.OPERATION_EXECUTE/);
  assert.match(opsSource, /TACA_PERMISSIONS\.CONFIGURATION_MANAGE/);
  assert.doesNotMatch(opsSource, /OPERATOR_ROLES|roles:/);
});

test("Central está compatível apenas com a linha 0.3.75", () => {
  assert.deepEqual(manifest.compatibility.core, {
    minVersion: "0.3.75",
    maxVersionExclusive: "0.3.76",
  });
});
