export type JournalGitObjectRepairThrottle = {
  clearAttempt: (cooldownKey: string) => void
  getAttemptedAt: (cooldownKey: string) => number | null
  rememberAttempt: (cooldownKey: string, attemptedAt: number) => void
}

export function createJournalGitObjectRepairThrottle(): JournalGitObjectRepairThrottle {
  const attempts = new Map<string, number>()

  return {
    clearAttempt: (cooldownKey) => {
      attempts.delete(cooldownKey)
    },
    getAttemptedAt: (cooldownKey) => attempts.get(cooldownKey) ?? null,
    rememberAttempt: (cooldownKey, attemptedAt) => {
      attempts.set(cooldownKey, attemptedAt)
    },
  }
}
