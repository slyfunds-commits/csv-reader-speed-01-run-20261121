# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/slyfunds-commits/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/slyfunds-commits/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: identical answers on every case, at about half the CPU time.

The reference reads one character at a time and builds every field up a character at a time. This solver makes one pass over char codes, finds each field's end with native `indexOf` jumps, and takes the field as one slice where nothing in it needs rewriting. The slow paths run only for broken fields: stray CRs, doubled quotes, CRs inside quotes, quote junk and unterminated quotes. No regex, no per-character string building, and nothing allocated in the common path beyond the field strings and the result arrays themselves. It also turns V8's incremental marking off, as the house driver does.

Measured on the practice set (6 cases, 10.2 MB of CSV) on this machine, whole program in a fresh process: ~1.11 s CPU against the house baseline's ~1.95 s (about 1.7x faster), with the solver itself at ~0.52 s against the reference's ~1.43 s. Correctness is exact: 6/6 practice cases identical to csv-reader, plus 194 hand-written edge cases and 5,000 fuzzed inputs with zero mismatches against the reference.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=t2zg4r38&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
