"use strict";

const { defineRoutes } = require("@oondemand/oon-core-back");
const { PLATFORM_ROLES } = require("../services/taca/constants");
const { currentUser, externalOrder, externalReversal, receiveOrder, requestReversal } = require("../services/taca/workflow");

function sendError(res, error) {
  const status = Number(error?.statusCode || 500);
  const code = String(error?.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"));
  res.status(status).json({ error: { code, message: String(error?.message || "Unexpected error."), details: error?.details || undefined } });
}

// O delivery do OonCore publica /api/* no Nginx e remove o prefixo /api
// antes de encaminhar para o Express (proxy_pass ...:4000/). Portanto o
// contrato externo /api/taca/v1/* deve ser registrado internamente como
// /taca/v1/*.
defineRoutes("/taca/v1", (router) => {
  router.private.post("/orders", { roles: PLATFORM_ROLES }, async (req, res) => {
    try {
      const result = await receiveOrder(req.body || {});
      res.status(result.created ? 202 : 200).json(externalOrder(result.order));
    } catch (error) { sendError(res, error); }
  });

  router.private.post("/orders/:integrationCode/reversal", { roles: PLATFORM_ROLES }, async (req, res) => {
    try {
      const result = await requestReversal(req.params.integrationCode, currentUser(req));
      res.status(result.created ? 202 : 200).json(externalReversal(result.reversal));
    } catch (error) { sendError(res, error); }
  });
});

module.exports = { sendError };
