# Rudder Plugin Privacy Notice

Effective: July 23, 2026

Rudder is a local coding-agent plugin.
Its prompt hook stores coding-session context.
The user's current coding agent can then generate tests from intent and changes.

## Data stored

Rudder stores submitted prompt text and the coding-agent source.
It stores session and prompt identifiers, a Git repository identifier, and branch.
It also stores submission and reconciliation timestamps.
Repository identifiers can name a private remote's host, organization, and repo.

Records are stored in a local SQLite database at `~/.rudder/rudder.db`.
Setting `RUDDER_HOME` changes that location.

## Data use and sharing

Rudder uses stored records only as local context for its installed workflow.
The plugin does not transmit captured prompts or previous agent output to RudderCode.

Published builds can embed a PostHog project token.
When they do, Rudder sends pseudonymous operational telemetry.
Success events include the coding-agent source.
They also report whether previous agent output was available.
Success events exclude prompt text, previous output, and coding-session IDs.
They also exclude repositories, branches, and local paths.
Failure diagnostics may include the error type, message, and stack trace.
Those diagnostics can contain local file paths.

Telemetry uses a random installation identifier stored in `~/.rudder/identity.json`.
PostHog creates a person profile keyed by that random identifier.
Rudder does not attach a name, email address, or coding-session identifier.
Setting `RUDDER_HOME` changes that location.
Set `DO_NOT_TRACK=1` to disable telemetry.
Builds without an embedded project token remain telemetry-disabled by default.

Rudder does not sell telemetry or stored records.

The user's coding agent may process prompts when the user invokes Rudder.
That processing remains subject to the user's agent-provider agreement.
It also remains subject to the user's agent configuration.

## Retention and controls

Prompt records remain on the user's device until the user deletes them.
The bundled Rudder data controls can:

- show the configured storage path and prompt count;
- disable or enable future prompt capture; and
- delete all stored prompt records after explicit confirmation.

Users can also disable capture by setting `RUDDER_DISABLE_PROMPT_CAPTURE=1`.
Disabling capture does not delete existing records.

## Security

Rudder relies on operating-system permissions for local storage.
The SQLite database is not separately encrypted by Rudder.
Users should protect their device.
They should avoid capturing data they do not want stored locally.

## Contact

Questions or privacy requests can be filed through
<https://github.com/RudderCode/Rudder/issues>.
