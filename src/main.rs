extern crate clap;
extern crate num_cpus;

use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::collections::{HashSet, HashMap};
use problems::Problem;

mod files;
mod cli;
mod read_elmi;
mod error_messages;
mod problems;
mod exposed_tests;

fn main() {
    run().unwrap_or_else(report_problem);
}

fn report_problem(problem: Problem) {
    // TODO this should be eprintln! once I upgrade the version of Rust I'm using.
    println!("Error: {}", error_messages::report(problem));

    std::process::exit(1);
}

fn run() -> Result<(), Problem> {
    // Find the nearest ancestor elm.json and change to that directory.
    // This way, you can run elm-test from any child directory and have it do the right thing.
    let root = files::find_nearest_elm_json(&mut env::current_dir().map_err(Problem::InvalidCwd)?)
        .ok_or(Problem::MissingElmJson)?
        .with_file_name("");

    env::set_current_dir(&root).map_err(Problem::ChDirError)?;

    // If there are no test-dependencies in elm.json, offer to init.
    init_if_necessary();

    // Parse and validate CLI arguments
    let args = cli::parse_args().map_err(Problem::Cli)?;
    let test_files = match gather_test_files(&args.file_paths).map_err(
        Problem::ReadTestFiles,
    )? {
        Some(valid_files) => valid_files,

        None => {
            return Err(Problem::NoTestsFound(args.file_paths));
        }
    };

    let path_to_elm_binary: PathBuf = cli::elm_binary_path_from_compiler_flag(args.compiler)
        .map_err(Problem::Cli)?;

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
        .map_err(Problem::SpawnElmMake)?;

    // TODO we can do these next two things in parallel!

    // TODO [Thread 1] Determine what values each module exposes.
    let mut exposed_values_by_file: HashMap<PathBuf, Option<HashSet<String>>> = HashMap::new();

    for test_file in test_files.clone() {
        match exposed_tests::read_exposed_values(&test_file) {
            Ok(exposed_values) => {
                exposed_values_by_file.insert(test_file, exposed_values);
            }
            Err(err) => {
                return Err(Problem::ExposedTest(test_file, err));
            }
        }
    }

    // TODO [Thread 2] Determine what our valid module names are.
    let source_dirs = files::read_source_dirs(root.as_path()).map_err(
        Problem::ReadElmJson,
    )?;
    let possible_module_names = files::possible_module_names(&test_files, &source_dirs);

    elm_make_process.wait_with_output().map_err(
        Problem::CompilationFailed,
    )?;

    let tests_by_module = read_elmi::read_test_interfaces(root.as_path(), &possible_module_names)
        .map_err(Problem::ReadElmi)?;

    // TODO [Thread 1 + Thread 2] Join threads; we now have the info we need to do elm make round 2.


    println!("exposed_values_by_file: {:?}", exposed_values_by_file);
    println!("tests_by_module: {:?}", tests_by_module);

    println!(
        "TODO: cross-reference tests_by_module (which contains file path) and
        exposed_values_by_file in order to figure out if there are any tess_by_module \
        which are not exposed in that module."
    );
    // for (module_name, (test_path, tests)) in tests_by_module {
    //     println!("* * * module: {:?} tests: {:?}", module_name, tests);
    // }

    // Spin up node processes.
    let mut node_processes: Vec<std::process::Child> = Vec::new();

    for _ in 0..num_cpus::get() {
        let node_process = Command::new("node")
            .arg("-p")
            .arg("'hi from node'")
            .spawn()
            .map_err(Problem::SpawnElmMake)?;

        node_processes.push(node_process);
    }

    for node_process in node_processes {
        node_process.wait_with_output().map_err(
            Problem::SpawnNodeProcess,
        )?;
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
        files::gather_all(results, values.clone().into_iter())?;
    }

    if results.is_empty() {
        Ok(None)
    } else {
        Ok(Some(results.clone()))
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

fn init_if_necessary() {
    // TODO check if there are any test-dependencies in elm.json.
    // If there aren't, then offer to init.
}
