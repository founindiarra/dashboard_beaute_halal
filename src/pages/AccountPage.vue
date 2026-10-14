<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { auth as api } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime } from '@/utils/format'

const auth = useAuthStore()
const router = useRouter()
const toasts = useToastStore()

/* ── Identité ── */
const profile = ref({ name: '', email: '' })
const profileBusy = ref(false)
const profileError = ref('')

watch(
  () => auth.user,
  (user) => {
    profile.value = { name: user?.name ?? '', email: user?.email ?? '' }
  },
  { immediate: true },
)

const profileChanged = computed(
  () =>
    profile.value.name !== (auth.user?.name ?? '') ||
    profile.value.email.toLowerCase() !== (auth.user?.email ?? '').toLowerCase(),
)

const saveProfile = async () => {
  profileError.value = ''
  if (profile.value.name.trim().length < 2) {
    profileError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }
  if (!/^\S+@\S+\.\S+$/.test(profile.value.email.trim())) {
    profileError.value = 'Adresse e-mail invalide.'
    return
  }

  profileBusy.value = true
  try {
    await api.updateUser(auth.user.id, {
      name: profile.value.name.trim(),
      email: profile.value.email.trim().toLowerCase(),
    })
    await auth.refresh()
    toasts.success('Compte mis à jour.')
  } catch (caught) {
    profileError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    profileBusy.value = false
  }
}

/* ── Mot de passe ── */
const passwords = ref({ current: '', next: '', confirm: '' })
const passwordBusy = ref(false)
const passwordError = ref('')
const showPasswords = ref(false)

const changePassword = async () => {
  passwordError.value = ''
  if (!passwords.value.current) {
    passwordError.value = 'Indiquez votre mot de passe actuel.'
    return
  }
  if (passwords.value.next.length < 10) {
    passwordError.value = 'Le nouveau mot de passe doit faire au moins 10 caractères.'
    return
  }
  if (passwords.value.next !== passwords.value.confirm) {
    passwordError.value = 'La confirmation ne correspond pas.'
    return
  }
  if (passwords.value.next === passwords.value.current) {
    passwordError.value = 'Le nouveau mot de passe doit être différent de l’actuel.'
    return
  }

  passwordBusy.value = true
  try {
    await api.changePassword(passwords.value.current, passwords.value.next)
    // Les mots de passe sont effacés de la mémoire dès l'appel terminé.
    passwords.value = { current: '', next: '', confirm: '' }
    toasts.success('Mot de passe modifié.')
  } catch (caught) {
    passwordError.value = caught?.message || 'Modification impossible.'
  } finally {
    passwordBusy.value = false
  }
}

const logout = () => {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Mon compte" subtitle="Vos informations de connexion à l’administration." />

    <div class="grid gap-5 lg:grid-cols-2">
      <!-- ── Identité ── -->
      <section class="card overflow-hidden">
        <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 class="text-sm font-medium text-cocoa-dark">Informations</h2>
          <StatusBadge
            :label="auth.user?.role === 'admin' ? 'Administrateur' : 'Équipe'"
            :tone="auth.user?.role === 'admin' ? 'info' : 'neutral'"
          />
        </header>

        <div class="flex flex-col gap-4 p-4">
          <p
            v-if="profileError"
            class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {{ profileError }}
          </p>

          <BaseField v-model="profile.name" label="Nom" required autocomplete="name" />
          <BaseField
            v-model="profile.email"
            label="Adresse e-mail"
            type="email"
            required
            autocomplete="email"
            hint="C’est l’identifiant utilisé pour vous connecter."
          />

          <dl class="grid gap-2 rounded-lg bg-canvas p-3 text-xs">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Dernière connexion</dt>
              <dd class="text-cocoa-dark">{{ formatDateTime(auth.user?.lastLoginAt) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Compte créé le</dt>
              <dd class="text-cocoa-dark">{{ formatDateTime(auth.user?.createdAt) }}</dd>
            </div>
          </dl>

          <BaseButton :disabled="!profileChanged" :loading="profileBusy" @click="saveProfile">
            Enregistrer
          </BaseButton>
        </div>
      </section>

      <!-- ── Mot de passe ── -->
      <section class="card overflow-hidden">
        <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 class="text-sm font-medium text-cocoa-dark">Mot de passe</h2>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-cocoa-dark"
            @click="showPasswords = !showPasswords"
          >
            <AdminIcon :name="showPasswords ? 'eye-off' : 'eye'" class="h-3.5 w-3.5" />
            {{ showPasswords ? 'Masquer' : 'Afficher' }}
          </button>
        </header>

        <div class="flex flex-col gap-4 p-4">
          <p
            v-if="passwordError"
            class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {{ passwordError }}
          </p>

          <BaseField
            v-model="passwords.current"
            label="Mot de passe actuel"
            :type="showPasswords ? 'text' : 'password'"
            autocomplete="current-password"
            required
          />
          <BaseField
            v-model="passwords.next"
            label="Nouveau mot de passe"
            :type="showPasswords ? 'text' : 'password'"
            autocomplete="new-password"
            required
            hint="Au moins 10 caractères."
          />
          <BaseField
            v-model="passwords.confirm"
            label="Confirmer le nouveau mot de passe"
            :type="showPasswords ? 'text' : 'password'"
            autocomplete="new-password"
            required
          />

          <BaseButton :loading="passwordBusy" @click="changePassword">
            Changer le mot de passe
          </BaseButton>

          <p class="text-xs leading-relaxed text-muted">
            Votre mot de passe n’est jamais stocké par cette interface : il est envoyé une seule
            fois au serveur, qui n’en conserve qu’une empreinte chiffrée.
          </p>
        </div>
      </section>
    </div>

    <section class="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-sm font-medium text-cocoa-dark">Session</h2>
        <p class="mt-0.5 text-xs text-muted">
          La session expire automatiquement après 12 heures d’inactivité.
        </p>
      </div>
      <BaseButton variant="secondary" size="sm" @click="logout">
        <AdminIcon name="logout" class="h-3.5 w-3.5" />
        Se déconnecter
      </BaseButton>
    </section>
  </div>
</template>
