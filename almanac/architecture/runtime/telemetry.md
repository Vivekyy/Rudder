---
title: "Telemetry Architecture"
summary: "Rudder telemetry is an opt-in PostHog client with a local anonymous installation identity, environment-controlled opt-out, and explicit shutdown."
topics: [architecture, runtime, telemetry, configuration]
sources:
  - id: telemetry
    type: file
    path: src/telemetry.ts
  - id: db-client
    type: file
    path: src/db/client.ts
  - id: package-json
    type: file
    path: package.json
---

Rudder telemetry is opt-in runtime infrastructure around `posthog-node`. The module creates a PostHog client only when `POSTHOG_API_KEY` is non-empty and `DO_NOT_TRACK` is not set to `1`; otherwise capture calls are no-ops through optional chaining [@telemetry]. When enabled, events use a stable anonymous installation id stored as `identity.json` under the same Rudder home directory used by [Local State](local-state) [@telemetry] [@db-client]. The package baseline includes `posthog-node` as a runtime dependency, and the telemetry module owns the client lifecycle through capture helpers and an async `shutdown()` function [@package-json] [@telemetry].

## Enablement Boundary

Telemetry enablement is decided before a client is constructed. The module reads `POSTHOG_API_KEY` into a constant, reads `POSTHOG_HOST` with the default `https://us.i.posthog.com`, and exposes `telemetryDisabled()` as the `DO_NOT_TRACK === '1'` check [@telemetry]. The internal `client()` function returns `null` when the API key is empty or telemetry is disabled, so `capture()` and `captureException()` can safely call it without requiring callers to branch on configuration [@telemetry].

When a client is created, it is cached in `_client` and configured with the selected host, `flushAt: 1`, `flushInterval: 0`, and exception autocapture enabled [@telemetry]. The flush settings fit short-lived CLI invocations because each event is sent immediately instead of waiting for a larger batch [@telemetry].

## Anonymous Identity

Telemetry does not use a user account identity. `distinctId()` lazily loads or creates a stable anonymous id and caches it in `_distinctId` [@telemetry]. `loadDistinctId()` looks for `identity.json` under `rudderHome()`, parses the file, and reuses `obj.id` when it is a non-empty string [@telemetry]. If the file is missing, malformed, or unusable, the function generates a UUID with `randomUUID()` [@telemetry].

Persistence is best-effort. The loader creates the Rudder home directory and writes `{"id": "<uuid>"}` when it can, but write failures fall through and the generated id remains usable in memory for that process [@telemetry]. Because `rudderHome()` itself is controlled by `RUDDER_HOME` or defaults to `~/.rudder`, telemetry identity follows the same state-root override as the database [@db-client] [@telemetry].

## Capture And Shutdown

`capture(event, properties)` sends a PostHog event with the anonymous distinct id, event name, and optional properties only when `client()` returns a client [@telemetry]. `captureException(err, extra)` uses the same distinct id and passes optional extra properties to PostHog's exception capture API [@telemetry]. Both helpers are intentionally small, so product code can report events without knowing the API-key, opt-out, or identity-file rules.

`shutdown()` is the lifecycle close point. It awaits `_client.shutdown()` when a client exists and then clears the cached client reference [@telemetry]. Code that adds longer-running commands should preserve that explicit shutdown path so pending telemetry work is flushed before process exit. The exact environment-variable behavior is listed in [Environment Variables](../../reference/configuration/environment-variables).
