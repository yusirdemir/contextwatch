# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Live cache countdown with read and cold costs in the status line, in whole minutes, updated every 30 seconds.
- A line above the prompt with the countdown and a **Details** button; it turns into an alert after a model switch or MCP change that will rewrite a warm cache.
- Cost of the next message with a warm and a cold cache, from Anthropic list prices.
- Cost of the first message after switching to each other model, and a warning in the band right after a switch.
- Per-model cache tracking: a model used earlier in the session that is still warm is priced as a partial hit.
- Confirmation before a model switch that would rewrite a warm cache for more than `confirmSwitchUsd` (default $0.50).
- Warning when MCP servers change while the cache is warm.
- Optional away reminder before the cache lapses (`awayReminder`, `awayReminderMinutes`).
- Detail pane with cost bars, a context growth chart with misses marked, hit rate and the session total.
- Notice when a response had to write the cache again.
- `/contextwatch` and `/contextwatch why` commands.
- TTL inference from the gap between responses.
- Contributor guide, code of conduct, security policy, issue and pull request templates.

## [0.0.1] - 2026-11-05

### Added

- Project skeleton.

[Unreleased]: https://github.com/yusirdemir/contextwatch/compare/3b92113...HEAD
[0.0.1]: https://github.com/yusirdemir/contextwatch/commit/3b92113
