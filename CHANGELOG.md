# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The countdown starts when a request starts, not when its answer ends; long answers no longer make it read a few minutes high.

### Added

- Live cache countdown with read and cold costs in the status line, in whole minutes, updated every 30 seconds.
- A line above the prompt with the countdown and a **Details** button; it turns into an alert after a model switch or MCP change that will rewrite a warm cache.
- 5-hour and weekly usage windows with reset times, in the pane, the band and the status line.
- What a cold cache would add to the 5-hour window, learned from the session's own spend and drawn as a faint segment on the bar; dollars with an API key.
- Cost of the first message after switching to each other model, and a warning in the band right after a switch.
- Per-model cache tracking: a model used earlier in the session that is still warm is priced as a partial hit.
- Question before sending into a large cold cache: send anyway, compact then send, or start fresh then send (`askWhenCold`).
- Next message in the band (`next message +0.7%`): worked out from the context, the cache and the message being typed (estimated tokens), not an average of past questions. The pane shows where the 5-hour window lands (`41% → 42%`) as a faint segment on the bar.
- The status line is gone; the band above the prompt carries the countdown.
- Band shows the cache state only; a cost appears once the cache is cold or a switch will rewrite it. Usage windows live in the pane.
- The pane's next-message card: the figure, where the 5-hour window lands, and a colour bar of what is read from the cache and what is written.
- Pane content centres and its bars fill the width in a wide pane.
- Confirmation before a model switch that would rewrite a warm cache for more than `confirmSwitchUsd` (default $0.50).
- Warning when MCP servers change while the cache is warm.
- Optional away reminder before the cache lapses (`awayReminder`, `awayReminderMinutes`).
- Compact suggestion while the cache is cooling, with a Compact button, priced from the session's own compactions once there is one.
- Writes after a compaction are no longer reported as misses; `/contextwatch why` names the compaction.
- Detail pane built around one figure (minutes left), the next message's cost now and if cold, one suggestion at a time, a model comparison that opens on request, and a one-line session summary.
- Notice when a response had to write the cache again.
- `/contextwatch` and `/contextwatch why` commands.
- TTL inference from the gap between responses.
- Contributor guide, code of conduct, security policy, issue and pull request templates.

## [0.0.1] - 2026-11-05

### Added

- Project skeleton.

[Unreleased]: https://github.com/yusirdemir/contextwatch/compare/3b92113...HEAD
[0.0.1]: https://github.com/yusirdemir/contextwatch/commit/3b92113
