import type { EngineInterface, Register, Timer } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { answerCommand, registerCommand } from '../src/commands'
import { calibrate, isLedgerEntry, LEDGER_TTL_MS, parseLimits, totalSpend } from '../src/core/usage'
import { guardColdSend, guardModelSwitch, watchAway } from '../src/guards'
import type { Options } from '../src/options'
import { readOptions } from '../src/options'
import { watchCompactions } from '../src/sources/compact'
import { watchDraft } from '../src/sources/draft'
import { watchLive } from '../src/sources/live'
import { registerBand } from '../src/ui/band'
import { openPane, registerPane } from '../src/ui/pane'

const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const sessionUsd = atom({ plugin: 'contextwatch', key: 'sessionUsd' } as const, null)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null, samples: [] })

// The learned ratio outlives the session: the subscription's windows do not change with it.
// v2: the first version learned from one session's spend alone and could read
// many times too high; its value is ignored.
const STORE_RATIO = 'calibration.v2'
const LEDGER_PREFIX = 'spend:'

// Minutes are all the UI shows, so a slow tick keeps it calm.
const TICK_MS = 30_000

let ticker: Timer | undefined

export const register: Register = (on, raw) => {
  const options = readOptions(raw)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await registerCommand($)
    // The band says it all; clear a status line an older version pinned.
    $.ui.status(undefined)
    await loadRatio($)
    await tick($, options)
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void tick($, options))
    void openPane($)

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await tick($, options)

    return done
  })

  answerCommand(on)
  watchLive(on)
  watchCompactions(on)
  watchDraft(on)
  guardModelSwitch(on, options)
  guardColdSend(on, options)
  registerBand(on)
  registerPane(on)
}

// Moves the shared clock on and refreshes what the engine knows; the band
// and the pane redraw from it.
async function tick($: EngineInterface, options: Options) {
  const time = await $.clock.now()
  await update($, now, () => time)
  await refresh($)
  await watchAway($, options, time)
}

async function refresh($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    const usd = usage.cost?.usd ?? null
    const windows = parseLimits(usage.rateLimits)
    await update($, sessionUsd, () => usd)
    await update($, limits, () => windows)

    const before = await read($, calibration)
    const after = calibrate(before, await accountSpend($, usd), windows)
    await update($, calibration, () => after)
    if (after.percentPerUsd !== null && after.samples !== before.samples) {
      await $.store.set(STORE_RATIO, { percentPerUsd: after.percentPerUsd, samples: after.samples })
    }
  } catch {
    // Hosts without a cost ledger or usage windows leave these out.
  }

  try {
    const model = await $.session.model()
    await update($, activeModel, () => model)
  } catch {
    // Without it the band cannot warn about a switch; nothing else depends on it.
  }
}

// Writes this session's spend to the shared ledger and returns the spend of
// every session on it, so the ratio divides the account's window by the
// account's dollars. Null without a cost figure.
async function accountSpend($: EngineInterface, usd: number | null): Promise<number | null> {
  if (usd === null) return null

  const now = await $.clock.now()
  const key = `${LEDGER_PREFIX}${await $.session.id()}`
  const mine = await $.store.get(key)
  const first = isLedgerEntry(mine) ? mine.first : usd
  if (!isLedgerEntry(mine) || mine.usd !== usd || now - mine.at > LEDGER_TTL_MS / 2) {
    await $.store.set(key, { first, usd, at: now })
  }

  const entries = []
  for (const k of await $.store.keys()) {
    if (!k.startsWith(LEDGER_PREFIX)) continue
    const entry = k === key ? { first, usd, at: now } : await $.store.get(k)
    if (!isLedgerEntry(entry)) continue
    if (now - entry.at >= LEDGER_TTL_MS) await $.store.delete(k)
    else entries.push(entry)
  }

  return totalSpend(entries, now)
}

async function loadRatio($: EngineInterface) {
  try {
    const stored = await $.store.get(STORE_RATIO)
    const samples = (stored as { samples?: unknown } | undefined)?.samples
    if (Array.isArray(samples) && samples.length > 0 && samples.every(n => typeof n === 'number' && n > 0)) {
      await update($, calibration, cal =>
        cal.percentPerUsd === null ? { ...cal, samples, percentPerUsd: Math.min(...samples) } : cal,
      )
    }
  } catch {
    // Without the store the ratio is learned again in this session.
  }
}
