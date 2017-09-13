extern crate clap;

use clap::{App, Arg};
use std::env;
use std::io;
use std::num;
use std::path::{Path, PathBuf};
use std::collections::HashSet;

mod files;

const VERSION: &str = "0.18.10";

fn main() {
    run().unwrap_or_else(report_error);
}

enum Error {
    MissingElmJson,
    InvalidCwd(io::Error),
    ChDirError(io::Error),
    ReadTestFiles(io::Error),
    NoTestsFound(Vec<String>),
    // CLI Flag errors
    InvalidCompilerFlag(String),
    CliArgParseError(String, String, num::ParseIntError),
}

const MAKE_SURE: &str = "Make sure you're running elm-test from your project's root directory, \
                         where its elm.json file lives.\n\nTo generate some initial tests \
                         to get things going, run `elm test init`.";

fn report_error(error: Error) {
    let message = match error {
        Error::MissingElmJson => format!(
            "elm-test could not find an elm.json file in this directory \
             or any parent directories.\n{}",
            MAKE_SURE
        ),
        Error::InvalidCwd(_) => String::from(
            "elm-test was run from an invalid directory. \
             Maybe the current directory has been deleted?",
        ),
        Error::ChDirError(_) => String::from(
            "elm-test was unable to change the current working directory.",
        ),
        Error::ReadTestFiles(_) => {
            String::from("elm-test was unable to read the requested .elm files.")
        }
        Error::NoTestsFound(filenames) => if filenames.len() == 0 {
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
        Error::InvalidCompilerFlag(path_to_elm_make) => format!(
            "The --compiler flag must be given a valid path to an elm-make executable,\
             which this was not: {}",
            path_to_elm_make
        ),
        Error::CliArgParseError(arg, flag_name, _) => format!(
            "{} is not a valid value for argument for the {} flag",
            arg,
            flag_name
        ),
    };

    eprintln!("Error: {}", message);
    std::process::exit(1);
}

fn run() -> Result<(), Error> {
    // Verify that we're using a compatible version of node.js
    check_node_version();

    // Find the nearest ancestor elm.json and change to that directory.
    // This way, you can run elm-test from any child directory and have it do the right thing.
    let root = files::find_nearest_elm_json(&mut env::current_dir().map_err(Error::InvalidCwd)?)
        .ok_or(Error::MissingElmJson)?
        .with_file_name("");

    env::set_current_dir(root).map_err(Error::ChDirError)?;

    // If there are no test-dependencies in elm.json, offer to init.
    init_if_necessary();

    // Parse and validate CLI arguments
    let args = parse_cli_args();
    let seed: Option<i32> = parse_int_arg("--seed", args.value_of("seed"))?;
    let fuzz: Option<i32> = parse_int_arg("--fuzz", args.value_of("fuzz"))?;
    let file_paths = args.values_of("files").unwrap_or(Default::default());
    let files: HashSet<PathBuf> = gather_test_files(file_paths).map_err(Error::ReadTestFiles)?;

    // If we found no test files to run, error out.
    if files.is_empty() {
        // TODO figure out a way to avoid doing this code duplicationn
        let file_paths = args.values_of("files").unwrap_or(Default::default());

        return Err(Error::NoTestsFound(
            file_paths.map(str::to_string).collect::<Vec<_>>(),
        ));
    }

    let (path_to_elm_package, path_to_elm_make): (PathBuf, PathBuf) =
        binary_paths_from_compiler(args.value_of("compiler"))?;

    // Print the headline. Something like:
    //
    // elm-test 0.18.10
    // ----------------
    print_headline(VERSION);

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
fn binary_paths_from_compiler(compiler_flag: Option<&str>) -> Result<(PathBuf, PathBuf), Error> {
    match compiler_flag {
        Some(str) => match PathBuf::from(str).canonicalize() {
            Ok(path_to_elm_make) => if path_to_elm_make.is_dir() {
                Err(Error::InvalidCompilerFlag(String::from(str)))
            } else {
                Ok((
                    path_to_elm_make.with_file_name("elm-package"),
                    path_to_elm_make,
                ))
            },

            Err(_) => Err(Error::InvalidCompilerFlag(String::from(str))),
        },
        None => Ok((PathBuf::from("elm-package"), PathBuf::from("elm-make"))),
    }
}

// Turn the given Option<&str> into an Option<i32>, or else die and report the invalid argument.
fn parse_int_arg(flag_name: &str, val: Option<&str>) -> Result<Option<i32>, Error> {
    match val {
        None => Ok(None),
        Some(potential_num) => match potential_num.parse::<i32>() {
            Ok(num) => Ok(Some(num)),

            Err(err) => Err(Error::CliArgParseError(
                String::from(flag_name),
                String::from(potential_num),
                err,
            )),
        },
    }
}

// prints something like this:
//
// elm-test 0.18.10
// ----------------
fn print_headline(version: &str) {
    let headline = String::from("elm-test ") + version;
    let bar = "-".repeat(headline.len());

    println!("\n{}\n{}\n", headline, bar);
}

fn parse_cli_args<'a>() -> clap::ArgMatches<'a> {
    App::new("elm-test")
        .version(VERSION)
        .arg(
            Arg::with_name("seed")
                .short("s")
                .long("seed")
                .value_name("SEED")
                .help("Run with initial fuzzer seed")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("fuzz")
                .short("f")
                .long("fuzz")
                .value_name("FUZZ")
                .help("Run with each fuzz test performing this many iterations")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("compiler")
                .short("c")
                .long("compiler")
                .value_name("PATH_TO_COMPILER")
                .help("Run tests using this elm-make executable for the compiler")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("files")
                .help("Run TESTFILES, for example ")
                .multiple(true)
                .index(1),
        )
        .get_matches()
}

fn check_node_version() {
    // TODO
}

fn init_if_necessary() {
    // TODO check if there are any test-dependencies in elm.json.
    // If there aren't, then offer to init.
}
