import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Account } from "./views/Account.tsx";
import { FirstRun } from "./views/FirstRun.tsx";
import { Overlay } from "./views/Overlay.tsx";
import { Settings } from "./views/Settings.tsx";
import { languageFromSearch, setLanguage } from "./i18n.ts";
import { Update } from "./views/Update.tsx";
import { viewFromSearch } from "./view.ts";
import "./styles.css";

const screens = {
  settings: Settings,
  "first-run": FirstRun,
  account: Account,
  overlay: Overlay,
  update: Update,
};
const view = viewFromSearch(window.location.search);
const language = languageFromSearch(window.location.search);
setLanguage(language);
document.documentElement.lang = language;
const Screen = screens[view];
const root = document.getElementById("root");
document.documentElement.dataset.view = view;

if (root) {
  createRoot(root).render(
    <StrictMode>
      <Screen />
    </StrictMode>,
  );
}
