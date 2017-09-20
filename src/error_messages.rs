
use std::path::PathBuf;
use problems::Problem;
use read_elmi;
use files::ElmJsonError;
use cli;
use exposed_tests;

pub fn report(problem: Problem) -> String {
    match problem {
        Problem::MissingElmJson => {
            format!(
                "elm-test could not find an elm.json file in this directory \
             or any parent directories.\n{}",
                MAKE_SURE
            )
        }
        Problem::InvalidCwd(_) => String::from(
            "elm-test was run from an invalid directory. \
             Maybe the current directory has been deleted?",
        ),
        Problem::SpawnElmMake(_) => String::from(
            "Unable to execute `elm make`. Try using the --compiler flag to set the location of \
            the `elm` executable explicitly.",
        ),
        Problem::CompilationFailed(_) => String::from("Test compilation failed."),
        Problem::SpawnNodeProcess(_) => String::from(
            "Unable to run `node`. \
            Do you have nodejs installed? You can get it from https://nodejs.org",
        ),
        Problem::ReadElmi(read_elmi::Problem::SpawnElmiToJson(_)) => String::from(
            "Unable to run `elm-interface-to-json`. \
            This binary should have been installed along with elm-test. \
            Maybe try reinstalling elm-test via npm?",
        ),
        Problem::ReadElmi(read_elmi::Problem::CurrentExe(_)) => String::from(
            "Unable to detect current running process for `elm-test`. \
            Is elm-test running from a weird location, possibly involving symlinks?",
        ),
        Problem::ReadElmi(read_elmi::Problem::CompilationFailed(_)) => String::from(
            "Test compilation failed.",
        ),
        Problem::ChDirError(_) => String::from(
            "elm-test was unable to change the current working directory.",
        ),
        Problem::ReadTestFiles(_) => {
            String::from("elm-test was unable to read the requested .elm files.")
        }
        Problem::NoTestsFound(filenames) => {
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
        Problem::Cli(cli::Problem::InvalidInteger(arg, flag_name)) => {
            format!(
                "{} is not a valid value for argument for the {} flag",
                arg,
                flag_name
            )
        }
        Problem::Cli(cli::Problem::InvalidCompilerFlag(path_to_elm_binary)) => {
            format!(
                "The --compiler flag must be given a valid path to an elm executable,\
             which this was not: {}",
                path_to_elm_binary
            )
        }
        Problem::ReadElmJson(ElmJsonError::OpenElmJson(_)) => {
            String::from(
                "Unable to open your project's elm.json file for reading. \
                Please make sure it exists and has the right permissions!",
            )
        }
        Problem::ReadElmJson(ElmJsonError::ReadElmJson(_)) => {
            String::from(
                "Unable to read your project's elm.json file. \
                Try opening it in a text editor to see if something's wrong with it, and \
                maybe consider trying to recreate it.",
            )
        }
        Problem::ReadElmJson(ElmJsonError::ParseElmJson(_)) => {
            String::from(
                "Your project's elm.json file appears to contain invalid JSON. \
                Try running it through a JSON validator and fixing any syntax errors you find!",
            )
        }
        Problem::ReadElmJson(ElmJsonError::InvalidSourceDirectories) => {
            String::from(
                "Your project's elm.json file does not have a valid source-directories array. \
                Make sure the `source-directories` field is presesnt, and is an array of strings!",
            )
        }
        Problem::ReadElmJson(ElmJsonError::InvalidSourceDirectory(source_dir)) => {
            format!(
                "Your project's elm.json file contains an invalid source-directory: {}",
                source_dir
            )
        }
        Problem::ExposedTest(path,
                             exposed_tests::Problem::UnexposedTests(module_name, bad_tests)) => {
            let mut sorted_tests = bad_tests
                .clone()
                .into_iter()
                .map(|test| format!("{}: Test", test))
                .collect::<Vec<String>>();

            sorted_tests.sort();

            format!(
                "`{}` \
                is a module with top-level Test values which it does not expose:\n\n{}\n\n
                These tests will not get run. \
                  Please either expose them or move them out of the top level.",
                module_name,
                sorted_tests.join("\n")
            )
        }

        Problem::ExposedTest(path, exposed_tests::Problem::MissingModuleDeclaration) => {
            format!(
                "File \"{}\" needs a `module` declaration on the first line.",
                path.as_os_str().to_str().unwrap_or(""),
            )
        }
        Problem::ExposedTest(path, exposed_tests::Problem::OpenFileToReadExports(_)) => {
            format!(
                "Could not open \"{}\" when attempting to validate its exports.",
                path.as_os_str().to_str().unwrap_or(""),
            )
        }
        Problem::ExposedTest(path, exposed_tests::Problem::ReadingFileForExports(_)) => {
            format!(
                "Could not read \"{}\" when attempting to validate its exports.",
                path.as_os_str().to_str().unwrap_or(""),
            )
        }
    }
}

const MAKE_SURE: &str = "Make sure you're running elm-test from your project's root directory, \
                         where its elm.json file lives.\n\nTo generate some initial tests \
                         to get things going, run `elm test init`.";
