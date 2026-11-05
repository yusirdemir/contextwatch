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

// A compaction leaves at least one message: its summary.
const SUMMARY = [{ role: 'user' as const, text: 'Summary of the conversation so far.', toolUses: [] }]

// What the stand-in engine reports: its MCP servers, and the notifications sent.
let servers: string[] = []
let notices: string[] = []

// What `$.session.usage()` reports: the session's spend and, on a
// subscription, how full the 5-hour and weekly windows are.
type Usage = { usd: number; five?: number; week?: number }

type EngineOptions = {
  usage?: () => Usage
  model?: () => string
  onStatus?: (text: string | undefined) => void
  onCompact?: () => void
  onToast?: (text: string) => void
  // How the person answers a question; throwing stands for dismissing it.
  answer?: (question: string) => string
  onSubmit?: (text: string) => void
  onClear?: () => void
  onFill?: (text: string) => void
  // Runs before each model request answers: how long the answer takes.
  answering?: () => Promise<void>
}

// Stands for the engine: each model request is answered with `usage`.
const engine = (on: On, options: EngineOptions = {}) => {
  servers = ['github']
  notices = []
  on('command.register', () => ({ value: { command: 'contextwatch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', (_, e) => {
    options.onStatus?.(e.text)

    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    options.onToast?.(e.text)

    return { value: undefined }
  })
  on('session.usage', () => {
    const u = options.usage?.() ?? { usd: 1.23, five: 40, week: 20 }
    const rateLimits = [
      ...(u.five === undefined ? [] : [{ kind: 'five_hour', percentUsed: u.five, resetsAt: new Date(80 * MIN).toISOString() }]),
      ...(u.week === undefined ? [] : [{ kind: 'seven_day', percentUsed: u.week, resetsAt: new Date(3 * 24 * 60 * MIN).toISOString() }]),
    ]

    return { value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits, cost: { usd: u.usd } } }
  })
  on('session.model', () => ({ value: options.model?.() ?? 'claude-opus-5-5' }))
  on('session.compact', () => {
    options.onCompact?.()

    return { messages: SUMMARY, tokensBefore: 113_402, tokensAfter: 15_000, usage: { ...usage, output_tokens: 6_000 } }
  })
  // $.ui.ask runs the AskUserQuestion tool: the person's answer, or a refusal for a dismissal.
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const question = e.questions[0]?.question ?? ''
    let answer: string
    try {
      answer = options.answer?.(question) ?? 'Send anyway'
    } catch {
      return { deny: 'dismissed' }
    }

    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('prompt.submit', (_, e) => {
    options.onSubmit?.(e.text)

    return { text: e.text }
  })
  on('prompt.fill', (_, e) => {
    options.onFill?.(e.text)

    return { isFilled: true } as never
  })
  on('command.run', { command: 'clear' }, () => {
    options.onClear?.()

    return { text: '' }
  })
  // What the engine draws where the plugin draws nothing.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('tool.list', () => ({ value: servers.map(name => ({ name: `mcp__${name}__run`, description: '', mcp: true })) }))
  on('ui.notify', (_, e) => {
    notices.push(e.text)

    return { value: { isSent: true, channel: 'terminal_bell' as const } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    await options.answering?.()

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
  expect(ran.text).toMatch(/5-hour 40% \(resets in 1 h 8 min\)/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'contextwatch', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect((await band.find({ type: 'Text', text: /^Cache/ }))?.text).toBe('Cache warm · 48 min ')
    expect(await band.find({ type: 'Button', key: 'details' })).toBeDefined()
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

test('the pane shows the countdown, the usage windows and the models on request', async ($, on) => {
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
    expect((await pane.find({ type: 'Text', text: /^55 min$/ }))?.text).toBe('55 min')
    expect(await pane.find({ type: 'Text', text: /^5-hour$/ })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /^40%$/ }))?.text).toBe('40%')
    // Warm: no figure for a cold cache that has not happened.
    expect(await pane.find({ type: 'Text', text: /rewrites the cache/ })).toBeUndefined()

    // The model comparison stays closed until asked for.
    expect(await pane.find({ type: 'Text', text: /^Sonnet 5\.5/ })).toBeUndefined()
    await pane.press({ key: 'models' })
    expect(await pane.find({ type: 'Text', text: /^Sonnet 5\.5/ })).toBeDefined()
    await pane.press({ key: 'models' })
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
  expect((await band.find({ type: 'Text', text: /MCP changed/ }))?.text).toMatch(/\+slack/)
  await band.unmount()

  // The next response is sent with the new tools, so the warning clears.
  await drain($.turn.step(STEP))
  await clock.advance(1 * MIN)
  const after = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await after.find({ type: 'Text', text: /MCP changed/ })).toBeUndefined()
  await after.unmount()
})

test('nothing is pinned under the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const lines: (string | undefined)[] = []
  engine(on, { onStatus: text => lines.push(text) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(5 * MIN)

  // Only the clearing call at start: the band carries the countdown.
  expect(lines).toEqual([undefined])
})

test('a model switch shows the line above the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  let model = 'claude-opus-5-5'
  engine(on, { model: () => model })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  model = 'claude-sonnet-5-5'
  await clock.advance(1 * MIN)

  const band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await band.find({ type: 'Text', text: /Switched to/ }))?.text).toMatch(/^Switched to Sonnet 5\.5 · cache rewrite/)
  await band.unmount()
})

test('while cooling the band suggests compacting, with a Compact button', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))

  // Warm: no suggestion yet.
  await clock.advance(30 * MIN)
  let band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await band.find({ type: 'Text', text: /Leaving\?/ })).toBeUndefined()
  await band.unmount()

  // Eight minutes left: compacting now is cheap.
  await clock.advance(22 * MIN)
  band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await band.find({ type: 'Text', text: /Leaving\?/ }))?.text).toMatch(/Leaving\? Compact first/)
  expect(await band.find({ type: 'Button', key: 'compact' })).toBeDefined()
  await band.unmount()
})

