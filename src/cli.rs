extern crate clap;

use clap::{App, Arg};

// Use the version number in Cargo.toml
pub const VERSION: &'static str = env!("CARGO_PKG_VERSION");

#[derive(PartialEq, Debug)]
pub enum ParseError {
    InvalidInteger(String, String),
}

pub fn parse_args<'a>() -> clap::ArgMatches<'a> {
    App::new("elm-test")
        .version(VERSION)
        .arg(
            Arg::with_name("seed")
                .short("s")
                .long("seed")
                .value_name("INTEGER")
                .help("Use this for the initial fuzzer seed")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("fuzz")
                .short("f")
                .long("fuzz")
                .value_name("POSITIVE_INTEGER")
                .help("Have each fuzz test perform this many iterations")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("compiler")
                .short("c")
                .long("compiler")
                .value_name("FILE_PATH")
                .help("Use this `elm` executable for `elm make`")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("FILES_OR_DIRECTORIES")
                .help("Run all tests found in these files and directories")
                .multiple(true)
                .index(1),
        )
        .get_matches()
}


// Turn the given Option<&str> into an Option<i32>, or else die and report the invalid argument.
pub fn parse_int_arg(flag_name: &str, val: Option<&str>) -> Result<Option<i32>, ParseError> {
    match val {
        None => Ok(None),
        Some(potential_num) => match potential_num.parse::<i32>() {
            Ok(num) => Ok(Some(num)),

            Err(_) => Err(ParseError::InvalidInteger(
                String::from(flag_name),
                String::from(potential_num),
            )),
        },
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
                String::from(val)
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
