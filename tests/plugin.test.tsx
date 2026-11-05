import type { On, TurnUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const MIN = 60_000

const usage: TurnUsage = {
  model: 'claude-opus-5-5',
  input_tokens: 2,
  cache_read_input_tokens: 113_000,
  cache_creation_input_tokens: 300,
  output_tokens: 100,
}

// What the stand-in engine reports: its MCP servers, and the notifications sent.
let servers: string[] = []
let notices: string[] = []

// Stands for the engine: each model request is answered with `usage`.
const engine = (on: On) => {
  servers = ['github']
  notices = []
  on('command.register', () => ({ value: { command: 'contextwatch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.23 } } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('tool.list', () => ({ value: servers.map(name => ({ name: `mcp__${name}__run`, description: '', mcp: true })) }))
  on('ui.notify', (_, e) => {
    notices.push(e.text)

    return { value: { isSent: true, channel: 'terminal_bell' as const } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
}

// Reads a model request's stream to its end, as the engine's loop does.
const drain = async <R,>(stream: AsyncGenerator<unknown, R> & { result: Promise<R> }) => {
  for await (const _ of stream) {
  }

  return stream.result
}

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }

const COMMAND = {
  command: 'contextwatch',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
}

test('a response starts the countdown', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(12 * MIN)

  const ran = await $.command.run({ ...COMMAND, args: '' })
  expect(ran.text).toMatch(/48 min left/)
  expect(ran.text).toMatch(/cache read ~\$0\.02/)
  expect(ran.text).toMatch(/cache rewrite ~\$0\.9/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'contextwatch', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect((await band.find({ type: 'Text', text: /48 min left/ }))?.text).toMatch(/cold ~\$0\.91/)
    await band.unmount()
  }
})

test('a subagent response is not counted', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step({ ...STEP, agentId: 'a1' }))

  const ran = await $.command.run({ ...COMMAND, args: '' })
  expect(ran.text).toBe('No response yet in this session.')
})

test('the cache goes cold after its TTL', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(61 * MIN)

  const ran = await $.command.run({ ...COMMAND, args: '' })
  expect(ran.text).toMatch(/Cache cold/)
})

test('the pane shows the countdown, switch costs and the session total', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(5 * MIN)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({
      plugin: 'contextwatch',
      surface,
      component: 'Pane',
      requestId: 'contextwatch',
      props: {
        title: 'Context',
        isFocused: false,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
      },
    })
    expect((await pane.find({ type: 'Text', text: /left$/ }))?.text).toBe('55 min left')
    expect(await pane.find({ type: 'Text', text: /^Sonnet 5\.5/ })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /^\$1\.23$/ }))?.text).toBe('$1.23')
    await pane.unmount()
  }
})

const SWITCH = {
  from_model: 'claude-opus-5-5',
  to_model: 'claude-sonnet-5-5',
  requested_model: 'sonnet',
  source: 'picker' as const,
  context_tokens: 113_402,
  prompt_cache_warm: true,
  cache_ttl: '1h' as const,
  estimated_cache_write_usd: 0.45,
  pricing: 'catalog' as const,
}

test('a costly switch away from a warm cache asks first', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)
  on('classic.PreModelSwitch', () => ({}))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))

  const asked = await $.classic.PreModelSwitch({ ...SWITCH, estimated_cache_write_usd: 0.9 })
  expect(asked.permissionDecision).toBe('ask')
  expect(asked.permissionDecisionReason).toMatch(/Sonnet 5\.5 rewrites 113k tokens of context \(~\$0\.90\)/)

  // Under the threshold, or with a cold cache, the switch goes ahead.
  expect((await $.classic.PreModelSwitch(SWITCH)).permissionDecision).toBeUndefined()
  expect((await $.classic.PreModelSwitch({ ...SWITCH, estimated_cache_write_usd: 0.9, prompt_cache_warm: false })).permissionDecision).toBeUndefined()
})

test('a threshold of zero never asks', { options: { confirmSwitchUsd: 0 } }, async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)
  on('classic.PreModelSwitch', () => ({}))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.classic.PreModelSwitch({ ...SWITCH, estimated_cache_write_usd: 9 })).permissionDecision).toBeUndefined()
})

test('the away reminder is sent once, only when turned on', { options: { awayReminder: true } }, async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(50 * MIN)
  expect(notices.length).toBe(0)

  await clock.advance(6 * MIN)
  expect(notices.length).toBe(1)
  expect(notices[0]).toMatch(/Cache cools in 5 min/)

  await clock.advance(2 * MIN)
  expect(notices.length).toBe(1)
})

test('no away reminder by default', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(58 * MIN)
  expect(notices.length).toBe(0)
})

test('an MCP server change while warm is flagged in the band', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  servers = ['github', 'slack']
  await clock.advance(1 * MIN)

  const band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await band.find({ type: 'Text', text: /MCP servers changed/ }))?.text).toMatch(/\+slack/)
  await band.unmount()

  // The next response is sent with the new tools, so the warning clears.
  await drain($.turn.step(STEP))
  await clock.advance(1 * MIN)
  const after = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await after.find({ type: 'Text', text: /MCP servers changed/ })).toBeUndefined()
  await after.unmount()
})
