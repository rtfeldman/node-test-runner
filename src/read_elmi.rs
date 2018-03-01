extern crate json;

use std::io;
use std::io::{Read, BufReader};
use std::path::{PathBuf, Path};
use std::collections::{HashSet, HashMap};
use std::process::{Command, Child, Stdio};
use elm_test_path;

#[derive(Debug)]
pub enum Problem {
    CurrentExe(io::Error),
    SpawnElmiToJson(io::Error),
    ReadElmiToJson(io::Error),
    NoElmiToJsonOutput,
    CompilationFailed(io::Error),
    MalformedJson,
}

// TODO don't use this. Instead, do Haskell FFI to bring it in.
const ELMI_TO_JSON_BINARY_NAME: &str = "elm-interface-to-json";

pub fn read_test_interfaces(
    root: &Path,
    possible_module_names: &HashMap<String, PathBuf>,
) -> Result<HashMap<String, (PathBuf, HashSet<String>)>, Problem> {
    // Get the path to elm-test. Then change the executable name to elm-interface-to-json.
    let path_to_elmi_to_json_binary: PathBuf = elm_test_path::get()
        .map_err(Problem::CurrentExe)?
        .with_file_name(ELMI_TO_JSON_BINARY_NAME);

    // Now that we've run `elm make` to compile the .elmi files, run elm-interface-to-json to
    // obtain the JSON of the interfaces.
    let mut elmi_to_json_process = Command::new(path_to_elmi_to_json_binary)
        .arg("--path")
        .arg(root.to_str().expect(""))
        .stdout(Stdio::piped())
        .spawn()
        .map_err(Problem::SpawnElmiToJson)?;

    let tests_by_module = read_json(&mut elmi_to_json_process, possible_module_names);

    elmi_to_json_process.wait().map_err(
        Problem::CompilationFailed,
    )?;

    Ok(tests_by_module?)
}


fn read_json(
    program: &mut Child,
    possible_module_names: &HashMap<String, PathBuf>,
) -> Result<HashMap<String, (PathBuf, HashSet<String>)>, Problem> {
    match program.stdout.as_mut() {
        Some(out) => {
            let mut buf_reader = BufReader::new(out);
            let mut json_output = String::new();

            // Populate json_output with the stdout coming from elm-interface-to-json
            buf_reader.read_to_string(&mut json_output).map_err(
                Problem::ReadElmiToJson,
            )?;

            parse_json(&json_output, possible_module_names)
        }
        None => Err(Problem::NoElmiToJsonOutput),
    }
}

fn parse_json(
    json_output: &str,
    possible_module_names: &HashMap<String, PathBuf>,
) -> Result<HashMap<String, (PathBuf, HashSet<String>)>, Problem> {
    match json::parse(json_output) {
        Ok(json::JsonValue::Array(modules)) => {
            // A map from module name to its set of exposed values of type Test.
            let mut tests_by_module: HashMap<String, (PathBuf, HashSet<String>)> = HashMap::new();

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
                                if let &json::JsonValue::Short(ref signature) = &typ["signature"] {
                                    if signature == "Test.Test" {
                                        // This value is a Test. Add it to the set!
                                        if let &json::JsonValue::Short(ref name) = &typ["name"] {
                                            top_level_tests.insert(name.to_string());
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

            Ok(tests_by_module)
        }
        _ => Err(Problem::MalformedJson),
    }
}
