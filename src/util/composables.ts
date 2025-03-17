import { nextTick, onMounted, watchEffect, type useTemplateRef } from "vue";
import {
  useMutationObserver,
  useResizeObserver,
  useScroll,
} from "@vueuse/core";
import icon from "@/assets/angle.svg";

type TemplateRef = ReturnType<typeof useTemplateRef<HTMLElement>>;

/** add classes to element when scrollable for styling */
export const useScrollable = (
  element: TemplateRef,
  color = "#80808040",
  size = 20,
) => {
  const { arrivedState } = useScroll(element);

  watchEffect(() => {
    if (!element.value) return;

    /** which edges scroll is at */
    const { left, right, top, bottom } = arrivedState;

    /** gradient layers */
    const gradients = (
      [
        [!right, "left"],
        [!bottom, "top"],
        [!left, "right"],
        [!top, "bottom"],
      ] as const
    ).map(([arrived, direction]) =>
      arrived
        ? `linear-gradient(to ${direction}, ${color}, transparent ${size}px)`
        : "",
    );

    /** image layers */
    const images = (
      [
        [!left, "left center", 270],
        [!top, "center top", 0],
        [!right, "right center", 90],
        [!bottom, "center bottom", 180],
      ] as const
    ).map(([arrived, side, rotate]) => {
      /** get icon svg url */
      const url = icon
        /** replace strings in svg source as needed */
        .replace("ROTATE", String(rotate))
        .replace("COLOR", window.encodeURIComponent(color));
      return arrived ? `url("${url}") ${side} / ${size}px no-repeat` : "";
    });

    /** combine background layers */
    const background = gradients.concat(images).filter(Boolean).join(", ");

    /** set style */
    element.value.style.setProperty("background", background);
  });

  /** force arrived state to update */
  const update = async () => {
    await nextTick();
    element.value?.dispatchEvent(new Event("scroll"));
  };

  /** update on some events that might affect element's scroll */
  onMounted(update);
  useResizeObserver(element, update);
  useMutationObserver(element, update, { childList: true, subtree: true });

  return { ref: element };
};
