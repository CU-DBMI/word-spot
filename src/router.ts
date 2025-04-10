import { createRouter, createWebHistory } from "vue-router";
import PageHome from "@/pages/PageHome.vue";

const routes = [{ path: "/", component: PageHome }];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
