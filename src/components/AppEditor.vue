<template>
  <div ref="editorElement" class="editor">
    <div ref="editableElement" contenteditable class="editable" />
    <div v-if="showPlaceholder" class="placeholder">
      <p>
        <slot name="placeholder" />
      </p>
    </div>
    <template
      v-for="(rects, highlightIndex) in highlightRects"
      :key="highlightIndex"
    >
      <div
        v-for="(rect, rectIndex) in rects"
        :key="rectIndex"
        :class="[
          'highlight',
          selectedIndex === highlightIndex && 'highlight-selected',
        ]"
        tabindex="0"
        role="button"
        :style="{
          top: rect.top + 'px',
          left: rect.left + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
          '--strength': highlights[highlightIndex]?.strength,
        }"
        @mouseenter="select($event, highlightIndex)"
        @focus="select($event, highlightIndex)"
        @mouseleave="deselect()"
        @blur="deselect()"
      />
    </template>
  </div>
</template>

<script setup lang="ts" generic="Data">
import {
  onUnmounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  watchEffect,
} from "vue";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  LineBreakNode,
  TextNode,
} from "lexical";
import { registerPlainText } from "@lexical/plain-text";
import { $canShowPlaceholder } from "@lexical/text";
import { $descendantsMatching } from "@lexical/utils";
import { useElementBounding, useScroll } from "@vueuse/core";
import { flag } from "@/util/misc";

/**
 * editable textarea with highlighting is deceptively complex problem to solve
 * robustly (browser compatibility, accessibility, edge-cases). see here for
 * previous discussion https://github.com/krishnanlab/simplex/pull/2
 */

/** model value */
type Value = string;
/** what to highlight */
type Highlights = {
  /** start index */
  start: number;
  /** end index */
  end: number;
  /** strength of highlight */
  strength: number;
  /** arbitrary data associated with highlight */
  data: Data;
}[];

type Props = {
  modelValue: Value;
  highlights: Highlights;
};

const { modelValue, highlights } = defineProps<Props>();

type Emits = {
  "update:modelValue": [Value];
  /** when highlight is hovered */
  select: [Data, HTMLDivElement];
  /** when highlight is unhovered */
  deselect: [];
};

const emit = defineEmits<Emits>();

type Slots = {
  placeholder: [];
};

defineSlots<Slots>();

/** elements */
const editorElement = useTemplateRef("editorElement");
const editableElement = useTemplateRef("editableElement");
const selectedRef = ref<HTMLDivElement>();

/** element properties */
const editorBbox = useElementBounding(editorElement);
const editorScroll = useScroll(editorElement);

/** index of selected highlight */
const selectedIndex = ref(-1);
/** whether placeholder should be shown */
const showPlaceholder = ref(false);
/** bbox rectangles (relative to editor element) of highlights */
const highlightRects = shallowRef<DOMRect[][]>([]);

/** use lexical editor to enforce consistent contenteditable across browsers */

/** lexical editor */
const editor = createEditor();
registerPlainText(editor);
watchEffect(() => editor.setRootElement(editableElement.value));

/** update placeholder state */
const updatePlaceholder = () =>
  editor.read(
    () => (showPlaceholder.value = $canShowPlaceholder(editor.isComposing())),
  );
const removeUpdateListener = editor.registerUpdateListener(updatePlaceholder);
const removeEditableListener =
  editor.registerEditableListener(updatePlaceholder);

/** flag for whether model value just emitted to parent */
const justEmitted = flag();

/** when user types in textbox */
const removeTextContentListener = editor.registerTextContentListener(
  (textContent) => {
    /** notify parent of model value change */
    emit("update:modelValue", textContent);
    justEmitted.set();
  },
);

watch(
  /** when parent model value changes */
  () => modelValue,
  () => {
    /** prevent infinite model value get/set loop */
    if (justEmitted.get()) return;

    /** split text by line */
    const lines = modelValue.split("\n");

    editor.update(() => {
      /** reset editor */
      const root = $getRoot();
      root.clear();

      /** avoid orphan paragraph node */
      if (!modelValue || !lines.length) return;

      /** single paragraph node to make textContent predictable */
      const p = $createParagraphNode();
      root.append(p);

      /** create new lexical node for each line */
      let lineBreak;
      for (const line of lines) {
        p.append($createTextNode(line));
        p.append((lineBreak = $createLineBreakNode()));
      }
      /** remove last line break */
      lineBreak?.remove();
    });
  },
  { immediate: true },
);

