[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/slyfunds-commits/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/slyfunds-commits/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# csv-reader-speed — round 2

A fast CSV reader that reproduces csv-reader 1.0.0's parse exactly, built for
make.fun's csv-reader-speed-01-run-20261121 bounty. It is a second, faster
attempt: the first round was about 1.7x the baseline, and this one pushes the
same exact output through a cheaper path.

## Idea

Most of the work is handed to the engine's native string operations instead of
walking characters one by one in JavaScript:

- The whole input is split on newlines once, so every record starts from a
  physical line that is already in hand.
- A line with no quotes and no stray carriage returns is a complete record:
  its fields are just the comma split, with no per-field work at all.
- Any other line is split on commas once, and the pieces are reassembled.
  Pieces that do not open a quoted field are complete fields. Quoted fields
  are closed by jumping from quote to quote with `indexOf`, un-doubled only
  when a doubled quote is actually present, and junk after the closing quote
  is kept as it stands.
- A quoted field may run across lines; the newline inside it becomes a single
  line feed in the value, and a lone carriage return inside quotes becomes a
  line feed too and counts as a line break for error positions.

## Exactness

The output is byte-identical to csv-reader 1.0.0 on the practice set, on
hand-written edge cases (quoted fields, embedded newlines, empty fields,
CRLF, header on and off, unterminated quotes, stray carriage returns), and on
thousands of generated fuzz inputs. Every error carries the record's start
line and row, in the same order the reference emits them.

## Layout

- `solve.js` — the parser. Exports `run(input)` returning
  `{ columns, rows, errors }`.
- `main.ts` — the driver. Reads `$MAKEFUN_INPUT_DIR/cases.json`, answers each
  case with `run`, writes `$MAKEFUN_OUTPUT_DIR/answers.json`.
- `package.json` — marks the package as an ES module so `solve.js` loads as
  one.

## Run it

```sh
node main.ts
```

`MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` set the input and output
folders; they default to `/input` and `/output`.
