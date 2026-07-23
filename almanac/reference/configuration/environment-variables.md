---
title: "Environment Variables"
summary: "Rudder runtime configuration currently comes from environment variables covering local state, migration lookup, prompt capture, dashboard port selection, and telemetry."
topics: [reference, configuration, runtime, telemetry, prompt-capture]
sources:
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: prompt-control
    type: file
    path: src/prompt-control.ts
  - id: telemetry
    type: file
    path: src/telemetry.ts
---

Rudder currently reads environment variables for local state location, migration lookup, prompt-capture disablement, dashboard port selection, and telemetry configuration. `RUDDER_HOME`, `RUDDER_MIGRATIONS_PATH`, and `RUDDER_PORT` are read by the database client module, `RUDDER_DISABLE_PROMPT_CAPTURE` is read by prompt controls, and `POSTHOG_API_KEY`, `POSTHOG_HOST`, and `DO_NOT_TRACK` control the PostHog telemetry client and opt-out behavior [@db-client] [@prompt-control] [@telemetry]. This reference lists the exact parsing and defaults used by those helpers; the surrounding runtime architecture is covered by [Local State](../../architecture/runtime/local-state), [Prompt Branch Store](../../architecture/runtime/prompt-branch-store), and [Telemetry](../../architecture/runtime/telemetry).

## Variables

| Variable | Read By | Accepted Value | Default Or Disabled Behavior |
| --- | --- | --- | --- |
| `RUDDER_HOME` | `rudderHome()` | Any non-empty string path. | Empty or unset values fall back to `join(homedir(), '.rudder')` because the helper uses `process.env.RUDDER_HOME || ...` [@db-client]. |
| `RUDDER_MIGRATIONS_PATH` | `migrationsFolder()` inside `openDb()` | Any string path, including an empty string. | Only `null` or `undefined` fall back to the repository `drizzle/` directory because the helper uses nullish coalescing [@db-client]. |
| `RUDDER_DISABLE_PROMPT_CAPTURE` | `promptCaptureDisabled()` | Exactly `1` disables prompt capture. | Any other value, including unset, does not disable capture by environment; the preference marker can still disable capture [@prompt-control]. |
| `RUDDER_PORT` | `rudderPort()` | A value that `Number()` converts to an integer greater than `0` and less than `65536`. | Invalid, unset, fractional, zero, negative, or out-of-range values return `41789` [@db-client]. |
| `POSTHOG_API_KEY` | Telemetry module constant | Any non-empty string. | Empty or unset values disable client creation because `client()` returns `null` without an API key [@telemetry]. |
| `POSTHOG_HOST` | Telemetry module constant | Any non-empty string, passed to the PostHog client as `host`. | Empty or unset values use `https://us.i.posthog.com` [@telemetry]. |
| `DO_NOT_TRACK` | `telemetryDisabled()` | Exactly `1` disables telemetry. | Any other value, including unset, does not disable telemetry by itself [@telemetry]. |

## Read Timing

`RUDDER_HOME` is read each time `rudderHome()` runs, `RUDDER_MIGRATIONS_PATH` is read when `openDb()` applies migrations, and `RUDDER_PORT` is read each time `rudderPort()` runs [@db-client]. `promptCaptureDisabled()` reads `RUDDER_DISABLE_PROMPT_CAPTURE` from the environment object passed to it, defaulting to `process.env` [@prompt-control]. By contrast, `POSTHOG_API_KEY` and `POSTHOG_HOST` are assigned to module-level constants when `src/telemetry.ts` is evaluated [@telemetry]. `telemetryDisabled()` defaults to `process.env` but also accepts an explicit environment object, which makes the `DO_NOT_TRACK` check callable against injected values [@telemetry].

## State Paths

When `RUDDER_HOME` is unset, the runtime state root is `~/.rudder`; when it is set to a non-empty value, that value becomes the state root [@db-client]. The SQLite database path is always `<rudderHome()>/rudder.db`, and the prompt-capture preference marker is `<rudderHome()>/prompt-capture-disabled` [@db-client] [@prompt-control]. Telemetry identity uses the same state root and stores the anonymous id at `<rudderHome()>/identity.json` [@telemetry]. Developers using [Use Prompt Capture](../../guides/runtime/use-prompt-capture) should set `RUDDER_HOME` before opening the database when they need isolated local state.

## Prompt Capture Disablement

Prompt capture is disabled when `RUDDER_DISABLE_PROMPT_CAPTURE === '1'` or when the preference marker exists [@prompt-control]. `setPromptCaptureEnabled(false)` creates the marker, and `setPromptCaptureEnabled(true)` removes it, but removing the marker does not override the environment variable [@prompt-control].

## Telemetry Disablement

Telemetry requires both an API key and an enabled client path. The internal client factory returns `null` when `POSTHOG_API_KEY` is empty or `telemetryDisabled()` returns true [@telemetry]. Because `telemetryDisabled()` checks only `DO_NOT_TRACK === '1'`, values such as `true`, `yes`, `0`, or an empty string do not disable telemetry through that helper [@telemetry].
