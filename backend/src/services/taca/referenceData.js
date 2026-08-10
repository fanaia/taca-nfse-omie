"use strict";

const { callOmie } = require("./omieClient");
const { responseData } = require("./omiePayload");
const { models } = require("./runtime");

function first(value, ...fallbacks) {
  for (const item of [value, ...fallbacks]) {
    if (item !== undefined && item !== null && String(item).trim() !== "") return item;
  }
  return "";
}

function inactive(value) {
  return ["S", "SIM", "TRUE", "1", "INATIVO"].includes(String(value || "").trim().toUpperCase());
}

function mapService(record = {}) {
  const integration = record.intListar || record.integracao || {};
  const header = record.cabecalho || record.Cabecalho || {};
  const description = record.descricao || {};
  const info = record.info || record.InfoCadastro || {};
  const code = Number(first(integration.nCodServ, record.nCodServ, header.nCodServ, 0));
  if (!(code > 0)) throw new Error("Serviço Omie sem nCodServ.");
  const name = String(first(header.cDescricao, description.cDescrCompleta, header.cCodigo, code)).trim();
  return {
    codigoServicoOmie: code,
    codigoIntegracao: String(first(integration.cCodIntServ, record.cCodIntServ)).trim(),
    codigo: String(first(header.cCodigo, record.cCodigo)).trim(),
    nome: name,
    descricao: String(first(description.cDescrCompleta, header.cDescricao, name)).trim(),
    codigoCategoriaOmie: String(first(header.cCodCateg, record.cCodCateg)).trim(),
    status: inactive(first(info.inativo, record.inativo)) ? "Inativo" : "Ativo",
    ultimaSincronizacaoEm: new Date(),
  };
}

function mapCategory(record = {}) {
  const code = String(first(record.codigo, record.cCodigo)).trim();
  if (!code) throw new Error("Categoria Omie sem código.");
  const status = inactive(first(record.conta_inativa, record.inativo)) ? "Inativo" : "Ativo";
  const totalizer = String(record.totalizadora || "").trim().toUpperCase() === "S";
  const hidden = String(record.nao_exibir || "").trim().toUpperCase() === "S";
  return {
    codigoCategoriaOmie: code,
    nome: String(first(record.descricao, record.descricao_padrao, code)).trim(),
    descricao: String(first(record.descricao_padrao, record.descricao, code)).trim(),
    natureza: String(record.natureza || "").trim(),
    tipoCategoria: String(record.tipo_categoria || "").trim(),
    status,
    selecionavel: status === "Ativo" && !totalizer && !hidden,
    ultimaSincronizacaoEm: new Date(),
  };
}

function mapCurrentAccount(record = {}) {
  const code = Number(first(record.nCodCC, record.codigo_conta_corrente, record.codigo, 0));
  if (!(code > 0)) throw new Error("Conta corrente Omie sem nCodCC.");
  return {
    codigoContaCorrenteOmie: code,
    codigoIntegracao: String(first(record.cCodCCInt, record.codigo_integracao)).trim(),
    nome: String(first(record.descricao, record.cDescricao, `Conta ${code}`)).trim(),
    tipo: String(first(record.tipo_conta_corrente, record.cTipo)).trim(),
    codigoBanco: String(first(record.codigo_banco, record.cCodBanco)).trim(),
    status: inactive(first(record.inativo, record.cInativo)) ? "Inativo" : "Ativo",
    ultimaSincronizacaoEm: new Date(),
  };
}

function mapPaymentTerm(record = {}) {
  const code = String(first(record.cCodigo, record.nCodigo)).trim();
  if (!code) throw new Error("Condição de pagamento Omie sem código.");
  return {
    codigoCondicaoPagamento: code,
    nome: String(first(record.cDescricao, code)).trim(),
    numeroParcelas: Number(first(record.nQtdeParc, 0)) || 0,
    listaParcelas: String(first(record.cListaParc, "")).trim(),
    diasParcela: Number(first(record.nDiasParc, 0)) || 0,
    ultimaSincronizacaoEm: new Date(),
  };
}

