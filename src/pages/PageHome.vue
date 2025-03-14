<template>
  <section>
    <div class="input">
      <h1>Ghostbusters</h1>
      <h2>Text to check</h2>
      <AppTextbox />
      <h2>Text to check for</h2>
      <AppTextbox />
      <button>Use Recommended</button>
    </div>

    <div class="output">
      <h2>Checked Text</h2>
      <div class="checked">
        <p>
          Lorem ipsum odor amet, consectetuer adipiscing elit. Rutrum felis per
          accumsan vehicula sit dictumst. Elit curabitur senectus per egestas
          aliquam nunc facilisis sagittis ad. Lectus curae nulla diam fermentum
          id feugiat. Sit mollis rhoncus consectetur ut vulputate dictum, metus
          hendrerit. Natoque mauris orci cubilia sapien tristique nec nec eu.
          Potenti habitant turpis quis augue enim feugiat potenti malesuada.
        </p>
        <p>
          Elementum nibh potenti adipiscing placerat leo nisi malesuada
          facilisis maecenas. Mi aptent vivamus congue id, phasellus integer.
          Vel nulla nulla ultricies fermentum feugiat, ut at. At pulvinar
          commodo fusce rhoncus fames eleifend laoreet. At aliquet metus, semper
          lectus gravida facilisi. Cubilia commodo hendrerit ultrices porttitor
          tempus sociosqu. Nulla lacinia eu conubia condimentum fringilla nec
          nibh id mus. Potenti molestie neque cursus gravida torquent integer
          leo. Aptent quisque nisl mus et praesent leo.
        </p>
        <p>
          Sapien porttitor sit luctus risus; laoreet duis lobortis. Sollicitudin
          fermentum rhoncus nibh justo ullamcorper. Nibh vulputate sagittis
          mattis egestas inceptos nisl conubia purus. Risus a class vivamus
          potenti lobortis torquent, pulvinar scelerisque. Dignissim sapien
          netus nunc sagittis interdum fermentum sed. Bibendum rutrum convallis
          volutpat per ut orci. Nunc lectus morbi consequat maximus penatibus.
          Felis morbi suspendisse ornare dui cubilia. Sem ad facilisis nisl et
          enim rutrum.
        </p>
      </div>
      <h2>Check Summary</h2>
      <div class="summary">
        <p>
          Lorem ipsum odor amet, consectetuer adipiscing elit. Venenatis natoque
          nullam sodales dictumst potenti cubilia dis. Adipiscing neque suscipit
          faucibus iaculis pharetra dui montes arcu. Conubia dictum suscipit
          vivamus mollis inceptos himenaeos senectus netus. Placerat tempor
          sapien ipsum eget a. Id donec faucibus ipsum habitant torquent
          ullamcorper, a tincidunt. At ultrices bibendum mollis efficitur
          volutpat neque nec cubilia.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppTextbox from "../components/AppTextbox.vue";
</script>

<style scoped>
section {
  display: flex;
  flex-grow: 1;
  padding: 0;
}

.input,
.output {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px;
}

.input {
  min-height: 100%;
  box-shadow: var(--shadow);
}

.output {
  flex-grow: 3;
}

textarea:first-of-type {
  width: 25vw;
  height: 50vh;
}

textarea:last-of-type {
  flex-grow: 1;
  resize: vertical;
  width: 0;
  min-width: 100%;
}
</style>
