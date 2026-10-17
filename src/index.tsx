import Modal from "react-modal";
import ReactDOM from "react-dom";

import "simplebar/dist/simplebar.min.css";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource-variable/archivo/wdth.css";

import App from "./App";
import { loadLocalMonsterArtOverrides } from "./5e/monsterArtLocal";
import "./index.css";

function polyfillBrowserApisIfNeeded() {
  if (!("PointerEvent" in window)) import("pepjs");
  if (!("IntersectionObserver" in window)) import("intersection-observer");
}

function mountApp() {
  ReactDOM.render(<App />, document.getElementById("root"));
}

polyfillBrowserApisIfNeeded();
Modal.setAppElement("#root");
loadLocalMonsterArtOverrides().finally(mountApp);
