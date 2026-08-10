"use strict";

const {
  PLATFORM_ROLES,
  PLATFORM_SERVICE_ACCOUNTS,
} = require("./constants");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function platformUserRole(usuario = {}) {
  return normalize(
    usuario.tipo ||
      usuario.perfil ||
      usuario.aplicativo?.tipoAcesso ||
      usuario.aplicativo?.perfil,
  );
}

function hasPlatformAccess(usuario = {}) {
  const role = platformUserRole(usuario);
  const email = normalize(usuario.email);

  if (role === "admin" || PLATFORM_ROLES.includes(role)) return true;
  return PLATFORM_SERVICE_ACCOUNTS.includes(email);
}

function assertPlatformAccess(req) {
  if (hasPlatformAccess(req?.usuario || {})) return;

  const error = new Error("Acesso negado para a integração da Plataforma Taça.");
  error.statusCode = 403;
  error.code = "PLATFORM_ACCESS_DENIED";
  throw error;
}

module.exports = {
  assertPlatformAccess,
  hasPlatformAccess,
  platformUserRole,
};
