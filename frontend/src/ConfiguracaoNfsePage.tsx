import { Box, Button, Flex, Heading, Spinner, Text } from "@chakra-ui/react";
import { useOonApi } from "@oondemand/oon-core-front";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Option = {
  id: string;
  value: string;
  label: string;
  categoryCode?: string;
  ibgeCode?: string;
  state?: string;
};

type ConfigOptions = {
  instances: Option[];
  services: Option[];
  categories: Option[];
  currentAccounts: Option[];
  paymentTerms: Option[];
  cities: Option[];
};

type ConfigModel = {
  _id?: string;
  chave?: string;
  instanceId: string;
  servicoOmieId: string;
  codigoServicoOmie?: number | null;
  categoriaOmieId: string;
  codigoCategoriaOmie?: string;
  contaCorrenteOmieId: string;
  codigoContaCorrenteOmie?: number | null;
  cidadePrestacaoServicoId: string;
  cidadePrestacaoServico?: string;
  condicaoPagamentoOmieId: string;
  codigoCondicaoPagamento?: string;
  enviarLinkNfsePorEmail: boolean;
  dadosAdicionaisNf: string;
  defaultStreet: string;
  defaultNumber: string;
  defaultComplement: string;
  defaultDistrict: string;
  defaultCityIbgeCode: string;
  defaultState: string;
  defaultPostalCode: string;
  defaultCountryCode: string;
  allowIssuanceWithoutAddress: boolean;
  callbackUrl: string;
  callbackAuthMode: "none" | "bearer" | "hmac-sha256";
  callbackSecretEnv: string;
  callbackTimeoutMs: number;
  callbackMaxAttempts: number;
  callbackBackoffMs: number;
  fiscalCheckAttempts: number;
  fiscalCheckBackoffMs: number;
};

const EMPTY_OPTIONS: ConfigOptions = {
  instances: [{ id: "default", value: "default", label: "Omie Taça" }],
  services: [],
  categories: [],
  currentAccounts: [],
  paymentTerms: [],
  cities: [],
};

const CONTROL: CSSProperties = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #CBD5E0",
  borderRadius: "8px",
  padding: "0 12px",
  background: "#FFFFFF",
  color: "#24323A",
  fontSize: "14px",
  outline: "none",
};

const TEXTAREA: CSSProperties = {
  ...CONTROL,
  minHeight: "96px",
  paddingTop: "10px",
  paddingBottom: "10px",
  resize: "vertical",
};

function idOf(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "_id" in value) return String((value as { _id?: unknown })._id || "");
  return String(value);
}

