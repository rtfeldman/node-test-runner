
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::collections::HashMap;
use abort::Abort;
use read_elmi::ReadElmiError;
use files::ElmJsonError;
use cli::ParseError;

pub fn report(error: Abort) -> String {
    match error {
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
        Abort::ReadElmi(ReadElmiError::SpawnElmiToJson(_)) => String::from(
            "Unable to run `elm-interface-to-json`. \
            This binary should have been installed along with elm-test. \
            Maybe try reinstalling elm-test via npm?",
        ),
        Abort::ReadElmi(ReadElmiError::CurrentExe(_)) => String::from(
            "Unable to detect current running process for `elm-test`. \
            Is elm-test running from a weird location, possibly involving symlinks?",
        ),
        Abort::ReadElmi(ReadElmiError::CompilationFailed(_)) => String::from(
            "Test compilation failed.",
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
        Abort::ReadElmJson(ElmJsonError::OpenElmJson(_)) => {
            String::from(
                "Unable to open your project's elm.json file for reading. \
                Please make sure it exists and has the right permissions!",
            )
        }
        Abort::ReadElmJson(ElmJsonError::ReadElmJson(_)) => {
            String::from(
                "Unable to read your project's elm.json file. \
                Try opening it in a text editor to see if something's wrong with it, and \
                maybe consider trying to recreate it.",
            )
        }
        Abort::ReadElmJson(ElmJsonError::ParseElmJson(_)) => {
            String::from(
                "Your project's elm.json file appears to contain invalid JSON. \
                Try running it through a JSON validator and fixing any syntax errors you find!",
            )
        }
        Abort::ReadElmJson(ElmJsonError::InvalidSourceDirectories) => {
            String::from(
                "Your project's elm.json file does not have a valid source-directories array. \
                Make sure the `source-directories` field is presesnt, and is an array of strings!",
            )
        }
        Abort::ReadElmJson(ElmJsonError::InvalidSourceDirectory(source_dir)) => {
            format!(
                "Your project's elm.json file contains an invalid source-directory: {}",
                source_dir
            )
        }
        Abort::CliArgParseError(ParseError::InvalidInteger(arg, flag_name)) => {
            format!(
                "{} is not a valid value for argument for the {} flag",
                arg,
                flag_name
            )
        }
    }
}

const MAKE_SURE: &str = "Make sure you're running elm-test from your project's root directory, \
                         where its elm.json file lives.\n\nTo generate some initial tests \
                         to get things going, run `elm test init`.";
