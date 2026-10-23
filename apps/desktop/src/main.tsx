import "@take-my-word/brand/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Main } from "./views/Main.tsx";
import { Overlay } from "./views/Overlay.tsx";
import { languageFromSearch } from "./i18n.ts";
import { Root } from "./Root.tsx";
import { applyTheme, themeFromSearch } from "./theme.ts";
import { Update } from "./views/Update.tsx";
import { viewFromSearch } from "./view.ts";
import "./styles.css";

const screens = {
  main: Main,
  overlay: Overlay,
  update: Update,
};
const view = viewFromSearch(window.location.search);
const language = languageFromSearch(window.location.search);
const overlay = view === "overlay";
const theme = overlay ? "light" : themeFromSearch(window.location.search);
const Screen = screens[view];
const root = document.getElementById("root");
document.documentElement.dataset.view = view;
applyTheme(theme);

if (root) {
  createRoot(root).render(
    <StrictMode>
      <Root
        language={language}
        theme={theme}
        followsTheme={!overlay}
        forwardsKeys={!overlay}
        screen={Screen}
      />
    </StrictMode>,
  );
}
