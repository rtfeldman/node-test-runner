extern crate clap;
extern crate json;
extern crate num_cpus;

use std::env;
use std::io;
use std::fs;
use std::io::{Read, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Child, Stdio};
use std::collections::{HashSet, HashMap};
use json::JsonValue;

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
    NoTestsFound(HashSet<PathBuf>),

    // Reading elm.json
    ReadElmJson(files::ElmJsonError),

    // Running elm make
    SpawnElmMake(io::Error),
    CompilationFailed(io::Error),

    // Running node
    SpawnNodeProcess(io::Error),

    // Running elm-interface-to-json
    CurrentExe,
    SpawnElmiToJson(io::Error),

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
        Abort::CompilationFailed(_) => String::from("Test compilation failed."),
        Abort::SpawnNodeProcess(_) => String::from(
            "Unable to run `node`. \
            Do you have nodejs installed? You can get it from https://nodejs.org",
        ),
        Abort::SpawnElmiToJson(_) => String::from(
            "Unable to run `elm-interface-to-json`. \
            This binary should have been installed along with elm-test. \
            Maybe try reinstalling elm-test via npm?",
        ),
        Abort::CurrentExe => String::from(
            "Unable to detect current running process for `elm-test`. \
            Is elm-test running from a weird location, possibly involving symlinks?",
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
        Abort::ReadElmJson(files::ElmJsonError::OpenElmJson(_)) => {
            String::from(
                "Unable to open your project's elm.json file for reading. \
                Please make sure it exists and has the right permissions!",
            )
        }
        Abort::ReadElmJson(files::ElmJsonError::ReadElmJson(_)) => {
            String::from(
                "Unable to read your project's elm.json file. \
                Try opening it in a text editor to see if something's wrong with it, and \
                maybe consider trying to recreate it.",
            )
        }
        Abort::ReadElmJson(files::ElmJsonError::ParseElmJson(_)) => {
            String::from(
                "Your project's elm.json file appears to contain invalid JSON. \
                Try running it through a JSON validator and fixing any syntax errors you find!",
            )
        }
        Abort::ReadElmJson(files::ElmJsonError::InvalidSourceDirectories) => {
            String::from(
                "Your project's elm.json file does not have a valid source-directories array. \
                Make sure the `source-directories` field is presesnt, and is an array of strings!",
            )
        }
        Abort::ReadElmJson(files::ElmJsonError::InvalidSourceDirectory(source_dir)) => {
            format!(
                "Your project's elm.json file contains an invalid source-directory: {}",
                source_dir
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

    // TODO this should be eprintln! once I upgrade the version of Rust I'm using.
    println!("Error: {}", message);

    std::process::exit(1);
}

// TODO don't use this. Instead, do Haskell FFI to bring it in.
const ELMI_TO_JSON_BINARY_NAME: &str = "elm-interface-to-json";

fn run() -> Result<(), Abort> {
    // Verify that we're using a compatible version of node.js
    check_node_version();

    // Find the nearest ancestor elm.json and change to that directory.
    // This way, you can run elm-test from any child directory and have it do the right thing.
    let root = files::find_nearest_elm_json(&mut env::current_dir().map_err(Abort::InvalidCwd)?)
        .ok_or(Abort::MissingElmJson)?
        .with_file_name("");

    env::set_current_dir(&root).map_err(Abort::ChDirError)?;

    // If there are no test-dependencies in elm.json, offer to init.
    init_if_necessary();

    // Parse and validate CLI arguments
    let args = cli::parse_args().map_err(Abort::CliArgParseError)?;
    let test_files = match gather_test_files(&args.file_paths).map_err(
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

    // Start `elm make` running.
    let elm_make_process = Command::new(path_to_elm_binary)
        .arg("make")
        .arg("--yes")
        .arg("--output=/dev/null")
        .args(&test_files)
        .spawn()
        .map_err(Abort::SpawnElmMake)?;

    // Spin up node processes in a separate thread.
    let mut node_processes: Vec<std::process::Child> = Vec::new();

    for _ in 0..num_cpus::get() {
        let node_process = Command::new("node")
            .arg("-p")
            .arg("'hi from node'")
            .spawn()
            .map_err(Abort::SpawnElmMake)?;

        node_processes.push(node_process);
    }

    for node_process in node_processes {
        node_process.wait_with_output().map_err(
            Abort::SpawnNodeProcess,
        )?;
    }

    elm_make_process.wait_with_output().map_err(
        Abort::CompilationFailed,
    )?;

    let source_dirs = files::read_source_dirs(root.as_path()).map_err(
        Abort::ReadElmJson,
    )?;

    println!("source_dirs: {:?}", &source_dirs);

    read_test_interfaces(root.as_path(), &test_files, &source_dirs)?;

    Ok(())
}

fn read_test_interfaces(
    root: &Path,
    test_files: &HashSet<PathBuf>,
    source_dirs: &HashSet<PathBuf>,
) -> Result<Vec<String>, Abort> {
    // Get the path to the currently executing elm-test binary. This may be a symlink.
    let path_to_elm_test_binary: PathBuf = std::env::current_exe().or(Err(Abort::CurrentExe))?;

    // If it's a symlink, follow it. Then change the executable name to elm-interface-to-json.
    let path_to_elmi_to_json_binary: PathBuf = fs::read_link(&path_to_elm_test_binary)
        .unwrap_or(path_to_elm_test_binary)
        .with_file_name(ELMI_TO_JSON_BINARY_NAME);

    // Now that we've run `elm make` to compile the .elmi files, run elm-interface-to-json to
    // obtain the JSON of the interfaces.
    let mut elmi_to_json_process = Command::new(path_to_elmi_to_json_binary)
        .arg("--path")
        .arg(root.to_str().expect(""))
        .stdout(Stdio::piped())
        .spawn()
        .map_err(Abort::SpawnElmiToJson)?;

    let tests = print_json(&mut elmi_to_json_process, test_files, source_dirs);

    elmi_to_json_process.wait().map_err(
        Abort::CompilationFailed,
    )?;

    Ok(vec![])
}

fn print_json(
    program: &mut Child,
    test_files: &HashSet<PathBuf>,
    source_dirs: &HashSet<PathBuf>,
) -> io::Result<Vec<String>> {
    let possible_module_names = files::possible_module_names(test_files, source_dirs);

    match program.stdout.as_mut() {
        Some(out) => {
            let mut buf_reader = BufReader::new(out);
            let mut json_output = String::new();

            // Populate json_output with the stdout coming from elm-interface-to-json
            buf_reader.read_to_string(&mut json_output)?;

            match json::parse(&json_output) {
                Ok(JsonValue::Array(modules)) => {
                    // A map from module name to its set of exposed values of type Test.
                    let mut tests_by_module: HashMap<
                        String,
                        (PathBuf,
                         HashSet<String>),
                    > = HashMap::new();

                    for module in modules {
                        if let Some(module_name) = module["moduleName"].as_str() {
                            // Only proceed if we have a module name that fits with the files
                            // we requested via CLI args.
                            //
                            // For example, if we ran elm-test tests/Homepage.elm
                            // and our tests/ directory contains Homepage.elm and Sidebar.elm,
                            // only keep the module named "Homepage" because
                            // that's the only one we asked to run.
                            if let Some(test_path) = possible_module_names.get(module_name) {
                                // Extract the "types" field, which should be an Array.
                                if let &JsonValue::Array(ref types) = &module["types"] {
                                    // We'll populate this with every value we find of type Test.
                                    let mut top_level_tests: HashSet<String> = HashSet::new();

                                    for typ in types {
                                        if typ["signature"] == "Test.Test" {
                                            // This value is a Test. Add it to the set!
                                            if let &JsonValue::Object(ref obj) = typ {
                                                if let Some(&JsonValue::Short(ref name)) =
                                                    obj.get("name")
                                                {
                                                    top_level_tests.insert(
                                                        String::from(name.as_str()),
                                                    );
                                                }
                                            }
                                        }
                                    }

                                    // Must have at least 1 value of type Test
                                    // to get an entry in the map.
                                    if !top_level_tests.is_empty() {
                                        // Add this module to the map, along with its values.
                                        tests_by_module.insert(module_name.to_owned(), (
                                            test_path.clone(),
                                            top_level_tests,
                                        ));
                                    }
                                }
                            }
                        }

                    }

                    for (module_name, (test_path, tests)) in tests_by_module {
                        println!("* * * module: {:?} tests: {:?}", module_name, tests);
                        // filter_exposing(path: &Path, tests, module_name);
                    }


                    // TODO read from the json obj to filter and gather all the values of type Test

                    Ok(vec![])
                }
                _ => Ok(vec![]),
            }
        }
        None => Ok(vec![]),
    }
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
