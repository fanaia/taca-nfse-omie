"use strict";

const { defineRoutes } = require("@oondemand/oon-core-back");
const { getConfig } = require("../services/taca/config");
const { OPERATOR_ROLES } = require("../services/taca/constants");
const { models } = require("../services/taca/runtime");
const { confirmReversal, currentUser, enqueueFiscalReconcile, resendOrderCallback, resendReversalCallback } = require("../services/taca/workflow");

function startTodaySaoPaulo(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00-03:00`);
}

async function dashboard() {
  const { PedidoNfse, EstornoTaca } = models();
  const today = startTodaySaoPaulo();
  const processingStatuses = ["VALIDATED", "CUSTOMER_SYNCED", "SERVICE_ORDER_CREATED", "INVOICE_PROCESSING"];
  const [emissionsToday, issued, processing, errors, orderCallbacksPending, reversalCallbacksPending, reversalsPending, avgRows, lastHour, oldestPending] = await Promise.all([
    PedidoNfse.countDocuments({ receivedAt: { $gte: today } }),
    PedidoNfse.countDocuments({ externalStatus: "INVOICE_ISSUED" }),
    PedidoNfse.countDocuments({ externalStatus: { $in: processingStatuses } }),
    PedidoNfse.countDocuments({ externalStatus: "ERROR" }),
    PedidoNfse.countDocuments({ callbackStatus: { $in: ["PENDING", "ERROR"] } }),
    EstornoTaca.countDocuments({ callbackStatus: { $in: ["PENDING", "ERROR"] } }),
    EstornoTaca.countDocuments({ status: "PENDENTE" }),
    PedidoNfse.aggregate([{ $match: { invoiceConfirmedAt: { $ne: null }, receivedAt: { $ne: null } } }, { $project: { duration: { $subtract: ["$invoiceConfirmedAt", "$receivedAt"] } } }, { $group: { _id: null, avg: { $avg: "$duration" } } }]),
    PedidoNfse.countDocuments({ receivedAt: { $gte: new Date(Date.now() - 3600000) } }),
    PedidoNfse.findOne({ externalStatus: { $in: processingStatuses } }).sort({ receivedAt: 1 }).select({ receivedAt: 1 }).lean(),
  ]);
  const terminal = issued + errors;
  return { emissionsToday, issued, processing, errors, callbacksPending: orderCallbacksPending + reversalCallbacksPending, reversalsPending, successRate: terminal ? Math.round((issued / terminal) * 10000) / 100 : 0, averageConfirmationMs: Math.round(Number(avgRows?.[0]?.avg || 0)), throughputLastHour: lastHour, oldestPendingAgeMs: oldestPending?.receivedAt ? Date.now() - new Date(oldestPending.receivedAt).getTime() : 0 };
}

defineRoutes("/api/taca/ops", (router) => {
  router.private.get("/dashboard", { roles: OPERATOR_ROLES }, async (_req, res) => res.json(await dashboard()));
  router.private.post("/config/initialize", { roles: OPERATOR_ROLES }, async (_req, res) => res.json({ config: await getConfig({ create: true }) }));
  router.private.post("/orders/:id/reconcile", { roles: OPERATOR_ROLES }, async (req, res) => res.status(202).json(await enqueueFiscalReconcile(req.params.id)));
  router.private.post("/orders/:id/resend-callback", { roles: OPERATOR_ROLES }, async (req, res) => res.status(202).json(await resendOrderCallback(req.params.id)));
  router.private.post("/reversals/:id/confirm", { roles: OPERATOR_ROLES, audit: { action: "UPDATE", entity: "EstornoTaca" } }, async (req, res) => {
    const reversal = await confirmReversal(req.params.id, { user: currentUser(req), note: req.body?.note });
    res.json({ id: String(reversal._id), integrationCode: reversal.integrationCode, status: reversal.externalStatus });
  });
  router.private.post("/reversals/:id/resend-callback", { roles: OPERATOR_ROLES }, async (req, res) => res.status(202).json(await resendReversalCallback(req.params.id)));
});

module.exports = { dashboard, startTodaySaoPaulo };
