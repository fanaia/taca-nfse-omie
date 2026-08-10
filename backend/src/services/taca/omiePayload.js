"use strict";

function formatDateBr(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

function buildCustomerPayload(order, config) {
  const address = order.address || {};
  const payload = {
    cnpj_cpf: order.documentoNormalizado,
    razao_social: order.customerLegalName,
    nome_fantasia: order.customerTradeName || order.customerLegalName,
    email: order.customerEmail,
  };
  if (address.street) payload.endereco = address.street;
  if (address.number) payload.endereco_numero = address.number;
  if (address.complement) payload.complemento = address.complement;
  if (address.district) payload.bairro = address.district;
  if (address.cityIbgeCode) payload.cidade = address.cityIbgeCode;
  if (address.state) payload.estado = address.state;
  if (address.postalCode) payload.cep = address.postalCode;
  if (config.defaultCountryCode) payload.codigo_pais = config.defaultCountryCode;
  if (order.simpleNationalTaxpayer !== undefined && order.simpleNationalTaxpayer !== null) {
    payload.optante_simples_nacional = order.simpleNationalTaxpayer ? "S" : "N";
  }
  return payload;
}

function buildServiceOrderPayload(order, customerOmieCode, config, now = new Date()) {
  if (!(Number(config.codigoServicoOmie) > 0)) throw new Error("Configuração nCodServico ausente.");
  const cabecalho = {
    cCodIntOS: order.integrationCode,
    cCodParc: config.codigoCondicaoPagamento || "000",
    cEtapa: "20",
    dDtPrevisao: formatDateBr(now),
    nCodCli: Number(customerOmieCode),
    nQtdeParc: 1,
  };
  const additional = {};
  if (config.cidadePrestacaoServico) additional.cCidPrestServ = config.cidadePrestacaoServico;
  if (config.codigoCategoriaOmie) additional.cCodCateg = config.codigoCategoriaOmie;
  if (Number(config.codigoContaCorrenteOmie) > 0) additional.nCodCC = Number(config.codigoContaCorrenteOmie);
  if (config.dadosAdicionaisNf) additional.cDadosAdicNF = config.dadosAdicionaisNf;

  const email = {
    cEnvBoleto: "N",
    cEnvPix: "N",
    cEnvLink: config.enviarLinkNfsePorEmail ? "S" : "N",
    cEnviarPara: order.customerEmail,
  };

  return {
    Cabecalho: cabecalho,
    Departamentos: [],
    Email: email,
    InformacoesAdicionais: additional,
    ServicosPrestados: [{
      nCodServico: Number(config.codigoServicoOmie),
      nQtde: 1,
      nValUnit: Number(order.amount),
    }],
  };
}

function array(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function responseData(result = {}) {
  return result?.data || result?.response || result || {};
}

function normalizeOs(data = {}) {
  const root = responseData(data);
  const header = root.Cabecalho || root.cabecalho || root;
  const info = root.InfoCadastro || root.infoCadastro || {};
  const rpsList = array(root.ListaRpsNfse || root.listaRpsNfse || root.lista_rps_nfse);
  return {
    codigoOsOmie: Number(header.nCodOS || root.nCodOS || 0) || 0,
    numeroOs: String(header.cNumOS || root.cNumOS || "").trim(),
    integrationCode: String(header.cCodIntOS || root.cCodIntOS || "").trim(),
    faturada: String(info.cFaturada || "").toUpperCase() === "S",
    cancelada: String(info.cCancelada || "").toUpperCase() === "S",
    rpsList,
    raw: root,
  };
}

function normalizeFiscal(data = {}) {
  const os = normalizeOs(data);
  const item = os.rpsList.length ? os.rpsList[os.rpsList.length - 1] : {};
  const statusCode = String(item.cStatusRps || item.cStatusLote || "").trim();
  const messageList = array(item.mensagens);
  const message = messageList
    .map((entry) => entry?.cDescricao || entry?.cMensagem || entry?.descricao || entry?.message || "")
    .filter(Boolean)
    .join(" | ");
  const invoiceNumber = String(item.nNfse || "").trim();
  let state = "PROCESSING";
  if (statusCode === "004" && invoiceNumber) state = "ISSUED";
  else if (statusCode === "003") state = "ERROR";
  else if (statusCode === "005" || os.cancelada) state = "CANCELLED";
  return {
    state,
    statusCode,
    invoiceNumber,
    rpsNumber: String(item.nRps || "").trim(),
    verificationCode: String(item.cCodVerif || "").trim(),
    url: String(item.cUrlNfse || item.danfe || "").trim(),
    pdfUrl: String(item.cUrlPdfDest || item.cUrlPdfDemo || "").trim(),
    message,
    os,
  };
}

module.exports = {
  buildCustomerPayload,
  buildServiceOrderPayload,
  formatDateBr,
  normalizeFiscal,
  normalizeOs,
  responseData,
};
