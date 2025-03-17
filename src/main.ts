import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import VueTippy from "vue-tippy";
import "tippy.js/dist/tippy.css";
import "./style.css";

const app = createApp(App);
app.use(router);
app.use(VueTippy, {
  directive: "tooltip",
  component: "AppTooltip",
  defaultProps: {
    delay: [100, 0],
    duration: [300, 0],
    allowHTML: true,
    // onHide: () => false,
  },
});
app.mount("#app");
