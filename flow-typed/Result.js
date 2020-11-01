// @flow

// We can’t use /*:: type Result<Error, Value> = ... */ because of:
// https://github.com/prettier/prettier/issues/2597
//
// Because of the type arguments we can’t use the regular trick of making a type
// annotation instead and then use `typeof Result`. The workaround is to define
// `Result` globally – this file is not included during runtime.
//
// This also lets us use `Result` in several files without having to define it
// multiple times or figure out some way to import types.
//
// If you wonder why we use a weird mix of “real” syntax and comment syntax here
// – it’s because of Prettier again. If you “uncomment” the `<Error, Value>`
// part, Prettier adds `/*::` and `*/` back.
type Result/*:: <Error, Value> */ =
  | { tag: 'Ok', value: Value }
  | { tag: 'Error', error: Error };
