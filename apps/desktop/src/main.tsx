import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FirstRun } from "./views/FirstRun.tsx";
import { Overlay } from "./views/Overlay.tsx";
import { Settings } from "./views/Settings.tsx";
import { viewFromSearch } from "./view.ts";
import "./styles.css";

const screens = { settings: Settings, "first-run": FirstRun, overlay: Overlay };
const view = viewFromSearch(window.location.search);
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