test('a compaction teaches its size and is not reported as a miss', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const toasts: string[] = []
  let compacted = 0
  engine(on, { onToast: text => toasts.push(text), onCompact: () => compacted++ })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(MIN)
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  expect(compacted).toBe(1)

  // The next request writes the shorter context.
  usage.cache_read_input_tokens = 0
  usage.cache_creation_input_tokens = 15_000
  await clock.advance(MIN)
  await drain($.turn.step(STEP))
  usage.cache_read_input_tokens = 113_000
  usage.cache_creation_input_tokens = 300

  expect(toasts.filter(t => /cold/.test(t)).length).toBe(0)
  const why = await $.command.run({ ...COMMAND, args: 'why' })
  expect(why.text).toMatch(/compaction/)
})

test('the usage a cold cache would add is learned from the spend', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  let u: Usage = { usd: 1, five: 40, week: 20 }
  engine(on, { usage: () => u })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))

  // Two dollars moved the 5-hour window four points: 2 points per dollar.
  u = { usd: 3, five: 44, week: 21 }
  await clock.advance(MIN)

  // While warm, the band says what a question has been costing.
  const warm = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await warm.find({ type: 'Text', text: /Cache/ }))?.text).toBe('Cache warm · 59 min · <0.1% per question ')
  await warm.unmount()

  // Once cold, a rewrite of 113k tokens on Opus 5.5 is ~$0.91, so ~1.8 points.
  await clock.advance(61 * MIN)
  const band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await band.find({ type: 'Text', text: /Cache/ }))?.text).toMatch(/Cache cold · next message rewrites 113k \(\+1\.8%\)/)
  await band.unmount()
})

test('with an API key, dollars stand in for usage', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on, { usage: () => ({ usd: 1.23 }) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(5 * MIN)

  await clock.advance(56 * MIN)
  const band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await band.find({ type: 'Text', text: /Cache/ }))?.text).toMatch(/Cache cold · next message rewrites 113k \(~\$0\.91\)/)
  await band.unmount()
})

const PROMPT = { text: 'next question', origin: { kind: 'composer' as const }, wait: false }

test('sending into a large cold cache asks first, once', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const asked: string[] = []
  const sent: string[] = []
  engine(on, { answer: q => (asked.push(q), 'Send anyway'), onSubmit: t => sent.push(t) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))

  // Warm: no question.
  await $.prompt.submit(PROMPT)
  expect(asked.length).toBe(0)

  await clock.advance(61 * MIN)
  await $.prompt.submit(PROMPT)
  expect(asked.length).toBe(1)
  expect(asked[0]).toMatch(/cache is cold: this message rewrites 113k tokens/)
  expect(sent.length).toBe(2)

  // Same cold spell: not asked again.
  await $.prompt.submit(PROMPT)
  expect(asked.length).toBe(1)
})

test('start fresh clears, then sends the message; a failed compact still sends it', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  let reply = 'Start fresh, then send'
  let cleared = 0
  const sent: string[] = []
  engine(on, { answer: () => reply, onClear: () => cleared++, onSubmit: t => sent.push(t) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(61 * MIN)
  const held = await $.prompt.submit(PROMPT)
  expect(held.drop).toMatch(/Starting fresh/)
  await clock.settle()
  expect(cleared).toBe(1)
  expect(sent).toEqual(['next question'])

  // The kit cannot run an argless compaction; the message must still go through.
  reply = 'Compact, then send'
  await drain($.turn.step(STEP))
  await clock.advance(61 * MIN)
  await $.prompt.submit(PROMPT)
  await clock.settle()
  expect(sent.length).toBe(2)
})

test('dismissing the question keeps the message unsent', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const filled: string[] = []
  const sent: string[] = []
  engine(on, {
    answer: () => {
      throw new Error('dismissed')
    },
    onFill: t => filled.push(t),
    onSubmit: t => sent.push(t),
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(61 * MIN)
  const result = await $.prompt.submit(PROMPT)

  expect(result.drop).toMatch(/back in the prompt/)
  expect(filled).toEqual(['next question'])
  expect(sent.length).toBe(0)
})

test('the question can be turned off', { options: { askWhenCold: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const sent: string[] = []
  engine(on, { onSubmit: t => sent.push(t) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await drain($.turn.step(STEP))
  await clock.advance(61 * MIN)
  await $.prompt.submit(PROMPT)
  expect(sent.length).toBe(1)
})

test('the countdown starts when the request starts, not when the answer ends', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  // A four-minute answer.
  engine(on, { answering: () => clock.sleep(4 * MIN) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const step = drain($.turn.step(STEP))
  await clock.advance(4 * MIN)
  await step

  const band = await $.ui.mount({ plugin: 'contextwatch', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect((await band.find({ type: 'Text', text: /^Cache/ }))?.text).toMatch(/Cache warm · 56 min/)
  await band.unmount()
})
