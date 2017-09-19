//ported from https://github.com/elm-lang/elm-compiler/blob/375ed593e43cf73886328091afbf8688a094cb3f/src/Reporting/Region.hs
use std::fmt;
use std::fmt::Display;

// REGION


pub struct Region {
    start: Position,
    end: Position,
}


pub struct Position {
    line: u64,
    column: u64,
}


pub fn merge(first: Region, second: Region) -> Region {
    Region {
        start: first.start,
        end: second.end,
    }
}


// TO STRING


impl Display for Region {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if &self.start.line == &self.end.line {
            write!(
                fmt,
                "on line {}, column {} to {}",
                &self.end.line,
                &self.start.column,
                &self.end.column
            )
        } else {
            write!(
                fmt,
                "between lines {} and {}",
                &self.start.line,
                &self.end.line
            )
        }
    }
}
