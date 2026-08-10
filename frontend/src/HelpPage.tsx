import { Box, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Box mb={7}><Heading size="md" mb={2}>{title}</Heading><Text color="gray.600" whiteSpace="pre-line" fontSize="14px">{children}</Text></Box>;
}

export function HelpPage() {
  return (
    <Box maxW="900px">
      <Heading size="lg" mb={2}>Ajuda — Central Taça</Heading>
      <Text color="gray.500" mb={7}>Side-Car Omie para emissão de NFS-e governada por esteiras de processo a partir de pagamentos confirmados pela Plataforma Taça.</Text>
      <Section title="Configuração inicial">
        Em Configurações → Emissão NFS-e existe um único formulário, dividido em Geral, Endereço padrão, Automação e API. Antes de selecionar serviço, categoria, conta corrente, condição de pagamento e cidade, configure as credenciais em Integração Omie e use “Sincronizar listas Omie”.
      </Section>
      <Section title="Esteira Pedidos / NFS-e">
        {"Todo pedido entra em Aprovação e percorre: Aprovação → Sinc cliente (Omie) → Criar OS (Omie) → Gerar NF (Omie) → Aguardando retorno faturamento (Omie) → Baixa financeira → Notificar plataforma → Concluído. Por padrão todas as ações são manuais. Na aba Automação é possível habilitar cada etapa executável individualmente. Etapas automáticas consecutivas são encadeadas; ao chegar a uma etapa manual, o processo aguarda o operador."}
      </Section>
      <Section title="Confirmação fiscal">
        FaturarOS apenas solicita o faturamento. A etapa “Aguardando retorno faturamento (Omie)” confirma a situação real da NFS-e por webhook/consulta. Quando esta etapa está manual, o webhook não avança a esteira sozinho; o operador usa “Verificar faturamento”.
      </Section>
      <Section title="Baixa financeira">
        A etapa registra a confirmação operacional da baixa na Central, com data e responsável. Ela não cria um novo financeiro no Omie; o pagamento já é a origem da emissão e o fluxo evita duplicar contas a receber.
      </Section>
      <Section title="Endereço e fallback">
        Cada campo enviado pela Plataforma prevalece. Campos ausentes usam os padrões da aba Endereço padrão. Se ainda faltarem dados obrigatórios e “Permitir emissão sem dados de endereço” estiver desabilitado, a API devolve 422 antes de chamar o Omie.
      </Section>
      <Section title="Idempotência">
        integrationCode identifica o pedido; Documento normalizado identifica o cliente; cCodIntOS usa o mesmo integrationCode. Reentrega HTTP, retry ou restart não devem criar uma segunda OS/NFS-e. As ações da esteira são processadas por Tickets e tickets obsoletos de uma etapa anterior são ignorados.
      </Section>
      <Section title="Esteira de estorno">
        {"POST /api/taca/v1/orders/{integrationCode}/reversal cria a esteira Requisição → Cancelar → Notificar plataforma → Concluído. O fluxo é sempre manual e não possui configuração de automação. A Central não chama CancelarOS automaticamente; o operador confirma o cancelamento executado e depois dispara a notificação da Plataforma."}
      </Section>
      <Section title="Callbacks">
        O callback é uma etapa explícita. A esteira só entra em Concluído após resposta HTTP de sucesso. Falha 4xx/5xx/timeout fica registrada e pode ser reenviada sem refaturar. O segredo fica em variável de ambiente e pode usar Bearer ou HMAC-SHA256.
      </Section>
      <Section title="Troubleshooting">
        Se uma etapa automática falhar, o pedido permanece na etapa e o erro fica visível. O botão manual da etapa continua disponível como fallback. Consulte também Tickets de Integração para tentativas e erro normalizado.
      </Section>
      <Section title="Contrato da API">
        A documentação completa e exemplos ficam em docs/api/README.pt-BR.md e docs/api/README.en.md no repositório. Endpoints, campos JSON e status externos permanecem em inglês nos dois documentos.
      </Section>
    </Box>
  );
}