function mapCity(record = {}) {
  const code = String(first(record.cCod, record.codigo)).trim();
  if (!code) throw new Error("Cidade Omie sem código.");
  return {
    codigoCidadeOmie: code,
    nome: String(first(record.cNome, record.nome, code)).trim(),
    uf: String(first(record.cUF, record.uf)).trim().toUpperCase(),
    codigoIbge: String(first(record.nCodIBGE, record.codigo_ibge)).trim(),
    codigoSiafi: Number(first(record.nCodSIAFI, 0)) || 0,
    ultimaSincronizacaoEm: new Date(),
  };
}

const REFERENCE_LISTS = Object.freeze({
  services: {
    model: "ServicoOmie",
    call: "list-services",
    externalKey: "codigoServicoOmie",
    itemsPath: "cadastros",
    totalPagesPath: "nTotPaginas",
    pageParam: "nPagina",
    pageSizeParam: "nRegPorPagina",
    pageSize: 100,
    map: mapService,
  },
  categories: {
    model: "CategoriaOmie",
    call: "list-categories",
    externalKey: "codigoCategoriaOmie",
    itemsPath: "categoria_cadastro",
    totalPagesPath: "total_de_paginas",
    pageParam: "pagina",
    pageSizeParam: "registros_por_pagina",
    pageSize: 100,
    map: mapCategory,
  },
  currentAccounts: {
    model: "ContaCorrenteOmie",
    call: "list-current-accounts",
    externalKey: "codigoContaCorrenteOmie",
    itemsPath: "ListarContasCorrentes",
    totalPagesPath: "total_de_paginas",
    pageParam: "pagina",
    pageSizeParam: "registros_por_pagina",
    pageSize: 100,
    extraParam: { apenas_importado_api: "N" },
    map: mapCurrentAccount,
  },
  paymentTerms: {
    model: "CondicaoPagamentoOmie",
    call: "list-payment-terms",
    externalKey: "codigoCondicaoPagamento",
    itemsPath: "cadastros",
    totalPagesPath: "total_de_paginas",
    pageParam: "pagina",
    pageSizeParam: "registros_por_pagina",
    pageSize: 100,
    map: mapPaymentTerm,
  },
  cities: {
    model: "CidadeOmie",
    call: "list-cities",
    externalKey: "codigoCidadeOmie",
    itemsPath: "lista_cidades",
    totalPagesPath: "total_de_paginas",
    pageParam: "pagina",
    pageSizeParam: "registros_por_pagina",
    pageSize: 100,
    map: mapCity,
  },
});

function atPath(value, path) {
  return String(path || "").split(".").filter(Boolean).reduce((current, part) => current?.[part], value);
}

function requestParam(definition, page) {
  return [{
    [definition.pageParam]: page,
    [definition.pageSizeParam]: definition.pageSize,
    ...(definition.extraParam || {}),
  }];
}

async function syncReferenceList(event, context = {}) {
  const listKey = String(event?.payload?.listKey || "").trim();
  const definition = REFERENCE_LISTS[listKey];
  if (!definition) {
    const error = new Error(`Lista de referência desconhecida: ${listKey || "não informada"}.`);
    error.statusCode = 422;
    error.retryable = false;
    throw error;
  }

  const allModels = models();
  const Model = allModels[definition.model];
  if (!Model) throw new Error(`Model ${definition.model} não registrado.`);

  const config = await allModels.ConfiguracaoNfse.findOne({ chave: "default" });
  const instanceId = String(event?.payload?.instanceId || config?.instanceId || "default");
  let page = 1;
  let totalPages = 1;
  let processed = 0;

  do {
    const result = await callOmie(definition.call, instanceId, requestParam(definition, page), context);
    const data = responseData(result);
    const items = atPath(data, definition.itemsPath);
    const values = Array.isArray(items) ? items : (items ? [items] : []);

    for (const record of values) {
      const mapped = definition.map(record);
      const keyValue = mapped[definition.externalKey];
      await Model.updateOne(
        { [definition.externalKey]: keyValue },
        { $set: mapped },
        { upsert: true, runValidators: true },
      );
      processed += 1;
    }

    totalPages = Math.max(1, Number(atPath(data, definition.totalPagesPath) || 1));
    page += 1;
  } while (page <= totalPages);

  const output = { listKey, model: definition.model, processed, pages: totalPages, instanceId };
  context.recordItem?.(output);
  return output;
}

module.exports = {
  REFERENCE_LISTS,
  mapCategory,
  mapCity,
  mapCurrentAccount,
  mapPaymentTerm,
  mapService,
  requestParam,
  syncReferenceList,
};
