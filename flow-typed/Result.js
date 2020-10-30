// @flow

type Result<Error, Value> =
  | { tag: 'Ok', value: Value }
  | { tag: 'Error', message: Error };
