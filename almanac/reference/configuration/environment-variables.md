---
title: "Environment Variables"
summary: "Rudder runtime configuration currently comes from five environment variables covering local state, dashboard port selection, and telemetry."
topics: [reference, configuration, runtime, telemetry]
sources:
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: telemetry
    type: file
    path: src/telemetry.ts
---

Rudder currently reads environment variables for three runtime areas: local state location, dashboard port selection, and telemetry configuration. `RUDDER_HOME` and `RUDDER_PORT` are read by the database client module's exported helpers [@db-client]. `POSTHOG_API_KEY`, `POSTHOG_HOST`, and `DO_NOT_TRACK` control the PostHog telemetry client and opt-out behavior [@telemetry]. This reference lists the exact parsing and defaults used by those helpers; the surrounding runtime architecture is covered by [Local State](../../architecture/runtime/local-state) and [Telemetry](../../architecture/runtime/telemetry).

## Variables

| Variable | Read By | Accepted Value | Default Or Disabled Behavior |
| --- | --- | --- | --- |
| `RUDDER_HOME` | `rudderHome()` | Any non-empty string path. | Empty or unset values fall back to `join(homedir(), '.rudder')` because the helper uses `process.env.RUDDER_HOME || ...` [@db-client]. |
| `RUDDER_PORT` | `rudderPort()` | A value that `Number()` converts to an integer greater than `0` and less than `65536`. | Invalid, unset, fractional, zero, negative, or out-of-range values return `41789` [@db-client]. |
| `POSTHOG_API_KEY` | Telemetry module constant | Any non-empty string. | Empty or unset values disable client creation because `client()` returns `null` without an API key [@telemetry]. |
| `POSTHOG_HOST` | Telemetry module constant | Any non-empty string, passed to the PostHog client as `host`. | Empty or unset values use `https://us.i.posthog.com` [@telemetry]. |
| `DO_NOT_TRACK` | `telemetryDisabled()` | Exactly `1` disables telemetry. | Any other value, including unset, does not disable telemetry by itself [@telemetry]. |

## Read Timing

`RUDDER_HOME` is read each time `rudderHome()` runs, and `RUDDER_PORT` is read each time `rudderPort()` runs [@db-client]. By contrast, `POSTHOG_API_KEY` and `POSTHOG_HOST` are assigned to module-level constants when `src/telemetry.ts` is evaluated [@telemetry]. `telemetryDisabled()` defaults to `process.env` but also accepts an explicit environment object, which makes the `DO_NOT_TRACK` check callable against injected values [@telemetry].

## State Paths

When `RUDDER_HOME` is unset, the runtime state root is `~/.rudder`; when it is set to a non-empty value, that value becomes the state root [@db-client]. The SQLite database path is always `<rudderHome()>/rudder.db` [@db-client]. Telemetry identity uses the same state root and stores the anonymous id at `<rudderHome()>/identity.json` [@telemetry]. Developers using the [session branch tracking guide](../../guides/runtime/use-session-branch-tracking) should set `RUDDER_HOME` before opening the database when they need isolated local state.

## Telemetry Disablement

Telemetry requires both an API key and an enabled client path. The internal client factory returns `null` when `POSTHOG_API_KEY` is empty or `telemetryDisabled()` returns true [@telemetry]. Because `telemetryDisabled()` checks only `DO_NOT_TRACK === '1'`, values such as `true`, `yes`, `0`, or an empty string do not disable telemetry through that helper [@telemetry].
