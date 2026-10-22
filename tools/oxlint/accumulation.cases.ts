import { Array } from "effect";
import type { Case } from "./conventions.cases";

const examples = [
  {
    invalid:
      'import { Array } from "effect"; export const x = Array.reduce(values, [], (acc, value) => [...acc, value]);',
    valid: 'import { Array } from "effect"; export const x = Array.map((value) => value)(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => [value, ...acc])(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.flatMap((value) => [value])(values);',
  },
  {
    invalid:
      'import { reduce as fold } from "effect/Array"; const alias = fold; export const x = alias([], (acc, value) => [...acc, value])(values);',
    valid:
      'import { reduce as fold } from "effect/Array"; export const x = fold(0, (total, value) => total + value)(values);',
  },
  {
    invalid:
      'import * as E from "effect"; export const x = E.Array["reduce"]([], (acc, value) => [...acc, value])(values);',
    valid:
      'import * as E from "effect"; export const x = E.Array.reduce(0, (total, value) => total + value)(values);',
  },
  {
    invalid:
      'import { reduceRight } from "effect/Array"; export const x = reduceRight([], (acc, value) => [...acc, value])(values);',
    valid:
      'import { reduceRight } from "effect/Array"; export const x = reduceRight(0, (total, value) => total + value)(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; function grow(acc, value) { return [...acc, value]; } export const x = A.reduce([], grow)(values);',
    valid:
      'import { Array as A } from "effect"; function sum(total, value) { return total + value; } export const x = A.reduce(0, sum)(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; const grow = (acc, value) => [...acc, value]; const callback = grow; export const x = A.reduce([], callback)(values);',
    valid:
      'import { Array as A } from "effect"; export const x = (A: Client) => A.reduce([], (acc, value) => [...acc, value])(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => { const alias = acc; return [...alias, value]; })(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => { const clone = (acc) => [...acc]; return acc; })(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce(values, [], (acc, value) => A.append(acc, value));',
    valid:
      'import { Array as A, Chunk } from "effect"; export const x = A.reduce(Chunk.empty(), (acc, value) => Chunk.append(value)(acc))(values);',
  },
  {
    invalid:
      'import { reduce, append as grow } from "effect/Array"; export const x = reduce([], (acc, value) => grow(value)(acc))(values);',
    valid:
      'import { Array as A, HashSet } from "effect"; export const x = A.reduce(HashSet.empty(), (acc, value) => HashSet.add(value)(acc))(values);',
  },
  {
    invalid:
      'import { Array as A, pipe } from "effect"; export const x = A.reduce([], (acc, value) => pipe(acc, A.append(value)))(values);',
    valid:
      'import { Array as A, HashMap } from "effect"; export const x = A.reduce(HashMap.empty(), (acc, value) => HashMap.set(value.id, value)(acc))(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; import { pipe } from "effect/Function"; const grow = A.append(1); export const x = A.reduce([], (acc) => pipe(acc, grow))(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => [...value.items])(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.scan([], (acc, value) => [...acc, value])(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.scan(0, (total, value) => total + value)(values);',
  },
  {
    invalid:
      'import { Record as R } from "effect"; export const x = R.reduce({}, (acc, value, key) => ({ ...acc, [key]: value }))(values);',
    valid: 'import { Record as R } from "effect"; export const x = R.fromEntries(entries);',
  },
  {
    invalid:
      'import { Array as A, Record as R } from "effect"; export const x = A.reduce({}, (acc, value) => R.set(value.id, value)(acc))(values);',
    valid:
      'import { Array as A, HashMap } from "effect"; export const x = A.reduce(HashMap.empty(), (acc, value) => HashMap.set(acc, value.id, value))(values);',
  },
  {
    invalid:
      'import { Array as A, Record as R } from "effect"; const alias = R.set; export const x = A.reduce(values, {}, (acc, value) => alias(acc, value.id, value));',
    valid:
      'import { Array as A } from "effect"; import { set } from "another-library"; export const x = A.reduce({}, (acc, value) => set(acc, value.id, value))(values);',
  },
  {
    invalid:
      'import { Effect as E } from "effect"; export const x = E.reduce(values, () => [], (acc, value) => E.succeed([...acc, value]));',
    valid:
      'import { Effect as E, Chunk } from "effect"; export const x = E.reduce(values, () => Chunk.empty(), (acc, value) => E.succeed(Chunk.append(value)(acc)));',
  },
  {
    invalid:
      'import { Chunk, Array as A } from "effect"; export const x = Chunk.reduce([], (acc, value) => A.prepend(value)(acc))(values);',
    valid:
      'import { Array as A } from "effect"; const unrelated = { reduce: fn }; export const x = unrelated.reduce([], (acc, value) => [...acc, value]);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce({ items: [] }, ({ items }, value) => ({ items: [...items, value] }))(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.reduce({ total: 0 }, ({ total }, value) => ({ total: total + value }))(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce({ items: [] }, (acc, value) => ({ items: [...acc.items, value] }))(values);',
    valid:
      'import type { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => [...acc, value])(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => [...(acc as readonly number[]), value])(values);',
    valid:
      'import { reduce } from "another-library"; export const x = reduce([], (acc, value) => [...acc, value])(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc) => A.copy(acc))(values);',
    valid: 'import { Array as A } from "effect"; export const x = A.copy(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; function grow(acc, value) { return [...acc, value]; } const alias = grow; export const x = A.reduce([], alias)(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.reduce({ total: 0 }, (acc, value) => ({ ...acc, total: acc.total + value }))(values);',
  },
  {
    invalid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc, value) => A.appendAll([value])(acc))(values);',
    valid:
      'import { Array as A } from "effect"; export const x = A.reduce([], (acc) => A.fromIterable(acc))(values);',
  },
  {
    invalid:
      'import { Array as A, Record as R } from "effect"; export const x = A.reduce({}, (acc, value) => R.union({[value.id]: value})(acc))(values);',
    valid:
      'import { Array as A, pipe } from "effect"; export const x = A.reduce([], (acc) => pipe(acc, () => [], A.append(1)))(values);',
  },
];

export const accumulationCases: readonly Case[] = Array.map(examples, (entry) => ({
  ...entry,
  rule: "no-copying-accumulator",
  plugin: "strict-effect",
}));
