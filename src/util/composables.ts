import type { Ref } from "vue";
import { nextTick, onMounted, watchEffect } from "vue";
import {
  useMutationObserver,
  useResizeObserver,
  useScroll,
} from "@vueuse/core";
import icon from "@/assets/angle.svg";

/** add classes to element when scrollable for styling */
export const useScrollable = (
  element: Ref<HTMLElement | null | undefined>,
  backgroundColor = "#ffffff",
  shadowColor = "#80808040",
  arrowColor = "#808080a0",
  shadowSize = 30,
  arrowSize = 15,
) => {
  const { arrivedState } = useScroll(element);

  watchEffect(() => {
    if (!element.value) return;

    /** which edges scroll is at */
    const { left, right, top, bottom } = arrivedState;

    /** gradient layers */
    const gradients = (
      [
        [!left, 270],
        [!top, 180],
        [!right, 90],
        [!bottom, 0],
      ] as const
    ).map(([arrived, direction]) =>
      arrived
        ? `linear-gradient(${direction}deg, ${shadowColor}, transparent ${shadowSize}px)`
        : "",
    );

    /** nudge arrow to center in shadow */
    const nudge = (shadowSize - arrowSize) / 2 + "px";

    /** image layers */
    const images = (
      [
        [!left, `left ${nudge} center`, 90],
        [!top, `center top ${nudge}`, 0],
        [!right, `right ${nudge} center`, 270],
        [!bottom, `center bottom ${nudge}`, 180],
      ] as const
    ).map(([arrived, side, rotate]) => {
      /** get icon svg url */
      const url = icon
        /** replace strings in svg source as needed */
        .replace("ROTATE", String(rotate))
        .replace("COLOR", window.encodeURIComponent(arrowColor));
      return arrived ? `url("${url}") ${side} / ${arrowSize}px no-repeat` : "";
    });

    /** combine background layers */
    const backgroundStyle = images
      .concat(gradients)
      .concat([backgroundColor])
      .filter(Boolean)
      .join(", ");

    /** set style */
    element.value.style.setProperty("background", backgroundStyle);
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