/** when selected index changes */
watch(
  [selectedIndex, selectedRef],
  () => {
    if (selectedIndex.value === -1 || !selectedRef.value) emit("deselect");
    else {
      const highlight = highlights[selectedIndex.value]!;
      /** notify parent of highlight being selected */
      emit("select", highlight.data, selectedRef.value);
    }
  },
  { immediate: true, deep: true },
);

watch(
  /** when model value changes or editor resized */
  [() => modelValue, () => highlights, editorBbox.width, editorBbox.height],
  /**
   * only need to detect when positions of words change _relative to editor
   * container_, i.e. when text or word wrapping changes. thus, don't need to
   * listen to editor bbox x/y or scroll x/y due to how highlights positioned
   * with CSS.
   */
  () => {
    /** create text selection to be reused */
    const range = document.createRange();

    /** reset rects */
    highlightRects.value = [];

    editor.read(() => {
      /** get all relevant lexical nodes */
      const textNodes = $descendantsMatching(
        $getRoot().getChildren(),
        (node) => node instanceof TextNode || node instanceof LineBreakNode,
      );

      /** track character position/count */
      let charIndex = 0;

      for (const textNode of textNodes) {
        /** get actual dom text node from lexical text node */
        const text = editor.getElementByKey(textNode.getKey())?.firstChild;

        /** num of chars in text node */
        const chars = textNode.getTextContentSize();

        if (text instanceof Text && text.nodeType === Node.TEXT_NODE) {
          /** find all highlight ranges that fall within this text */
          const inRange = highlights.filter(
            ({ start, end }) =>
              start >= charIndex &&
              start <= charIndex + chars &&
              end >= charIndex &&
              end <= charIndex + chars,
          );

          /** for each range */
          for (const { start, end } of inRange) {
            /** set selection */
            range.setStart(text, start - charIndex);
            range.setEnd(text, end - charIndex);

            /** get bboxes of selection (can be multiple due to line wrapping) */
            const rects: DOMRect[] = [];
            for (const rect of range.getClientRects())
              rects.push(
                /** rect is current bbox of text (relative to screen) */
                new DOMRect(
                  /**
                   * find bbox of text relative to editor by subtracting current
                   * bbox of editor (relative to screen)
                   */
                  rect.left - editorBbox.left.value + editorScroll.x.value,
                  rect.top - editorBbox.top.value + editorScroll.y.value,
                  rect.width,
                  rect.height,
                ),
              );

            highlightRects.value.push(rects);
          }
        }
        /** increment char */
        charIndex += chars;
      }
    });
  },
  { immediate: true, deep: true },
);

/** select highlight */
const select = (event: Event, index: number) => {
  selectedIndex.value = index;
  selectedRef.value = event.target as HTMLDivElement;
};

/** deselect highlight */
const deselect = () => {
  selectedIndex.value = -1;
  selectedRef.value = undefined;
};

/** cleanup */
onUnmounted(() => {
  removeTextContentListener();
  removeUpdateListener();
  removeEditableListener();
});
</script>

<style scoped>
.editor {
  display: flex;
  position: relative;
  flex-grow: 1;
}

.editable {
  flex-grow: 1;
  padding: 30px 40px;
}

.editor:has(.placeholder) .editable {
  position: absolute;
  inset: 0;
}

.placeholder {
  display: flex;
  flex-direction: column;
  padding: 30px 40px;
  gap: 20px;
  color: var(--gray);
  pointer-events: none;
}

.highlight {
  position: absolute;
  background-color: color-mix(
    in srgb,
    transparent,
    var(--primary) calc(35% * var(--strength))
  );
  mix-blend-mode: darken;
  cursor: pointer;
}

.highlight-selected {
  box-shadow: 0 2px 0 var(--black);
}
</style>
