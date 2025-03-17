import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import VueTippy from "vue-tippy";
import "tippy.js/dist/tippy.css"; // optional for styling
import "./style.css";

import "./util/search";

const app = createApp(App);
app.use(router);
app.use(VueTippy, {
  directive: "tooltip",
  component: "AppTooltip",
  defaultProps: {
    delay: [100, 0],
    allowHTML: true,
    // onHide: () => false,
  },
});
app.mount("#app");
