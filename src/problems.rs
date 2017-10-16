use std::io;
use std::path::PathBuf;
use std::collections::{HashSet, HashMap};
use read_elmi;
use files;
use generate_elm;
use cli;
use exposed_tests;

#[derive(Debug)]
pub enum Problem {
    MissingElmJson,
    InvalidCwd(io::Error),
    ChDirError(io::Error),
    ReadTestFiles(io::Error),
    NoTestsFound(Vec<PathBuf>),
    UnexposedTests(HashMap<String, HashSet<String>>),
    NoExposedTests(bool),

    // Reading elm.json
    ReadElmJson(files::ElmJsonError),

    // Running elm make
    SpawnElmMake(io::Error),
    CompilationFailed(io::Error),

    // Running node
    SpawnNodeProcess(io::Error),

    // Problems from other modules
    ReadElmi(read_elmi::Problem),
    GenerateElm(generate_elm::Problem),
    Cli(cli::Problem),
    ExposedTest(PathBuf, exposed_tests::Problem),
}
