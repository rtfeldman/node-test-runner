// Ported from https://github.com/elm-lang/elm-compiler/blob/master/src/Parse/Module.hs

use std::fs::File;
use std::io::{BufReader, BufRead};
use io;
use std::path::{Path, PathBuf};
use std::collections::HashSet;

#[derive(Debug)]
pub enum Problem {
    UnexposedTests(String, HashSet<String>),
    MissingModuleDeclaration(PathBuf),
    OpenFileToReadExports(PathBuf, io::Error),
    ReadingFileForExports(PathBuf, io::Error),
    ParseError(PathBuf),
}
