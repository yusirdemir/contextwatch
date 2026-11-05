import type { EngineInterface, On } from 'claude-code'

export async function registerCommand($: EngineInterface) {
  await $.command.register({ name: 'contextwatch', description: 'Shows prompt-cache and context figures.' })
}

export function answerCommand(on: On) {
  on('command.run', { command: 'contextwatch' }, () => {
    // TODO: `/contextwatch` prints the figures, `/contextwatch why` explains the last drop.
    return { text: 'contextwatch is set up; figures come in the next version.' }
  })
}
