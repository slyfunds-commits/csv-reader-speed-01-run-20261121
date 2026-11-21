import { setFlagsFromString } from 'node:v8';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

setFlagsFromString('--no-incremental-marking');

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(inputDir + '/cases.json', 'utf8'));
const { run } = await import('./solve.js');

// Preallocate the answers array and fill it by index instead of pushing,
// so the result list is built in one allocation with no growth.
const answers = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  answers[i] = run(cases[i].input);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputDir + '/answers.json', JSON.stringify(answers));
