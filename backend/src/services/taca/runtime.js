"use strict";

const providersPending = new Set();
let scheduled = false;

function loadCore() { return require("@oondemand/oon-core-back"); }
function queueBatchSize() { return Math.max(1, Math.min(500, Number(process.env.TACA_INTEGRATION_BATCH_SIZE || 100))); }

function scheduleProvider(provider) {
  const key = String(provider || "").trim().toLowerCase();
  if (!key) return;
  providersPending.add(key);
  if (scheduled) return;
  scheduled = true;
  setImmediate(async () => {
    scheduled = false;
    const providers = [...providersPending];
    providersPending.clear();
    const runtime = loadCore();
    const processQueue = runtime.integrations?.processIntegrationQueue;
    if (typeof processQueue !== "function") return;
    for (const current of providers) {
      try {
        const result = await processQueue({ provider: current, limit: queueBatchSize() });
        if (Array.isArray(result?.results) && result.results.length >= queueBatchSize()) providersPending.add(current);
      } catch (error) {
        console.error(`[taca] Falha no processamento automático da fila ${current}: ${String(error?.message || error)}`);
      }
    }
    if (providersPending.size) scheduleProvider([...providersPending][0]);
  });
}

async function enqueueIntegration(input = {}) {
  const runtime = loadCore();
  const ticket = await runtime.enqueueIntegration(input);
  scheduleProvider(input.provider);
  return ticket;
}

function core() { return { ...loadCore(), enqueueIntegration }; }

function models() {
  const { registry } = core();
  const names = ["ConfiguracaoNfse", "ClienteTaca", "PedidoNfse", "EstornoTaca"];
  const result = Object.fromEntries(names.map((name) => [name, registry.getModel(name)?.mongooseModel]));
  for (const name of names) if (!result[name]) throw new Error(`Model ${name} não registrado.`);
  return result;
}

module.exports = { core, enqueueIntegration, models, queueBatchSize, scheduleProvider };
