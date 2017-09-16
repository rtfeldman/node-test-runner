extern crate clap;

use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::io::Write;
use std::process::Command;

mod files;
mod cli;

fn main() {
    run().unwrap_or_else(report_error);
}

#[derive(Debug)]
enum Abort {
    MissingElmJson,
    InvalidCwd(io::Error),
    ChDirError(io::Error),
    ReadTestFiles(io::Error),
    SpawnElmMake(io::Error),
    NoTestsFound(HashSet<PathBuf>),
    // CLI Flag errors
    InvalidCompilerFlag(String),
    CliArgParseError(cli::ParseError),
}

const MAKE_SURE: &str = "Make sure you're running elm-test from your project's root directory, \
                         where its elm.json file lives.\n\nTo generate some initial tests \
                         to get things going, run `elm test init`.";

fn report_error(error: Abort) {
    let message = match error {
        Abort::MissingElmJson => {
            format!(
                "elm-test could not find an elm.json file in this directory \
             or any parent directories.\n{}",
                MAKE_SURE
            )
        }
        Abort::InvalidCwd(_) => String::from(
            "elm-test was run from an invalid directory. \
             Maybe the current directory has been deleted?",
        ),
        Abort::SpawnElmMake(_) => String::from(
            "Unable to execute `elm make`. Try using the --compiler flag to set the location of \
            the `elm` executable explicitly.",
        ),
        Abort::ChDirError(_) => String::from(
            "elm-test was unable to change the current working directory.",
        ),
        Abort::ReadTestFiles(_) => {
            String::from("elm-test was unable to read the requested .elm files.")
        }
        Abort::NoTestsFound(filenames) => {
            if filenames.is_empty() {
                format!(
                "No tests found in the test/ (or tests/) directory.\n\nNOTE: {}",
                MAKE_SURE,
            )
            } else {
                format!(
                    "No tests found for the file pattern \"{}\"\n\nMaybe try running `elm test`\
                 with no arguments?",
                    filenames
                        .iter()
                        .map(|path_buf: &PathBuf| {
                            path_buf.to_str().expect("<invalid file string>").to_owned()
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                )
            }
        }
        Abort::InvalidCompilerFlag(path_to_elm_binary) => {
            format!(
                "The --compiler flag must be given a valid path to an elm executable,\
             which this was not: {}",
                path_to_elm_binary
            )
        }
        Abort::CliArgParseError(cli::ParseError::InvalidInteger(arg, flag_name)) => {
            format!(
                "{} is not a valid value for argument for the {} flag",
                arg,
                flag_name
            )
        }
    };

    writeln!(&mut std::io::stderr(), "Error: {}", message);

    std::process::exit(1);
}

fn run() -> Result<(), Abort> {
    // Verify that we're using a compatible version of node.js
    check_node_version();

    // Find the nearest ancestor elm.json and change to that directory.
    // This way, you can run elm-test from any child directory and have it do the right thing.
    let root = files::find_nearest_elm_json(&mut env::current_dir().map_err(Abort::InvalidCwd)?)
        .ok_or(Abort::MissingElmJson)?
        .with_file_name("");

    env::set_current_dir(root).map_err(Abort::ChDirError)?;

    // If there are no test-dependencies in elm.json, offer to init.
    init_if_necessary();

    // Parse and validate CLI arguments
    let args = cli::parse_args().map_err(Abort::CliArgParseError)?;
    let files = match gather_test_files(&args.file_paths).map_err(
        Abort::ReadTestFiles,
    )? {
        Some(valid_files) => valid_files,

        None => {
            return Err(Abort::NoTestsFound(args.file_paths));
        }
    };

    let path_to_elm_binary: PathBuf = elm_binary_path_from_compiler_flag(args.compiler)?;

    // Print the headline. Something like:
    //
    // elm-test 0.18.10
    // ----------------
    print_headline();

    let mut elm_make_process = Command::new(path_to_elm_binary)
        .arg("make")
        .arg("--yes")
        .arg("--output=/dev/null")
        .args(files)
        .spawn()
        .map_err(Abort::SpawnElmMake)?;

    // Start `elm make` running.
    let mut node_processes: Vec<std::process::Child> = Vec::new();

    for num in 0..4 {
        let node_process = Command::new("node")
            .arg("-p")
            .arg("'hi from node'")
            .spawn()
            .map_err(Abort::SpawnElmMake)?;

        node_processes.push(node_process);
    }

    elm_make_process.wait();

    for node_process in node_processes {
        node_process.wait();
    }

    Ok(())
}

// Default to searching the tests/ directory for tests.
const DEFAULT_TEST_FILES_ARGUMENT: &str = "tests";

fn gather_test_files(values: &HashSet<PathBuf>) -> io::Result<Option<HashSet<PathBuf>>> {
    let results = &mut HashSet::new();

    // It's okay if the user didn't specify any files to run; fall back on the default choice.
    if values.is_empty() {
        files::gather_all(
            results,
            [DEFAULT_TEST_FILES_ARGUMENT].iter().map(|&str| {
                Path::new(str).to_path_buf()
            }),
        )?;
    } else {
        // TODO there is presumably a way to avoid this .clone() but I couldn't figure it out.
        files::gather_all(results, values.clone().into_iter())?;
    }

    if results.is_empty() {
        Ok(None)
    } else {
        Ok(Some(results.clone()))
    }
}

// Return the path to the elm binary
fn elm_binary_path_from_compiler_flag(compiler_flag: Option<String>) -> Result<PathBuf, Abort> {
    match compiler_flag {
        Some(string) => {
            match PathBuf::from(string.as_str()).canonicalize() {
                Ok(path_to_elm_binary) => {
                    if path_to_elm_binary.is_dir() {
                        Err(Abort::InvalidCompilerFlag(string))
                    } else {
                        Ok(path_to_elm_binary)
                    }
                }

                Err(_) => Err(Abort::InvalidCompilerFlag(string)),
            }
        }
        None => Ok(PathBuf::from("elm")),
    }
}

// prints something like this:
//
// elm-test 0.18.10
// ----------------
fn print_headline() {
    let headline = String::from("elm-test ") + cli::VERSION;
    let bar = "-".repeat(headline.len());

    println!("\n{}\n{}\n", headline, bar);
}

fn check_node_version() {
    // TODO
}

fn init_if_necessary() {
    // TODO check if there are any test-dependencies in elm.json.
    // If there aren't, then offer to init.
}
