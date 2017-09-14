extern crate clap;

use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::collections::HashSet;

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
    NoTestsFound(Vec<String>),
    // CLI Flag errors
    InvalidCompilerFlag(String),
    CliArgParseError(cli::ParseError),
}

const MAKE_SURE: &str = "Make sure you're running elm-test from your project's root directory, \
                         where its elm.json file lives.\n\nTo generate some initial tests \
                         to get things going, run `elm test init`.";

fn report_error(error: Abort) {
    let message = match error {
        Abort::MissingElmJson => format!(
            "elm-test could not find an elm.json file in this directory \
             or any parent directories.\n{}",
            MAKE_SURE
        ),
        Abort::InvalidCwd(_) => String::from(
            "elm-test was run from an invalid directory. \
             Maybe the current directory has been deleted?",
        ),
        Abort::ChDirError(_) => String::from(
            "elm-test was unable to change the current working directory.",
        ),
        Abort::ReadTestFiles(_) => {
            String::from("elm-test was unable to read the requested .elm files.")
        }
        Abort::NoTestsFound(filenames) => if filenames.len() == 0 {
            format!(
                "No tests found in the test/ (or tests/) directory.\n\nNOTE: {}",
                MAKE_SURE,
            )
        } else {
            format!(
                "No tests found for the file pattern \"{}\"\n\nMaybe try running `elm test`\
                 with no arguments?",
                filenames.join(" ")
            )
        },
        Abort::InvalidCompilerFlag(path_to_elm_make) => format!(
            "The --compiler flag must be given a valid path to an elm-make executable,\
             which this was not: {}",
            path_to_elm_make
        ),
        Abort::CliArgParseError(cli::ParseError::InvalidInteger(arg, flag_name)) => format!(
            "{} is not a valid value for argument for the {} flag",
            arg,
            flag_name
        ),
    };

    eprintln!("Error: {}", message);
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
    let args = cli::parse_args();
    let seed: Option<i32> =
        cli::parse_int_arg("--seed", args.value_of("seed")).map_err(Abort::CliArgParseError)?;
    let fuzz: Option<i32> =
        cli::parse_int_arg("--fuzz", args.value_of("fuzz")).map_err(Abort::CliArgParseError)?;
    let file_paths = args.values_of("files").unwrap_or(Default::default());
    let files: HashSet<PathBuf> = gather_test_files(file_paths).map_err(Abort::ReadTestFiles)?;

    // If we found no test files to run, error out.
    if files.is_empty() {
        // TODO figure out a way to avoid doing this code duplicationn
        let file_paths = args.values_of("files").unwrap_or(Default::default());

        return Err(Abort::NoTestsFound(
            file_paths.map(str::to_string).collect::<Vec<_>>(),
        ));
    }

    let (path_to_elm_package, path_to_elm_make): (PathBuf, PathBuf) =
        binary_paths_from_compiler(args.value_of("compiler"))?;

    // Print the headline. Something like:
    //
    // elm-test 0.18.10
    // ----------------
    print_headline();

    Ok(())
}

// Default to searching the tests/ directory for tests.
const DEFAULT_TEST_FILES_ARGUMENT: &str = "tests";

fn gather_test_files(values: clap::Values) -> io::Result<HashSet<PathBuf>> {
    let results = &mut HashSet::new();

    // It's okay if the user didn't specify any files to run; fall back on the default choice.
    if values.len() == 0 {
        files::gather_all(
            results,
            [DEFAULT_TEST_FILES_ARGUMENT]
                .iter()
                .map(|&str| Path::new(str).to_path_buf()),
        )?;
    } else {
        files::gather_all(results, values.map(|value| Path::new(value).to_path_buf()))?;
    }

    Ok(results.clone())
}

// Return paths to the (elm-package, elm-make) binaries
fn binary_paths_from_compiler(compiler_flag: Option<&str>) -> Result<(PathBuf, PathBuf), Abort> {
    match compiler_flag {
        Some(str) => match PathBuf::from(str).canonicalize() {
            Ok(path_to_elm_make) => if path_to_elm_make.is_dir() {
                Err(Abort::InvalidCompilerFlag(String::from(str)))
            } else {
                Ok((
                    path_to_elm_make.with_file_name("elm-package"),
                    path_to_elm_make,
                ))
            },

            Err(_) => Err(Abort::InvalidCompilerFlag(String::from(str))),
        },
        None => Ok((PathBuf::from("elm-package"), PathBuf::from("elm-make"))),
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
