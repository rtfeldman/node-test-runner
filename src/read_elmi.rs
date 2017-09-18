
extern crate json;

use std;
use std::io;
use std::fs;
use std::io::{Read, BufReader};
use std::path::{PathBuf, Path};
use std::collections::{HashSet, HashMap};
use std::process::{Command, Child, Stdio};
use exposed_tests;

#[derive(Debug)]
pub enum ReadElmiError {
    CurrentExe(io::Error),
    SpawnElmiToJson(io::Error),
    CompilationFailed(io::Error),
}

// TODO don't use this. Instead, do Haskell FFI to bring it in.
const ELMI_TO_JSON_BINARY_NAME: &str = "elm-interface-to-json";

pub fn read_test_interfaces(
    root: &Path,
    possible_module_names: &HashMap<String, PathBuf>,
) -> Result<Vec<String>, ReadElmiError> {
    // Get the path to the currently executing elm-test binary. This may be a symlink.
    let path_to_elm_test_binary: PathBuf =
        std::env::current_exe().map_err(ReadElmiError::CurrentExe)?;

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
        .map_err(ReadElmiError::SpawnElmiToJson)?;

    let tests = print_json(&mut elmi_to_json_process, possible_module_names);

    elmi_to_json_process.wait().map_err(
        ReadElmiError::CompilationFailed,
    )?;

    Ok(vec![])
}


fn print_json(
    program: &mut Child,
    possible_module_names: &HashMap<String, PathBuf>,
) -> io::Result<Vec<String>> {
    match program.stdout.as_mut() {
        Some(out) => {
            let mut buf_reader = BufReader::new(out);
            let mut json_output = String::new();

            // Populate json_output with the stdout coming from elm-interface-to-json
            buf_reader.read_to_string(&mut json_output)?;

            match json::parse(&json_output) {
                Ok(json::JsonValue::Array(modules)) => {
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
                                if let &json::JsonValue::Array(ref types) = &module["types"] {
                                    // We'll populate this with every value we find of type Test.
                                    let mut top_level_tests: HashSet<String> = HashSet::new();

                                    for typ in types {
                                        if typ["signature"] == "Test.Test" {
                                            // This value is a Test. Add it to the set!
                                            if let &json::JsonValue::Object(ref obj) = typ {
                                                if let Some(&json::JsonValue::Short(ref name)) =
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
                        exposed_tests::filter_exposing(&test_path, &tests, &module_name);
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
