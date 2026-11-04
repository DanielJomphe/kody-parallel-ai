# @danj/parallel

Agent-focused notes: imports, smoke tests, and edge cases.

## Imports

```ts
import main from 'kody:@danj/parallel'
```

## Smoke tests

Before publish (`guide:package_lifecycle`): session/tool-only lane —
`repoRunChecks` then `repoPublishSession`; git lane — local checks,
commit, push, then `packagePublishExternalPush` (server-side checks;
sessions refuse unpublished HEAD).
After publish, when Node ≥22 + CLI are available, prefer
`npx @kodycodes/cli execute --local` (`kody login` or headless
`KODY_API_TOKEN`; `guide:local_execute`). MCP-only hosts (no shell)
smoke with the matching post-publish surface or a static `kody:@…`
import from `execute` when that tool is on the session.
Do not assume every agent can run the CLI.

## Edge cases

Replace this stub before the first real publish.
