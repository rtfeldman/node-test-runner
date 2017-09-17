use std::env;
use std::io;
use std::fs;
use std::io::{Read, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Child, Stdio};
use std::collections::{HashSet, HashMap};
use read_elmi;
use files;
use cli;

#[derive(Debug)]
pub enum Abort {
    MissingElmJson,
    InvalidCwd(io::Error),
    ChDirError(io::Error),
    ReadTestFiles(io::Error),
    NoTestsFound(HashSet<PathBuf>),

    // Reading elm.json
    ReadElmJson(files::ElmJsonError),

    // Running elm make
    SpawnElmMake(io::Error),
    CompilationFailed(io::Error),

    // Running node
    SpawnNodeProcess(io::Error),

    // Running elm-interface-to-json
    ReadElmi(read_elmi::ReadElmiError),

    // CLI Flag errors
    InvalidCompilerFlag(String),
    CliArgParseError(cli::ParseError),
}
