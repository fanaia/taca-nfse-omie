import { Box, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Box mb={7}><Heading size="md" mb={2}>{title}</Heading><Text color="gray.600" whiteSpace="pre-line" fontSize="14px">{children}</Text></Box>;
}

export function HelpPage() {
  return (
    <Box maxW="900px">
      <Heading size="lg" mb={2}>Ajuda — Central Taça</Heading>
      <Text color="gray.500" mb={7}>Side-Car Omie para emissão assíncrona de NFS-e a partir de pagamentos confirmados pela Plataforma Taça.</Text>
      <Section title="Configuração inicial">
        Em Configurações → Emissão NFS-e existe um único formulário, dividido em Geral, Endereço padrão e API. Antes de selecionar serviço, categoria, conta corrente, condição de pagamento e cidade, configure as credenciais em Integração Omie e use “Sincronizar listas Omie”. Os parâmetros de processamento já carregam valores padrão e podem ser ajustados na aba API.
      </Section>
      <Section title="Fluxo automático">
        A Plataforma chama POST /api/taca/v1/orders. A Central autentica, valida e garante idempotência por integrationCode, resolve o cliente pelo Documento, cria/recupera a OS no Omie, solicita faturamento e só conclui após confirmação fiscal. A resposta HTTP não aguarda o Omie.
      </Section>
      <Section title="Endereço e fallback">
        Cada campo enviado pela Plataforma prevalece. Campos ausentes usam os padrões da aba Endereço padrão. Se ainda faltarem dados obrigatórios e “Permitir emissão sem dados de endereço” estiver desabilitado, a API devolve 422 antes de chamar o Omie.
      </Section>
      <Section title="Idempotência">
        integrationCode identifica o pedido; Documento normalizado identifica o cliente; cCodIntOS usa o mesmo integrationCode. Reentrega HTTP, retry ou restart não devem criar uma segunda OS/NFS-e.
      </Section>
      <Section title="Estorno manual">
        {"POST /api/taca/v1/orders/{integrationCode}/reversal cria um Ticket em Estornos. A Central não chama CancelarOS automaticamente. Depois da operação manual no Omie/prefeitura, use “Confirmar concluído”; somente então o callback REVERSAL_PENDING → REVERSED é disparado."}
      </Section>
      <Section title="Callbacks">
        O callback é independente do estado fiscal. Falha 4xx/5xx/timeout fica registrada e pode ser reenviada sem refaturar. O segredo fica em variável de ambiente e pode usar Bearer ou HMAC-SHA256.
      </Section>
      <Section title="Troubleshooting">
        Para NFS-e em processamento, use “Reprocessar confirmação fiscal”. Para callback com erro, use “Reenviar callback”. Consulte também Tickets de Integração para payload resumido, tentativas e erro normalizado.
      </Section>
      <Section title="Contrato da API">
        A documentação completa e exemplos ficam em docs/api/README.pt-BR.md e docs/api/README.en.md no repositório. Endpoints, campos JSON e status externos permanecem em inglês nos dois documentos.
      </Section>
    </Box>
  );
}
