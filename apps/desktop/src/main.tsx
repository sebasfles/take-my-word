import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "./Settings.tsx";
import { viewFromSearch } from "./view.ts";
import "./styles.css";

const screens = { settings: Settings };
const Screen = screens[viewFromSearch(window.location.search)];
const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <Screen />
    </StrictMode>,
  );
}
