import type { PluginOptions } from 'claude-code'

export type Options = {
  // Dollars above which a model switch asks first; 0 turns the question off.
  confirmSwitchUsd: number
  awayReminder: boolean
  awayReminderMinutes: number
}

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

export const readOptions = (raw: PluginOptions): Options => ({
  confirmSwitchUsd: Math.max(0, num(raw.confirmSwitchUsd, 0.5)),
  awayReminder: raw.awayReminder === true,
  awayReminderMinutes: Math.max(1, num(raw.awayReminderMinutes, 5)),
})
