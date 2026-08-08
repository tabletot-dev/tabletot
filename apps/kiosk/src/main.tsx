import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initSentry } from "./lib/sentry";
import "./index.css";
import "./styles/tabletot.css";

initSentry();

createRoot(document.getElementById("root")!).render(<App />);
