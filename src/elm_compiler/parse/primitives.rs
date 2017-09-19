// ported from https://github.com/elm-lang/elm-compiler/blob/375ed593e43cf73886328091afbf8688a094cb3f/src/Parse/Primitives.hs

// Using macros for lazy_static! for NO_ERROR
#[macro_use]
extern crate lazy_static;

use elm_compiler::reporting::error::syntax;
use elm_compiler::reporting::error::syntax::{Theory, ParseError, Problem};

struct State
    { array : Vec<String>
    , offset : u64
    , length : u64
    , indent : u64
    , row : u64
    , col : u64
    , context : syntax::ContextStack
    }

lazy_static! {
    static ref NO_ERROR:ParseError = ParseError::ParseError(0, 0, Problem::Theories(vec![], vec![]));
}

#[inline]
fn expect(row: u64, col: u64, ctx: syntax::ContextStack, theory: Theory) -> ParseError {
  ParseError::ParseError(row, col, Problem::Theories(ctx, vec![theory]))
}
