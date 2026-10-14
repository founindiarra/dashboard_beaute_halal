<script setup>
import { computed } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import { APPOINTMENT_STATUSES, capitalize, toDateKey } from '@/utils/format'

/**
 * Vue mensuelle des rendez-vous.
 * Les données viennent d'un seul appel `GET /admin/appointments?from=&to=`
 * borné au mois affiché : aucune donnée n'est reconstituée localement.
 */
const props = defineProps({
  cursor: { type: Date, required: true },
  appointments: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['shift', 'select'])

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const today = toDateKey()

const monthLabel = computed(() =>
  capitalize(
    new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(props.cursor),
  ),
)

/** Index « AAAA-MM-JJ » → rendez-vous du jour, triés par heure. */
const byDate = computed(() => {
  const map = new Map()
  props.appointments.forEach((item) => {
    const key = String(item.date).slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  })
  map.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)))
  return map
})

/** Grille du mois, semaine commençant le lundi. */
const cells = computed(() => {
  const ref = props.cursor
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const offset = (new Date(ref.getFullYear(), ref.getMonth(), 1).getDay() + 6) % 7

  const list = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = toDateKey(new Date(ref.getFullYear(), ref.getMonth(), day))
    list.push({ key, label: day, isToday: key === today, items: byDate.value.get(key) ?? [] })
  }
  return list
})

const toneClass = (status) => {
  const tone = APPOINTMENT_STATUSES[status]?.tone ?? 'neutral'
  return (
    {
      ok: 'bg-ok-bg text-ok',
      warn: 'bg-warn-bg text-warn',
      danger: 'bg-danger-bg text-danger line-through',
      info: 'bg-info-bg text-info',
      neutral: 'bg-line-soft text-muted',
    }[tone] || 'bg-line-soft text-muted'
  )
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-lg border border-line text-cocoa transition-colors hover:border-gold hover:text-gold"
        aria-label="Mois précédent"
        @click="$emit('shift', -1)"
      >
        <AdminIcon name="chevron-left" class="h-4 w-4" />
      </button>

      <p class="font-display text-lg text-cocoa-dark">
        {{ monthLabel }}
        <span v-if="loading" class="ml-2 align-middle text-xs font-sans text-muted">
          chargement…
        </span>
      </p>

      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-lg border border-line text-cocoa transition-colors hover:border-gold hover:text-gold"
        aria-label="Mois suivant"
        @click="$emit('shift', 1)"
      >
        <AdminIcon name="chevron-right" class="h-4 w-4" />
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <span
        v-for="day in WEEKDAYS"
        :key="day"
        class="py-1 text-center text-[0.62rem] uppercase tracking-[0.08em] text-muted"
      >
        {{ day }}
      </span>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <template v-for="(cell, index) in cells" :key="cell ? cell.key : `empty-${index}`">
        <span v-if="!cell" />
        <div
          v-else
          class="flex min-h-[4.5rem] flex-col gap-1 rounded-lg border p-1.5 sm:min-h-[6rem]"
          :class="
            cell.isToday ? 'border-gold/60 bg-ivory/50' : 'border-line-soft bg-surface'
          "
        >
          <span
            class="text-[0.7rem] font-medium"
            :class="cell.isToday ? 'text-gold' : 'text-muted'"
          >
            {{ cell.label }}
          </span>

          <button
            v-for="item in cell.items.slice(0, 3)"
            :key="item.id"
            type="button"
            class="w-full truncate rounded px-1.5 py-0.5 text-left text-[0.65rem] transition-opacity hover:opacity-80"
            :class="toneClass(item.status)"
            :title="`${item.time} — ${item.customer.firstName} ${item.customer.lastName} — ${item.service.name}`"
            @click="$emit('select', item)"
          >
            {{ item.time }} {{ item.customer.firstName }}
          </button>

          <span v-if="cell.items.length > 3" class="px-1.5 text-[0.62rem] text-muted">
            +{{ cell.items.length - 3 }} autre{{ cell.items.length - 3 > 1 ? 's' : '' }}
          </span>
        </div>
      </template>
    </div>

    <p class="text-xs text-muted">
      Le mois affiché est chargé en une fois, dans la limite de 100 rendez-vous.
    </p>
  </div>
</template>
