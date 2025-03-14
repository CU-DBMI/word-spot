import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import VueTippy from "vue-tippy";
import "tippy.js/dist/tippy.css"; // optional for styling
import "./style.css";

const app = createApp(App);
app.use(router);
app.use(VueTippy, { directive: "tooltip", defaultProps: { delay: [100, 0] } });
app.mount("#app");
