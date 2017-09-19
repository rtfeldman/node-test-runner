// ported from https://github.com/elm-lang/elm-compiler/blob/375ed593e43cf73886328091afbf8688a094cb3f/src/Parse/Primitives.hs

// Using macros for lazy_static! for NO_ERROR

use elm_compiler::reporting::error::syntax;
use elm_compiler::reporting::error::syntax::{Theory, ParseError, Problem};

struct State<'a>
    { string : &'a str
    , indent : u64
    , row : u64
    , col : u64
    , context : syntax::ContextStack
    }

lazy_static! {
    // This will get initialized on first use, and then reused thereafter.
    // https://crates.io/crates/lazy_static
    static ref NO_ERROR:ParseError = ParseError::ParseError(0, 0, Problem::Theories(vec![], vec![]));
}

#[inline]
fn expect(row: u64, col: u64, ctx: syntax::ContextStack, theory: Theory) -> ParseError {
  ParseError::ParseError(row, col, Problem::Theories(ctx, vec![theory]))
}

enum Parser<FRun, A, B>
where FRun: FnMut(
    State,
    Fn(A, State, ParseError) -> B, Fn(ParseError) -> B,
    Fn(A, State, ParseError) -> B, Fn(ParseError) -> B
    ) -> B,
 {
  Parser
    { run : FRun ,
        // TODO figure out how not to have these useless things.
        a : Option<A>, b : Option<B> }
}



enum Parsed {
    Parsed
}

// RUN PARSER


fn run<R, A, B>(parser:Parser<R, A, B>, text: String) -> Result<A, Located<Error>>
  {runAt(1, 1, text)}


fn runAt<R, A , B>(parser:Parser<R, A, B>, sRow: u64, sCol: u64, string) -> Result<A, Located<Error>> {
  case _run parser (State array offset length 0 sRow sCol []) Ok Err Ok Err of
    Ok value _ _ ->
      Right value

    Err (ParseError row col problem) ->
      let
        pos = R.Position row col
        mkError overallRegion subRegion =
          Left (A.A overallRegion (E.Parse subRegion problem))
      in
        case problem of
          BadChar endCol ->
            mkError (R.Region pos (R.Position row endCol)) Nothing

          BadEscape width _ ->
            mkError (R.Region pos (R.Position row (col + width))) Nothing

          BadOp _ ((_, start) : _) ->
            mkError (R.Region start pos) (Just (R.Region pos pos))

          Theories ((_, start) : _) _ ->
            mkError (R.Region start pos) (Just (R.Region pos pos))

          _ ->
            mkError (R.Region pos pos) Nothing
}
