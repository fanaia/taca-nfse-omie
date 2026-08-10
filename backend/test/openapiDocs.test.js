"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const openapi = require("../src/services/taca/openapi");

test("OpenAPI documents authentication and both public platform operations", () => {
  assert.equal(openapi.openapi, "3.0.3");
  assert.ok(openapi.paths["/api/auth/autenticar"]?.post);
  assert.deepEqual(openapi.paths["/api/auth/autenticar"].post.security, [{ basicAuth: [] }]);

  const createOrder = openapi.paths["/api/taca/v1/orders"]?.post;
  assert.ok(createOrder);
  assert.deepEqual(createOrder.security, [{ bearerAuth: [] }]);
  assert.equal(createOrder.requestBody.content["application/json"].schema.$ref, "#/components/schemas/OrderRequest");

  const reversal = openapi.paths["/api/taca/v1/orders/{integrationCode}/reversal"]?.post;
  assert.ok(reversal);
  assert.deepEqual(reversal.security, [{ bearerAuth: [] }]);
});

test("Swagger UI and OpenAPI JSON are public backend routes behind the /api delivery proxy", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "../src/routes/tacaDocs.js"), "utf8");
  assert.match(routeSource, /defineRoutes\("\/taca\/v1"/);
  assert.doesNotMatch(routeSource, /defineRoutes\("\/api\/taca\/v1"/);
  assert.match(routeSource, /router\.public\.get\("\/docs"/);
  assert.match(routeSource, /router\.public\.get\("\/openapi\.json"/);
  assert.match(routeSource, /url: "\/api\/taca\/v1\/openapi\.json"/);
  assert.match(routeSource, /swagger-ui-dist@5/);
});
