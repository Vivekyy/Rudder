#!/usr/bin/env -S node
import { main } from '../src/cli.ts';

main(process.argv.slice(2)).catch((err) => {
  console.error(`rudder: ${(err as Error).message}`);
  process.exit(1);
});
