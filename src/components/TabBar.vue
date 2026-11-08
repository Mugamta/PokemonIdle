<script setup lang="ts">
import { TABS, type TabId } from './tabs'

const active = defineModel<TabId>({ required: true })
</script>

<template>
  <nav class="tab-bar">
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      class="tab"
      :class="{ active: active === tab.id }"
      @click="active = tab.id"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  border-top: 1px solid #3a3a44;
  background: #26262e;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  flex: 1;
  min-width: 0;
  height: 56px;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.tab.active {
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 3px 0 #ffcb05;
}
</style>
