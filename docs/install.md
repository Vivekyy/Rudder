# Install the Rudder Plugin

Rudder supports Claude Code and Codex from one plugin package.
The marketplace downloads `@ruddercode/rudder-plugin` from npm.

## Requirements

- Node.js 24 or newer
- npm available on `PATH`
- Git available on `PATH`
- A current Claude Code or Codex installation with plugin support

## Claude Code

Add the Rudder marketplace:

```text
/plugin marketplace add RudderCode/Rudder
```

Install Rudder:

```text
/plugin install rudder@rudder
```

Restart the session before invoking the installed skill.

## Codex

Add the Rudder marketplace:

```text
codex plugin marketplace add RudderCode/Rudder
```

Install Rudder:

```text
codex plugin add rudder@rudder
```

Start a new Codex session before invoking `$rudder`.
Review and trust the bundled prompt hook when Codex requests approval.

## Local development

Load the repository directly in Claude Code:

```text
claude --plugin-dir .
```

For Codex, add the repository as a local marketplace and install `rudder@rudder`.
The npm-backed marketplace requires a published package.
Use the plugin directory directly while testing an unpublished package.

## Prompt data

Rudder stores captured prompts in `~/.rudder/rudder.db` by default.
Set `RUDDER_HOME` to choose another local state directory.
Invoke `$rudder` and ask for data status, capture disablement, or deletion.

See the [privacy notice](privacy.md) for the complete data-handling description.
