# Verification

The words below name the ways this package's work is verified. Use them in
docs, comments, commit messages, and agent reports. The glossary is a copy of
the owner's toolbox rule, refreshed by `bb verification-index` there; do not
edit it here.

Report a run by its term in bold with its emoji, then its duration and load in
code font, then its outcome: "Ran the **test suite 📦** (`1 s; CPU`) ✅
pass." Add ⚠️ limits when a pass proves less than its name suggests. Its
only verification script is `npm test`, which reports in Node's test runner
format and prints no `status=` line.

## Glossary

<!-- verification-index: the toolbox Verification rule is the source; `bb verification-index` copies this block -->
| Term | | Meaning | Avoid |
|---|---|---|---|
| **Check** | 🧪 | The smallest verification that runs and reports alone: an artifact compared with stated expectations by a fixed procedure, not by judgment, ending in a verdict. | test (for the runnable unit as a whole), probe |
| **Contract check** | 🧪 | A check whose expectation is a recorded exact value, such as a list of exports or required text, which changes only on purpose; it ends in a verdict. | pin (for a check; pin means fixing an input to an exact value), snapshot test, invariant (a rule that never changes) |
| **Kit check** | 🧰 | A check whose artifact is what a stage or action needs, such as tools, permissions, credentials, or settled earlier records; it ends in a verdict, and when it fails, the work that needed it is blocked. | preflight, capability probe, sanity check |
| **Assertion** |  | One expectation inside a check, never reported alone. | check (for a single expectation) |
| **Suite** | 📦 | A named set of different checks run together, ending in one verdict. | validation, full verification, unit gate |
| **Survey** | 🗺️ | One check or measurement run across a whole space, such as every combination of settings or every member of a group, ending in a table over that space, and in a verdict when each cell has an expectation. | sweep, census, matrix (as a kind) |
| **Measurement** | 🔬 | A workload run against an artifact, ending in numbers with their spread and no verdict of its own. | benchmark (as a kind), perf check |
| **Review** | 👀 | One reviewer's judgment of a plan or change against a brief, ending in findings and a verdict. |  |
| **Audit** | 🧭 | A look at a standing state against its own rules, ending in drift findings and no verdict. | audit (for a check that has a verdict), scan |
| **Panel** | 👥 | Several reviewers judging the same revision against one brief, ending in one verdict that passes only when every review passes. |  |
| **Gate** | 🚧 | A rule that lets a stage proceed only when what it holds passes; a measurement it holds passes when its numbers meet the gate's threshold; it ends in a verdict. | gate (for anything that blocks nothing) |
| **Keeper** | 🔑 | Who decides at a gate: a script, an outside service, a panel, or the owner. |  |
| **Verdict** |  | The one-word outcome of a run whose kind ends in one: pass, fail, unproven, or blocked, with a reason when it is not a pass; a run of several parts takes the first of fail, blocked, unproven, and pass that any part has. | status (for the outcome itself) |
| **Pass** | ✅ | Every expectation held. | ok, green |
| **Fail** | ❌ | At least one expectation broke. | miss, mismatch, red |
| **Unproven** | ❔ | The run ended, but its evidence cannot decide. | stale (for old evidence; say unproven, reason stale), inconclusive |
| **Blocked** | ⛔ | The run could not start or finish. | error (as a verdict), refused |
| **Change request** |  | A fix a reviewer requires before the revision can pass; a review with one fails. | named changes, ship with changes, blocker (for a required fix) |
| **Suggestion** |  | An optional improvement a reviewer offers, which leaves the verdict unchanged. | nit (as a requirement) |
| **Proof** | 📎 | Evidence about the artifact that a reader can inspect. |  |
| **Receipt** | 🧾 | The record of one run: what ran, on which revision, when, and its outcome. | receipt (for a product's own results) |
| **Limits** | ⚠️ | What a pass does not prove, stated with the outcome. |  |
| **Depth** |  | How far a run goes into each behavior: shallow or thorough. | smoke |
| **Coverage** |  | How much of the possible cases a run reaches: targeted, sampled, or exhaustive. | complete (unless exhaustive) |
| **Duration** |  | How long a run takes: measured, a cap, or unmeasured. | about, ≈, "a bit", "a while" |
| **Load** |  | What a run uses up: `CPU`, `disk` (churn of many small files), `network`, `browser`, `quota` (a metered allowance), `exclusive` (a resource only one run may hold), or `attention` (the owner's eyes or machine). |  |
| **Stage** |  | A step where verification can happen: in a change's life, plan, edit loop, checkpoint, pre-merge, pre-publish, publish, post-publish, or upkeep; outside a change, before a data operation or a risky action. |  |
<!-- /verification-index -->

## In this package

| Name | Kind | Stage | Duration and load | Limits |
|---|---|---|---|---|
| `npm test` | **Suite 📦** | edit loop, pre-publish | `1 s; CPU` | Offline: `fetch` is a stub and Kody storage is in-memory SQLite, so it proves no live behavior of Parallel or Kody. |
| Live checks (`AGENTS.md`) | **Suite 📦** of shallow checks | post-publish | calls `≤ 75 s`, then `research-get` polls 30 s apart until the `lite` run is done, or stops at `action_required`, an error, or an unknown status, as `AGENTS.md` lists; `network + quota` ($0.007, 11 mills) | One of each paid call, the two refusals, and the budget count; the agent compares each result with the expectations listed there. `counted` can differ when another caller makes a paid call at the same time. |

A budget error on the first paid call (`search`) means today's remaining
budget cannot cover that call: the run is ⛔ blocked, not failed.

The daily budget, the processor cap, input errors, and `research-get` status
checks are the product's runtime behavior, not verification runs, even where
their names say "check".