function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function bool(value: unknown, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function hydrate(raw: Record<string, unknown>, options: ConfigOptions): ConfigModel {
  const serviceId = idOf(raw.servicoOmieId)
    || options.services.find((item) => item.value === text(raw.codigoServicoOmie))?.id
    || "";
  const categoryId = idOf(raw.categoriaOmieId)
    || options.categories.find((item) => item.value === text(raw.codigoCategoriaOmie))?.id
    || "";
  const currentAccountId = idOf(raw.contaCorrenteOmieId)
    || options.currentAccounts.find((item) => item.value === text(raw.codigoContaCorrenteOmie))?.id
    || "";
  const cityId = idOf(raw.cidadePrestacaoServicoId)
    || options.cities.find((item) => item.value === text(raw.cidadePrestacaoServico))?.id
    || "";
  const paymentTermId = idOf(raw.condicaoPagamentoOmieId)
    || options.paymentTerms.find((item) => item.value === text(raw.codigoCondicaoPagamento, "000"))?.id
    || "";

  return {
    _id: idOf(raw._id),
    chave: text(raw.chave, "default"),
    instanceId: text(raw.instanceId, "default"),
    servicoOmieId: serviceId,
    codigoServicoOmie: raw.codigoServicoOmie === undefined || raw.codigoServicoOmie === null ? null : num(raw.codigoServicoOmie, 0),
    categoriaOmieId: categoryId,
    codigoCategoriaOmie: text(raw.codigoCategoriaOmie),
    contaCorrenteOmieId: currentAccountId,
    codigoContaCorrenteOmie: raw.codigoContaCorrenteOmie === undefined || raw.codigoContaCorrenteOmie === null ? null : num(raw.codigoContaCorrenteOmie, 0),
    cidadePrestacaoServicoId: cityId,
    cidadePrestacaoServico: text(raw.cidadePrestacaoServico),
    condicaoPagamentoOmieId: paymentTermId,
    codigoCondicaoPagamento: text(raw.codigoCondicaoPagamento, "000"),
    enviarLinkNfsePorEmail: bool(raw.enviarLinkNfsePorEmail),
    dadosAdicionaisNf: text(raw.dadosAdicionaisNf),
    defaultStreet: text(raw.defaultStreet),
    defaultNumber: text(raw.defaultNumber),
    defaultComplement: text(raw.defaultComplement),
    defaultDistrict: text(raw.defaultDistrict),
    defaultCityIbgeCode: text(raw.defaultCityIbgeCode),
    defaultState: text(raw.defaultState),
    defaultPostalCode: text(raw.defaultPostalCode),
    defaultCountryCode: text(raw.defaultCountryCode, "1058"),
    allowIssuanceWithoutAddress: bool(raw.allowIssuanceWithoutAddress),
    callbackUrl: text(raw.callbackUrl),
    callbackAuthMode: (text(raw.callbackAuthMode, "hmac-sha256") as ConfigModel["callbackAuthMode"]),
    callbackSecretEnv: text(raw.callbackSecretEnv, "TACA_CALLBACK_SECRET"),
    callbackTimeoutMs: num(raw.callbackTimeoutMs, 5000),
    callbackMaxAttempts: num(raw.callbackMaxAttempts, 3),
    callbackBackoffMs: num(raw.callbackBackoffMs, 500),
    fiscalCheckAttempts: num(raw.fiscalCheckAttempts, 3),
    fiscalCheckBackoffMs: num(raw.fiscalCheckBackoffMs, 1000),
  };
}

function messageOf(error: unknown) {
  const value = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return value?.response?.data?.message || value?.response?.data?.error || value?.message || "Não foi possível concluir a operação.";
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: ReactNode }) {
  return (
    <Box>
      <Text fontSize="13px" fontWeight="600" color="#44546A" mb={1.5}>
        {label}{required ? <Text as="span" color="red.500"> *</Text> : null}
      </Text>
      {children}
      {helper ? <Text mt={1.5} fontSize="11px" color="gray.500">{helper}</Text> : null}
    </Box>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder = "— Selecione —",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select style={CONTROL} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  );
}

function CheckField({ checked, onChange, label, helper }: { checked: boolean; onChange: (value: boolean) => void; label: string; helper?: string }) {
  return (
    <Box borderWidth="1px" borderColor="#E5E9ED" borderRadius="10px" px={4} py={3}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          style={{ width: "16px", height: "16px", marginTop: "2px" }}
        />
        <span>
          <Text fontSize="13px" fontWeight="600" color="#334155">{label}</Text>
          {helper ? <Text mt={0.5} fontSize="11px" color="gray.500">{helper}</Text> : null}
        </span>
      </label>
    </Box>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Box>
      <Heading size="sm" color="#24323A">{title}</Heading>
      {description ? <Text mt={1} mb={4} fontSize="12px" color="gray.500">{description}</Text> : <Box h={4} />}
      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={4}>
        {children}
      </Box>
    </Box>
  );
}

