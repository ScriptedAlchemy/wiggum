---
"@wiggum/cli": minor
---

Add a workspace runner to Wiggum CLI with independent project graph calculation, including project listing/graph commands, graph-based execution ordering, filtering, concurrency controls, and dry-run JSON planning output. Runner failure flows now include richer AI remediation context (`--autofix`) and optional prompt generation (`--ai-prompt`) for failed project runs, with prompt fallback support in non-interactive environments. Agent chat mode now clearly guards against non-interactive terminals, agent serve flags support both `--flag value` and `--flag=value` forms with strict port validation, and passthrough flag forwarding is documented for overlapping global/tool flags.
