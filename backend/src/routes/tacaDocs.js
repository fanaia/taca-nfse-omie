"use strict";

const { defineRoutes } = require("@oondemand/oon-core-back");
const openapi = require("../services/taca/openapi");

const SWAGGER_CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

function swaggerInitScript() {
  return `"use strict";
window.ui = SwaggerUIBundle({
  url: "/api/taca/v1/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  persistAuthorization: true,
  displayRequestDuration: true,
  filter: true,
  tryItOutEnabled: true
});
`;
}

function swaggerHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taça Platform API — Swagger</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *::before, *::after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="/api/taca/v1/docs-init.js"></script>
</body>
</html>`;
}

// A URL pública mantém /api/taca/v1/*, porém o Nginx do delivery OonCore
// remove /api antes de encaminhar a requisição ao backend Express.
defineRoutes("/taca/v1", (router) => {
  router.public.get("/openapi.json", async (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.status(200).json(openapi);
  });

  router.public.get("/docs-init.js", async (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.type("application/javascript").status(200).send(swaggerInitScript());
  });

  router.public.get("/docs", async (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.set("Content-Security-Policy", SWAGGER_CSP);
    res.type("html").status(200).send(swaggerHtml());
  });
});

module.exports = { SWAGGER_CSP, swaggerHtml, swaggerInitScript };
