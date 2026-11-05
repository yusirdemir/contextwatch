// The validator reads each $.state atom where it is used, so every file that
// reads or writes one declares it itself with the same plugin and key:
//
//   history: Snapshot[]  the session's responses, oldest first
//   now: number          the clock, ticked every second so countdowns redraw

export const HISTORY_LIMIT = 50
