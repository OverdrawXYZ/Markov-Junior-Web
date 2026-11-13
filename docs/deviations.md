# Deviations from the C# MarkovJunior

Behaviour that knowingly differs from the reference implementation
(github.com/mxgmn/MarkovJunior). Keep this list current.

## Intentional differences

| Area                                                    | C# original                  | This project                              | Why                                                                                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Random numbers                                          | `System.Random(seed)`        | mulberry32 (`packages/engine/src/rng.ts`) | Must be portable and deterministic in JS. **Consequence:** the same program + seed produces a different (but statistically equivalent) result than the C# version. Our golden tests pin our own outputs. |
| XML parsing                                             | `System.Xml.Linq`            | Small in-house parser (`xml-parser.ts`)   | `DOMParser` is not available in Web Workers. Supports elements, attributes, comments, PIs, entities; ignores text content.                                                                               |
| Unknown elements                                        | Silently ignored when nested | Reported as errors, with line numbers     | Silent drops make editor mistakes invisible.                                                                                                                                                             |
| Unknown attributes                                      | Ignored                      | Ignored, but reported as warnings         | Same reason.                                                                                                                                                                                             |
| `<union>` inside a non-root rule node                   | Silently ignored             | Error                                     | Same reason.                                                                                                                                                                                             |
| `<rule>` children **and** inline `in`/`out` on one node | Inline attributes ignored    | Error                                     | Ambiguous.                                                                                                                                                                                               |
| `comment` attribute                                     | Ignored                      | Preserved in the AST and round-tripped    | Used as a node label in the editor.                                                                                                                                                                      |

## Not implemented yet (rejected with a clear error)

- Rules loaded from images: `file`, `fin`, `fout`, `legend` (and `folder`).
- `<field>`, `<observe>`, `search`, `temperature` (roadmap phase 6).
- `path`, `map`, `convolution`, `convchain`, `wfc` nodes (roadmap phase 6).
- 3D grids and patterns, cube symmetries (roadmap phase 7).

## Faithfully reproduced quirks

These look surprising but match the original, so programs behave the same:

- A turn in which a branch finishes and hands control back to its parent counts as a step,
  even if nothing changed. A program that halts immediately still reports `stepCount = 1`.
- When a child branch of a `sequence` is exhausted on a turn where it was called directly, the
  parent re-enters it (reset) on its next turn before moving on.
- `all` nodes do not re-check matches before applying them within a turn; overlap is only
  prevented on cells the output actually writes (non-`*`).
- `prl` consumes one random number per match even when `p = 1`.
- The `changes` log grows for the whole run (it is what makes incremental matching work).
