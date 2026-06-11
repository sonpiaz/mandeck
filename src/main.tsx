import ReactDOM from "react-dom/client";
import { App } from "./App";
import { getOverlayHost } from "./overlay";
import "@xterm/xterm/css/xterm.css";
import "allotment/dist/style.css";
import "./styles.css";

getOverlayHost();
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
