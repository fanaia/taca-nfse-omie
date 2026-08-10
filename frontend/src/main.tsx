import { startCentralFromManifest } from "@oondemand/oon-core-front";
import app from "../../central.app.json";
import ui from "../central.ui.json";
import { ConfiguracaoNfsePage } from "./ConfiguracaoNfsePage";
import { DashboardPage } from "./DashboardPage";
import { HelpPage } from "./HelpPage";

const uiManifest = {
  ...ui,
  pages: [
    { id: "dashboard", path: "/", label: "Dashboard", title: "Dashboard", section: "Operação", component: "DashboardPage", order: 0 },
    ...(ui.pages ?? []),
    { id: "ajuda", path: "/ajuda", label: "Ajuda", title: "Ajuda", section: "Sistema", icon: "?", component: "HelpPage", order: 950 },
  ],
};

type CentralUi = Parameters<typeof startCentralFromManifest>[0]["ui"];
startCentralFromManifest({ app, ui: uiManifest as CentralUi }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
  customComponents: { ConfiguracaoNfsePage, DashboardPage, HelpPage },
});
