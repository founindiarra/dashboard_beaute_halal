<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import AdminLogo from '@/components/ui/AdminLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const touched = ref(false)

/**
 * Le mot de passe ne quitte jamais ce composant autrement que dans l'appel
 * à l'API : il n'est ni journalisé, ni stocké, ni conservé après l'envoi.
 */
const emailError = computed(() => {
  if (!touched.value) return ''
  if (!email.value.trim()) return 'Indiquez votre adresse e-mail.'
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return 'Adresse e-mail invalide.'
  return ''
})

const passwordError = computed(() => {
  if (!touched.value) return ''
  return password.value ? '' : 'Indiquez votre mot de passe.'
})

const submit = async () => {
  touched.value = true
  if (emailError.value || passwordError.value) return

  const ok = await auth.login(email.value.trim(), password.value)
  password.value = ''
  if (!ok) return

  const suite = typeof route.query.suite === 'string' ? route.query.suite : null
  router.push(suite || { name: 'dashboard' })
}
</script>

<template>
  <!--
    Connexion : une seule colonne, centrée dans la page sur les deux axes.
    Le fond reprend le marron du salon ; la carte blanche s'y détache seule,
    et tout ce qui identifie l'application — logo, nom, « Connexion » — vit
    à l'intérieur de cette carte plutôt que de flotter autour.
  -->
  <div class="flex min-h-dvh items-center justify-center bg-sidebar px-5 py-10 sm:px-8">
    <div class="w-full max-w-sm">
      <div class="card p-6 sm:p-7">
        <!-- Marque et titre, à l'intérieur du formulaire -->
        <div class="flex flex-col items-center gap-3 text-center">
          <AdminLogo class="h-14 w-14" />
          <span class="flex flex-col gap-0.5 leading-tight">
            <span class="font-display text-2xl text-cocoa-dark">Beauté Halal</span>
            <span class="text-[0.62rem] uppercase tracking-[0.22em] text-gold">Administration</span>
          </span>
        </div>

        <div class="mt-6 border-t border-line pt-6 text-center">
          <h1 class="text-2xl">Connexion</h1>
          <p class="mt-1.5 text-sm text-muted">Identifiez-vous pour accéder à l’administration.</p>
        </div>

        <div
          v-if="auth.error"
          class="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-3 text-sm text-danger"
          role="alert"
        >
          <AdminIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
          <span>{{ auth.error }}</span>
        </div>

        <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="submit">
          <BaseField
            v-model="email"
            label="Adresse e-mail"
            type="email"
            autocomplete="username"
            placeholder="vous@exemple.com"
            required
            :error="emailError"
          />

          <div class="relative">
            <BaseField
              v-model="password"
              label="Mot de passe"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••••"
              required
              :error="passwordError"
            />
            <button
              type="button"
              class="absolute right-2 top-[1.85rem] grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:text-cocoa-dark"
              :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
              @click="showPassword = !showPassword"
            >
              <AdminIcon :name="showPassword ? 'eye-off' : 'eye'" class="h-4 w-4" />
            </button>
          </div>

          <BaseButton type="submit" block :loading="auth.loading" class="mt-1">
            {{ auth.loading ? 'Connexion…' : 'Se connecter' }}
          </BaseButton>
        </form>
      </div>

      <!-- Hors carte, donc sur le marron : la couleur du texte suit le fond. -->
      <p class="mt-5 text-center text-xs leading-relaxed text-cream/60">
        Après dix tentatives infructueuses, l’accès est suspendu quinze minutes.<br />
        Accès réservé au personnel autorisé.
      </p>
    </div>
  </div>
</template>
