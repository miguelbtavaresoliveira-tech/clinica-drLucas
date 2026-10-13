import { createApp } from "vue";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/tema.css";
import App from "./App.vue";
import { criarRoteador, dependenciasReaisDoGuard } from "./router";

createApp(App).use(criarRoteador(undefined, dependenciasReaisDoGuard())).mount("#app");
