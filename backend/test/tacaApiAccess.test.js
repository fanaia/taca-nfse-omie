"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertPlatformAccess,
  hasPlatformAccess,
  platformUserRole,
} = require("../src/services/taca/access");

test("conta de serviço da Plataforma acessa mesmo com perfil leitura", () => {
  const usuario = {
    email: "api-plataforma-taca@email.com",
    tipo: "leitura",
  };

  assert.equal(hasPlatformAccess(usuario), true);
  assert.equal(platformUserRole(usuario), "leitura");
  assert.doesNotThrow(() => assertPlatformAccess({ usuario }));
});

test("perfil operador é aceito como perfil nativo de integração", () => {
  assert.equal(
    hasPlatformAccess({ email: "outro@empresa.com", tipo: "operador" }),
    true,
  );
});

test("admin e desenvolvedor mantêm acesso operacional", () => {
  assert.equal(hasPlatformAccess({ tipo: "admin" }), true);
  assert.equal(hasPlatformAccess({ tipo: "desenvolvedor" }), true);
});

test("usuário leitura comum continua sem acesso à API da Plataforma", () => {
  const req = {
    usuario: {
      email: "usuario-leitura@empresa.com",
      tipo: "leitura",
    },
  };

  assert.equal(hasPlatformAccess(req.usuario), false);
  assert.throws(
    () => assertPlatformAccess(req),
    (error) =>
      error?.statusCode === 403 &&
      error?.code === "PLATFORM_ACCESS_DENIED",
  );
});

test("perfil também pode ser resolvido do acesso do aplicativo", () => {
  assert.equal(
    platformUserRole({ aplicativo: { tipoAcesso: "operador" } }),
    "operador",
  );
});
