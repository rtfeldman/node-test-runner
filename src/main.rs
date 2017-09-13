extern crate clap;
extern crate ignore;

use clap::{App, Arg};
use std::path::PathBuf;

mod files;

fn main() {
    let version = "0.18.10";
    let args = App::new("elm-test")
        .version(version)
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
        .get_matches();

    // Validate CLI arguments
    let seed: Option<i32> = parse_or_die("--seed", args.value_of("seed"));
    let fuzz: Option<i32> = parse_or_die("--fuzz", args.value_of("fuzz"));
    let files: Vec<PathBuf> =
        get_test_file_paths(args.values_of("files").unwrap_or(Default::default()));
    let (path_to_elm_package, path_to_elm_make): (PathBuf, PathBuf) =
        binary_paths_from_compiler(args.value_of("compiler"));

    check_node_version();

    init_if_necessary();

    // Print the headline. Something like:
    //
    // elm-test 0.18.10
    // ----------------
    print_headline(version);

    println!("Value for seed: {}", seed.unwrap_or(9).to_string());
    println!("Value for fuzz: {}", fuzz.unwrap_or(9).to_string());
}

fn get_test_file_paths(values: clap::Values) -> Vec<PathBuf> {
    // It's important to globify all the arguments.
    // On Bash 4.x (or zsh), if you give it a glob as its last argument, Bash
    // translates that into a list of file paths. On bash 3.x it's just a string.
    // Ergo, globify all the arguments we receive.
    let make_sure = "Make sure you're running elm-test from your project's root directory, \
                     where its elm-package.json lives.\n\nTo generate some initial tests \
                     to get things going, run `elm test init`.";

    let root = files::find_nearest_elm_package_json(&mut std::env::current_dir().unwrap())
        .unwrap_or_else(|| panic!("Could not find elm-package.json.{}", make_sure))
        .with_file_name("");

    print!("root: {:?}", root);

    if values.len() == 0 {
        let results = walk_to_results(files::walk_globs(
            &root,
            // TODO there must be a better way to dereference this than .map(|&str| str) :P
            ["test?(s)/**/*.elm"].iter().map(|&str| str),
        ));

        // TODO use is_empty instead of len() == 0
        if results.len() == 0 {
            panic!(
                "No tests found for the file pattern \"{}\"\n\nMaybe try running `elm test`\
                 with no arguments?",
                values.map(str::to_string).collect::<Vec<_>>().join(" ")
            )
        } else {
            results
        }
    } else {
        let results = walk_to_results(files::walk_globs(&root, values));

        // TODO use is_empty instead of len() == 0
        if results.len() == 0 {
            panic!(
                "No tests found in the test/ (or tests/) directory.\n\nNOTE: {}",
                make_sure
            )
        } else {
            results
        }
    }
}

fn walk_to_results(walk: Result<ignore::Walk, ignore::Error>) -> Vec<PathBuf> {
    match walk {
        Ok(walked) => walked
            .map(|result| match result {
                Ok(entry) => entry.path().to_owned(),
                Err(err) => panic!("ERROR: {}", err),
            })
            .collect::<Vec<PathBuf>>(),
        Err(err) => panic!("ERROR: {}", err),
    }
}

// Return paths to the (elm-package, elm-make) binaries
fn binary_paths_from_compiler(arg: Option<&str>) -> (PathBuf, PathBuf) {
    match arg {
        Some(compiler) => {
            let valid_compiler_path = match PathBuf::from(compiler).canonicalize() {
                Ok(canonicalized) => if canonicalized.is_dir() {
                    panic!(
                        "The --compiler flag must be given a path to an elm-make executable,\
                         not a directory."
                    );
                } else {
                    canonicalized
                },

                Err(_) => {
                    panic!(
                        "The --compiler flag must be given a valid path to an elm-make executable."
                    );
                }
            };

            (
                valid_compiler_path.with_file_name("elm-package"),
                valid_compiler_path,
            )
        }
        None => (PathBuf::from("elm-package"), PathBuf::from("elm-make")),
    }
}

// Turn the given Option<&str> into an Option<i32>, or else die and report the invalid argument.
fn parse_or_die(arg_name: &str, val: Option<&str>) -> Option<i32> {
    val.map(|str| match str.parse::<i32>() {
        Ok(num) => num,
        Err(_) => panic!("Invalid {} value: {}", arg_name, str),
    })
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

fn check_node_version() {
    // TODO
}

fn init_if_necessary() {
    // TODO check if there are any test-dependencies in elm-package.json.
    // If there aren't, then offer to init.
}
