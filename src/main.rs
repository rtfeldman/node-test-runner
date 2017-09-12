extern crate clap;
extern crate term;
use clap::{App, Arg};
use std::path::{Path, PathBuf};

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
            Arg::with_name("TESTFILES")
                .help("Run TESTFILES, for example ")
                .multiple(true)
                .index(1),
        )
        .get_matches();

    // Print the headline. Something like:
    //
    // elm-test 0.18.10
    // ----------------
    print_headline(version);

    // Validate CLI arguments
    let seed: Option<i32> = parse_or_die("--seed", args.value_of("seed"));
    let fuzz: Option<i32> = parse_or_die("--fuzz", args.value_of("fuzz"));

    let (path_to_elm_package, path_to_elm_make) =
        binary_paths_from_compiler(args.value_of("compiler"));


    println!("Value for seed: {}", seed.unwrap_or(9).to_string());
    println!("Value for fuzz: {}", fuzz.unwrap_or(9).to_string());
    println!(
        "Value for TESTFILES: {}",
        args.values_of("TESTFILES")
            .map(|strings| strings.collect())
            .unwrap_or(vec![])
            .join(", ")
    );
}

// Return a path to the elm-package binary, and optionally one to elm-make as well.
fn binary_paths_from_compiler(arg: Option<&str>) -> (PathBuf, Option<PathBuf>) {
    return match arg {
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
                    panic!("The --compiler flag must be given a path to an elm-make executable.");
                }
            };

            (
                valid_compiler_path.with_file_name("elm-package"),
                Some(valid_compiler_path),
            )
        }
        None => (PathBuf::from("elm-package"), None),
    };
}

// Turn the given Option<&str> into an Option<i32>, or else die and report the invalid argument.
fn parse_or_die(arg_name: &str, val: Option<&str>) -> Option<i32> {
    return val.map(|str| match str.parse::<i32>() {
        Ok(num) => num,
        Err(_) => panic!("Invalid {} value: {}", arg_name, str),
    });
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
