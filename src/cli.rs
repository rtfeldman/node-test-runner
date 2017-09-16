extern crate clap;

use clap::{App, Arg};
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::iter::FromIterator;

// Use the version number in Cargo.toml
pub const VERSION: &'static str = env!("CARGO_PKG_VERSION");

#[derive(PartialEq, Debug)]
pub enum ParseError {
    InvalidInteger(String, String),
}

const ARG_SEED: &'static str = "seed";
const ARG_FUZZ: &'static str = "fuzz";
const ARG_COMPILER: &'static str = "compiler";
const FILES_OR_DIRECTORIES: &'static str = "FILES_OR_DIRECTORIES";

pub fn seed<'a>(args: &clap::ArgMatches<'a>) -> Result<Option<i32>, ParseError> {
    parse_int_arg(ARG_SEED, args)
}

pub fn fuzz<'a>(args: &clap::ArgMatches<'a>) -> Result<Option<i32>, ParseError> {
    parse_int_arg(ARG_FUZZ, args)
}

pub fn parse_args<'a>() -> Result<CliArgs, ParseError> {
    let matches = App::new("elm-test")
        .version(VERSION)
        .arg(
            Arg::with_name(ARG_SEED)
                .short("s")
                .long("seed")
                .value_name("INTEGER")
                .help("Use this for the initial fuzzer seed")
                .takes_value(true),
        )
        .arg(
            Arg::with_name(ARG_FUZZ)
                .short("f")
                .long("fuzz")
                .value_name("POSITIVE_INTEGER")
                .help("Have each fuzz test perform this many iterations")
                .takes_value(true),
        )
        .arg(
            Arg::with_name(ARG_COMPILER)
                .short("c")
                .long("compiler")
                .value_name("FILE_PATH")
                .help("Use this `elm` executable for `elm make`")
                .takes_value(true),
        )
        .arg(
            Arg::with_name(FILES_OR_DIRECTORIES)
                .help("Run all tests found in these files and directories")
                .multiple(true)
                .index(1),
        )
        .get_matches();

    let seed = parse_int_arg(ARG_SEED, &matches)?;
    let fuzz = parse_int_arg(ARG_FUZZ, &matches)?;
    let compiler = matches.value_of(ARG_COMPILER).map(String::from);
    let file_paths: HashSet<PathBuf> = HashSet::from_iter(
        matches
            .values_of(FILES_OR_DIRECTORIES)
            .unwrap_or(Default::default())
            .map(|value| (Path::new(value).to_path_buf())),
    );

    Ok(CliArgs {
        seed: seed,
        fuzz: fuzz,
        compiler: compiler,
        file_paths: file_paths,
    })
}

pub struct CliArgs {
    pub seed: Option<i32>,
    pub fuzz: Option<i32>,
    pub compiler: Option<String>,
    pub file_paths: HashSet<PathBuf>,
}


// Turn the given Option<&str> into an Option<i32>, or else die and report the invalid argument.
pub fn parse_int_arg<'a>(
    flag_name: &str,
    args: &clap::ArgMatches<'a>,
) -> Result<Option<i32>, ParseError> {
    match args.value_of("--".to_owned() + flag_name) {
        None => Ok(None),
        Some(potential_num) => {
            match potential_num.parse::<i32>() {
                Ok(num) => Ok(Some(num)),

                Err(_) => Err(ParseError::InvalidInteger(
                    String::from(flag_name),
                    String::from(potential_num),
                )),
            }
        }
    }
}

#[cfg(test)]
mod parse_int_arg_tests {
    use super::*;

    #[test]
    fn fails_for_non_integers() {
        let arg = "runs";
        let val = "asdf";
        let result = parse_int_arg(&arg, Some(&val));

        assert_eq!(
            result,
            Err(ParseError::InvalidInteger(
                String::from(arg),
                String::from(val),
            ))
        );
    }

    #[test]
    fn succeeds_for_integers() {
        let arg = "runs";
        let val = "5";
        let result = parse_int_arg(&arg, Some(&val));

        assert_eq!(result, Ok(Some(5)));
    }
}