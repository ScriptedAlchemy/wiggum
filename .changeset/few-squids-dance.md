---
"@wiggum/cli": minor
---

Add a workspace runner to Wiggum CLI with independent project graph calculation, including project listing/graph commands, graph-based execution ordering, filtering, concurrency controls, and dry-run JSON planning output. Runner failure flows now include richer AI remediation context (`--autofix`) and optional prompt generation (`--ai-prompt`) for failed project runs, with prompt fallback support in non-interactive environments. Runner flag parsing now rejects empty `--project` filters and invalid `WIGGUM_RUNNER_PARALLEL` / concurrency values with clear errors, while supporting `--project` and `-p` (including `-p=<pattern>`) aliases and allowing `run`/`projects` options before command tokens. Agent chat mode now clearly guards against non-interactive terminals, agent serve flags support long/equal/short forms (`--flag value`, `--flag=value`, `-p/-H`, `-p=<port>`, `-H=<host>`) plus a `--host` alias with strict validation, and passthrough flag forwarding is documented for overlapping global/tool flags.

Follow-up hardening includes stricter verifier script input contracts (safe integer bounds, filesystem/env path option validation, duplicate project root detection), runtime-resolved verifier environment overrides for isolated fixture/CI checks, and refined `--autofix` parsing so agent command arguments are preserved while runner/projects global guardrails remain explicit.

Additional runner graph hardening now broadens inferred dependency detection across static imports, dynamic imports, `require` calls, and export-from specifiers (including scoped and unscoped subpath forms, plus commented import argument lists) while supporting `.mts`/`.cts` source scanning and deterministic capped-file traversal. The `--no-infer-imports` control is now fully covered across `run`, `projects graph`, and `projects list` outputs.

Inference scan behavior is now tunable via `WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES` (positive integer, default `400`) with explicit validation and mode-aware behavior across `run` and `projects` workflows.
