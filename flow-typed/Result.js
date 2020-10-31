// @flow

type Result<Error, Value> =
  | { tag: 'Ok', value: Value }
  | { tag: 'Error', error: Error };