export function ConfiguracaoNfsePage() {
  const { http } = useOonApi();
  const [activeTab, setActiveTab] = useState<"general" | "address" | "api">("general");
  const [options, setOptions] = useState<ConfigOptions>(EMPTY_OPTIONS);
  const [config, setConfig] = useState<ConfigModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const counts = useMemo(() => (
    `${options.services.length} serviços · ${options.categories.length} categorias · ${options.currentAccounts.length} contas · ${options.paymentTerms.length} condições · ${options.cities.length} cidades`
  ), [options]);

  async function loadOptions(currentRaw?: Record<string, unknown>) {
    const response = await http.get<ConfigOptions>("/api/taca/ops/config/options");
    const next = response.data || EMPTY_OPTIONS;
    setOptions(next);
    if (currentRaw) setConfig(hydrate(currentRaw, next));
    else setConfig((current) => current ? hydrate(current as unknown as Record<string, unknown>, next) : current);
    return next;
  }

  async function load() {
    setLoading(true);
    setFeedback(null);
    try {
      const [configResponse, optionsResponse] = await Promise.all([
        http.get<{ config: Record<string, unknown> }>("/api/taca/ops/config"),
        http.get<ConfigOptions>("/api/taca/ops/config/options"),
      ]);
      const nextOptions = optionsResponse.data || EMPTY_OPTIONS;
      setOptions(nextOptions);
      setConfig(hydrate(configResponse.data.config || {}, nextOptions));
    } catch (error) {
      setFeedback({ type: "error", message: messageOf(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function patch(values: Partial<ConfigModel>) {
    setConfig((current) => current ? { ...current, ...values } : current);
  }

  function selectService(id: string) {
    if (!config) return;
    const service = options.services.find((item) => item.id === id);
    const category = service?.categoryCode
      ? options.categories.find((item) => item.value === service.categoryCode)
      : undefined;
    patch({
      servicoOmieId: id,
      ...(category && !config.categoriaOmieId ? { categoriaOmieId: category.id } : {}),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await http.put<{ config: Record<string, unknown> }>("/api/taca/ops/config", config);
      setConfig(hydrate(response.data.config || {}, options));
      setFeedback({ type: "success", message: "Configurações salvas." });
    } catch (error) {
      setFeedback({ type: "error", message: messageOf(error) });
    } finally {
      setSaving(false);
    }
  }

  async function syncLists() {
    setSyncing(true);
    setFeedback({ type: "info", message: "Sincronização das listas do Omie iniciada. As opções serão atualizadas automaticamente." });
    try {
      await http.post("/api/taca/ops/config/sync-lists");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        await loadOptions();
      }
      setFeedback({ type: "success", message: "Opções atualizadas. Se alguma lista ainda estiver em processamento, acompanhe em Tickets de Integração." });
    } catch (error) {
      setFeedback({ type: "error", message: messageOf(error) });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <Flex minH="320px" align="center" justify="center"><Spinner size="lg" /></Flex>;
  }

  if (!config) {
    return (
      <Box borderWidth="1px" borderColor="red.100" bg="red.50" color="red.700" borderRadius="10px" px={4} py={3}>
        Não foi possível carregar a configuração de emissão.
      </Box>
    );
  }

  const tabs = [
    { id: "general" as const, label: "Geral" },
    { id: "address" as const, label: "Endereço padrão" },
    { id: "api" as const, label: "API" },
  ];

  return (
    <form onSubmit={save}>
      <Flex justify="space-between" align={{ base: "flex-start", lg: "center" }} gap={4} mb={6} direction={{ base: "column", lg: "row" }}>
        <Box>
          <Text fontSize="11px" fontWeight="700" color="brand.500" textTransform="uppercase" letterSpacing="0.08em" mb={1}>Sistema</Text>
          <Heading size="lg" color="#24323A" letterSpacing="-0.02em">Emissão NFS-e</Heading>
          <Text mt={1} fontSize="13px" color="gray.500">
            Configuração única da emissão, dados padrão e integração com a Plataforma.
          </Text>
        </Box>
        <Flex gap={2} wrap="wrap">
          <Button type="button" variant="outline" disabled={syncing} onClick={() => void syncLists()}>
            {syncing ? "Sincronizando..." : "Sincronizar listas Omie"}
          </Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </Flex>
      </Flex>

      {feedback ? (
        <Box
          mb={4}
          borderWidth="1px"
          borderColor={feedback.type === "error" ? "red.200" : feedback.type === "success" ? "green.200" : "blue.200"}
          bg={feedback.type === "error" ? "red.50" : feedback.type === "success" ? "green.50" : "blue.50"}
          color={feedback.type === "error" ? "red.700" : feedback.type === "success" ? "green.700" : "blue.700"}
          borderRadius="10px"
          px={4}
          py={3}
          fontSize="13px"
        >
          {feedback.message}
        </Box>
      ) : null}

      <Box mb={4} px={4} py={3} borderWidth="1px" borderColor="#E5E9ED" borderRadius="10px" bg="gray.50">
        <Flex justify="space-between" gap={3} align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }}>
          <Box>
            <Text fontSize="12px" fontWeight="600" color="#44546A">Listas de referência do Omie</Text>
            <Text mt={0.5} fontSize="11px" color="gray.500">{counts}</Text>
          </Box>
          <Text fontSize="11px" color="gray.500">
            Use “Sincronizar listas Omie” após configurar as credenciais da integração.
          </Text>
        </Flex>
      </Box>

      <Box borderWidth="1px" borderColor="#E5E9ED" borderRadius="12px" bg="white" overflow="hidden">
        <Flex borderBottomWidth="1px" borderColor="#E5E9ED" px={4} pt={2} gap={1} overflowX="auto">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  border: 0,
                  borderBottom: selected ? "2px solid #0B7DB8" : "2px solid transparent",
                  background: "transparent",
                  color: selected ? "#0B7DB8" : "#64748B",
                  fontWeight: 600,
                  fontSize: "13px",
                  padding: "12px 14px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </Flex>

        <Box p={{ base: 4, md: 6 }}>
          {activeTab === "general" ? (
            <Box display="grid" gap={7}>
              <Section title="Parâmetros da emissão" description="Valores usados para montar a Ordem de Serviço e o faturamento no Omie.">
                <Field label="Instância Omie" required>
                  <SelectField value={config.instanceId} onChange={(value) => patch({ instanceId: value || "default" })} options={options.instances} />
                </Field>
                <Field label="Serviço Omie" required helper="A categoria padrão do serviço é sugerida automaticamente quando disponível.">
                  <SelectField value={config.servicoOmieId} onChange={selectService} options={options.services} />
                </Field>
                <Field label="Categoria Omie" required>
                  <SelectField value={config.categoriaOmieId} onChange={(value) => patch({ categoriaOmieId: value })} options={options.categories} />
                </Field>
                <Field label="Conta corrente Omie">
                  <SelectField value={config.contaCorrenteOmieId} onChange={(value) => patch({ contaCorrenteOmieId: value })} options={options.currentAccounts} />
                </Field>
                <Field label="Cidade da prestação do serviço" required>
                  <SelectField value={config.cidadePrestacaoServicoId} onChange={(value) => patch({ cidadePrestacaoServicoId: value })} options={options.cities} />
                </Field>
                <Field label="Condição de pagamento Omie" required>
                  <SelectField value={config.condicaoPagamentoOmieId} onChange={(value) => patch({ condicaoPagamentoOmieId: value })} options={options.paymentTerms} />
                </Field>
              </Section>

              <Section title="Dados padrão da NFS-e">
                <Field label="Dados adicionais da NFS-e">
                  <textarea style={TEXTAREA} value={config.dadosAdicionaisNf} onChange={(event) => patch({ dadosAdicionaisNf: event.target.value })} />
                </Field>
                <CheckField
                  checked={config.enviarLinkNfsePorEmail}
                  onChange={(value) => patch({ enviarLinkNfsePorEmail: value })}
                  label="Enviar link da NFS-e por e-mail pelo Omie"
                  helper="Quando habilitado, o Omie envia ao cliente o link de consulta da NFS-e."
                />
              </Section>
            </Box>
          ) : null}

          {activeTab === "address" ? (
            <Box display="grid" gap={7}>
              <Section title="Endereço padrão" description="Usado campo a campo apenas quando a Plataforma não enviar o respectivo dado do cliente.">
                <Field label="Logradouro padrão">
                  <input style={CONTROL} value={config.defaultStreet} onChange={(event) => patch({ defaultStreet: event.target.value })} />
                </Field>
                <Field label="Número padrão">
                  <input style={CONTROL} value={config.defaultNumber} onChange={(event) => patch({ defaultNumber: event.target.value })} />
                </Field>
                <Field label="Complemento padrão">
                  <input style={CONTROL} value={config.defaultComplement} onChange={(event) => patch({ defaultComplement: event.target.value })} />
                </Field>
                <Field label="Bairro padrão">
                  <input style={CONTROL} value={config.defaultDistrict} onChange={(event) => patch({ defaultDistrict: event.target.value })} />
                </Field>
                <Field label="Código IBGE da cidade padrão">
                  <input style={CONTROL} value={config.defaultCityIbgeCode} onChange={(event) => patch({ defaultCityIbgeCode: event.target.value })} />
                </Field>
                <Field label="UF padrão">
                  <input style={CONTROL} maxLength={2} value={config.defaultState} onChange={(event) => patch({ defaultState: event.target.value.toUpperCase() })} />
                </Field>
                <Field label="CEP padrão">
                  <input style={CONTROL} value={config.defaultPostalCode} onChange={(event) => patch({ defaultPostalCode: event.target.value })} />
                </Field>
                <Field label="Código do país padrão">
                  <input style={CONTROL} value={config.defaultCountryCode} onChange={(event) => patch({ defaultCountryCode: event.target.value })} />
                </Field>
              </Section>

              <CheckField
                checked={config.allowIssuanceWithoutAddress}
                onChange={(value) => patch({ allowIssuanceWithoutAddress: value })}
                label="Permitir emissão sem dados de endereço"
                helper="Desabilitado por padrão. Quando desabilitado, o pedido é bloqueado antes do Omie se o endereço continuar insuficiente após o fallback."
              />
            </Box>
          ) : null}

          {activeTab === "api" ? (
            <Box display="grid" gap={7}>
              <Section title="Callback da Plataforma" description="Configura como a Central devolve o resultado final da emissão ou do estorno.">
                <Field label="URL de callback da Plataforma">
                  <input style={CONTROL} value={config.callbackUrl} onChange={(event) => patch({ callbackUrl: event.target.value })} placeholder="https://..." />
                </Field>
                <Field label="Autenticação do callback">
                  <select style={CONTROL} value={config.callbackAuthMode} onChange={(event) => patch({ callbackAuthMode: event.target.value as ConfigModel["callbackAuthMode"] })}>
                    <option value="none">none</option>
                    <option value="bearer">bearer</option>
                    <option value="hmac-sha256">hmac-sha256</option>
                  </select>
                </Field>
                <Field label="Variável de ambiente do segredo do callback">
                  <input style={CONTROL} value={config.callbackSecretEnv} onChange={(event) => patch({ callbackSecretEnv: event.target.value })} />
                </Field>
                <Field label="Timeout do callback (ms)">
                  <input type="number" min={500} style={CONTROL} value={config.callbackTimeoutMs} onChange={(event) => patch({ callbackTimeoutMs: num(event.target.value, 5000) })} />
                </Field>
                <Field label="Tentativas do callback">
                  <input type="number" min={1} max={10} style={CONTROL} value={config.callbackMaxAttempts} onChange={(event) => patch({ callbackMaxAttempts: num(event.target.value, 3) })} />
                </Field>
                <Field label="Backoff inicial do callback (ms)">
                  <input type="number" min={100} style={CONTROL} value={config.callbackBackoffMs} onChange={(event) => patch({ callbackBackoffMs: num(event.target.value, 500) })} />
                </Field>
              </Section>

              <Section title="Processamento fiscal" description="Valores padrão carregados automaticamente e usados pelos Tickets de confirmação da NFS-e.">
                <Field label="Consultas fiscais por Ticket">
                  <input type="number" min={1} max={8} style={CONTROL} value={config.fiscalCheckAttempts} onChange={(event) => patch({ fiscalCheckAttempts: num(event.target.value, 3) })} />
                </Field>
                <Field label="Backoff inicial da confirmação fiscal (ms)">
                  <input type="number" min={250} style={CONTROL} value={config.fiscalCheckBackoffMs} onChange={(event) => patch({ fiscalCheckBackoffMs: num(event.target.value, 1000) })} />
                </Field>
              </Section>
            </Box>
          ) : null}
        </Box>
      </Box>
    </form>
  );
}
