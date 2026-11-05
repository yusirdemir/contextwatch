import { expect, test } from 'claude-code/testing'

test('the command answers', async ($, on) => {
  on('command.register', () => ({ value: { command: 'contextwatch' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ran = await $.command.run({
    command: 'contextwatch',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(ran.text).toMatch(/contextwatch/)
})
