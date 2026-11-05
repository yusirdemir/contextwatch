import type { PluginOptions } from 'claude-code'

export type Options = {
  // Ask before a message that would rewrite a large cold cache.
  askWhenCold: boolean
  // Dollars above which a model switch asks first; 0 turns the question off.
  confirmSwitchUsd: number
  awayReminder: boolean
  awayReminderMinutes: number
}

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

export const readOptions = (raw: PluginOptions): Options => ({
  askWhenCold: raw.askWhenCold !== false,
  confirmSwitchUsd: Math.max(0, num(raw.confirmSwitchUsd, 0.5)),
  awayReminder: raw.awayReminder === true,
  awayReminderMinutes: Math.max(1, num(raw.awayReminderMinutes, 5)),
})
