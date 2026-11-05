# Security Policy

## Supported versions

Only the latest release receives security fixes.

## What contextwatch accesses

contextwatch reads token counts and model names from Claude Code's own `turn.step` events, the session cost total and active model from `$.session`, and tool names from `$.tool.list()`. It does not read message text, does not write files, and makes no network requests. If you find it doing otherwise, treat that as a security issue.

## Reporting a vulnerability

Do not open a public issue. Report it privately through [GitHub security advisories](https://github.com/yusirdemir/contextwatch/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. You will get an acknowledgement within seven days and a fix or a decision within thirty days. Reporters are credited in the release notes unless they ask not to be.
