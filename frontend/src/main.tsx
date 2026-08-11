import { startCentralFromManifest } from "@oondemand/oon-core-front";
import app from "../../central.app.json";
import ui from "../central.ui.json";
import { ConfiguracaoNfsePage } from "./ConfiguracaoNfsePage";
import { DashboardPage } from "./DashboardPage";
import { HelpPage } from "./HelpPage";

const OPERATION_READ = ["taca.operation.read"];
const OPERATION_EXECUTE = ["taca.operation.execute"];
const CONFIGURATION_MANAGE = ["taca.configuration.manage"];

const securedPages = (ui.pages ?? []).map((page) => ({
  ...page,
  permissions: page.id === "configuracoes" || page.id === "configuracao-nfse"
    ? CONFIGURATION_MANAGE
    : OPERATION_READ,
}));

const securedCollections = (ui.collections ?? []).map((collection) => ({
  ...collection,
  permissions: OPERATION_READ,
}));

const securedPipelines = (ui.pipelines ?? []).map((pipeline) => ({
  ...pipeline,
  permissions: OPERATION_READ,
  ticketActions: (pipeline.ticketActions ?? []).map((action) => ({
    ...action,
    permissions: OPERATION_EXECUTE,
  })),
}));

const uiManifest = {
  ...ui,
  navigation: {
    ...ui.navigation,
    items: (ui.navigation?.items ?? []).map((item) => ({
      ...item,
      permissions: CONFIGURATION_MANAGE,
    })),
  },
  pages: [
    {
      id: "dashboard",
      path: "/",
      label: "Dashboard",
      title: "Dashboard",
      section: "Operação",
      component: "DashboardPage",
      order: 0,
      permissions: OPERATION_READ,
    },
    ...securedPages,
    {
      id: "ajuda",
      path: "/ajuda",
      label: "Ajuda",
      title: "Ajuda",
      section: "Sistema",
      icon: "?",
      component: "HelpPage",
      order: 950,
      permissions: OPERATION_READ,
    },
  ],
  collections: securedCollections,
  pipelines: securedPipelines,
};

type CentralUi = Parameters<typeof startCentralFromManifest>[0]["ui"];
startCentralFromManifest({ app, ui: uiManifest as CentralUi }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
  customComponents: { ConfiguracaoNfsePage, DashboardPage, HelpPage },
});
