extern crate murmur3;
extern crate json;

use std::io;
use std::path::{Path, PathBuf};
use std::collections::{HashSet, HashMap};
use cli::Report;
use elm_test_path;
use std::io::Write;
use std::fs::File;
use std::fs;


fn sanitize(string: String) -> String {
    format!("\"{}\"", string.replace("\\", "\\\\").replace("\"", "\\\""))
}

const MURMUR3_SEED: u32 = 8675309;


fn get_report_code(report: &Report, supports_color: bool) -> String {
    match report {
        // &Report::Json => "JsonReport",
        // &Report::JUnit => "JUnitReport",
        &Report::Console => {
            if supports_color {
                "(ConsoleReport UseColor)"
            } else {
                "(ConsoleReport Monochrome)"
            }
        }
    }.to_owned()
}

pub fn generate(
    tests_by_module: &HashMap<String, HashSet<String>>,
    supports_color: bool,
    processes: usize,
    report_opt: &Report,
    fuzz_opt: &Option<u64>,
    seed_opt: &Option<u64>,
    file_path_opts: &Vec<PathBuf>,
) -> (String, String) {
    // Building things like:
    //
    // import MyTests
    //
    // MyTests.suite
    let (imports, tests) = tests_by_module
        .iter()
        .map(|(module_name, test_names)| {
            (
                format!("import {}", module_name),
                format!(
                    "Test.describe \"{}\"\n        [ {}\n        ]",
                    module_name,

                    test_names
                        .iter()
                        .map(|test_name| format!("{}.{}", module_name, test_name))
                        .collect::<Vec<String>>()
                        .join("\n        , ")
                ),
            )
        })
        .unzip();

    let fuzz: String = fuzz_opt.map(|num| format!("Just {}", num)).unwrap_or(
        "Nothing"
            .to_owned(),
    );
    let seed: String = seed_opt.map(|num| format!("Just {}", num)).unwrap_or(
        "Nothing"
            .to_owned(),
    );
    let report: String = get_report_code(report_opt, supports_color);
    let paths = file_path_opts
        .iter()
        .map(|file_path| {
            sanitize(format!(
                "\"{}\"",
                file_path.as_os_str().to_str().unwrap_or(Default::default())
            ))
        })
        .collect::<Vec<String>>()
        .join(", ");

    let opts_code: String = format!(
        "runs = {}, report = {}, seed = {}, processes = {}, paths = [{}]",
        fuzz,
        report,
        seed,
        processes,
        paths
    );
    let imports_list: Vec<String> = imports;
    let test_list: Vec<String> = tests;

    let test_file_body: String = format!(
        "{}\
        \n
        \nimport Test.Reporter.Reporter exposing (Report(..))\
        \nimport Console.Text exposing (UseColor(..))\
        \nimport Test.Runner.Node\
        \nimport Test\
        \nimport Json.Encode\
        \n\
        \nmain : Test.Runner.Node.TestProgram\
        \nmain =\
        \n    [ {}\
        \n    ]\
        \n        |> Test.concat\
        \n        |> Test.Runner.Node.runWithOptions {}\
        \n",
        imports_list.join("\n"),
        test_list.join("\n    , "),
        ("{".to_owned() + opts_code.as_str() + "}")
    );

    // Generate a filename that incorporates the hash of file contents.
    // This way, if you run e.g. `elm-test Foo.elm` and then `elm-test Bar.elm`
    // and then re-run `elm-test Foo.elm` we still have a cached `Main` for
    // `Foo.elm` (assuming none of its necessary imports have changed - and
    // why would they?) so we don't have to recompile it.
    let mut salt = test_file_body.as_bytes();

    murmur3::murmur3_32(&mut salt, MURMUR3_SEED);

    let module_name = format!("Main{}", String::from_utf8_lossy(salt));

    // We'll be putting the generated Main in something like this:
    //
    // my-project/elm-stuff/generated-code/elm-community/elm-test/src/Test/Generated/Main123456.elm
    (
        module_name.clone(),
        format!(
            "module Test.Generated.{} exposing (main)\n\n{}",
            module_name,
            test_file_body
        ),
    )
}

#[derive(Debug)]
pub enum Problem {
    GetElmTestPath(io::Error),
    CanonicalizeError(String),
    Write(PathBuf),
    MalformedElmJson,
}

pub fn generate_elm_json(
    generated_src: &Path,
    elm_json: &json::JsonValue,
) -> Result<String, Problem> {
    match elm_json {
        &json::JsonValue::Object(ref elm_json_obj) => {
            let mut new_elm_json = elm_json_obj.clone();

            // TODO remove this match once random-pcg has become core's new Random!
            match elm_json_obj.get("dependencies") {
                Some(&json::JsonValue::Object(ref obj)) => {
                    if obj.get("mgold/elm-random-pcg").is_some() {
                        // Test.Runner.Node.App needs this to create a Seed from current timestamp
                        new_elm_json["dependencies"]["mgold/elm-random-pcg"] =
                            json::JsonValue::String("4.0.2 <= v < 6.0.0".to_owned());
                    }
                }
                _ => {
                    return Err(Problem::MalformedElmJson);
                }
            }

            let mut source_dirs = json::JsonValue::new_array();

            match elm_json_obj.get("source-directories") {
                Some(&json::JsonValue::Array(ref dirs)) => {
                    for dir in dirs {
                        match dir {
                            &json::JsonValue::String(ref src) => {
                                source_dirs.push(
                                    PathBuf::from(src)
                                        .canonicalize()
                                        .map_err(|_| Problem::CanonicalizeError(src.to_owned()))?
                                        .as_os_str()
                                        .to_str()
                                        .unwrap(),
                                );
                            }
                            _ => {
                                return Err(Problem::MalformedElmJson);
                            }
                        }
                    }
                }
                _ => {
                    return Err(Problem::MalformedElmJson);
                }
            };

            // Include elm-stuff/generated-sources - since we'll be generating sources in there.
            source_dirs.push(generated_src.as_os_str().to_str().unwrap());

            // Include node-test-runner's src directory, to allow access to the Runner code.
            source_dirs.push(
                elm_test_path::get()
                    .map_err(Problem::GetElmTestPath)?
                    .join("src")
                    .as_os_str()
                    .to_str()
                    .unwrap(),
            );

            new_elm_json["source-directories"] = source_dirs;

            Ok(json::stringify_pretty(new_elm_json, 4))
        }

        _ => Err(Problem::MalformedElmJson),
    }
}


pub fn write(generated_src: &Path, module_name: &str, contents: &str) -> Result<usize, Problem> {
    let main_dir = generated_src.to_path_buf().join("Test").join("Generated");

    fs::create_dir_all(&main_dir).map_err(|_| {
        Problem::Write(generated_src.to_path_buf())
    })?;

    let main_file_path = main_dir.join(module_name.to_owned() + ".elm");
    let mut file: File = File::create(main_file_path).map_err(|_| {
        Problem::Write(generated_src.to_path_buf())
    })?;

    file.write(contents.as_bytes()).map_err(|_| {
        Problem::Write(generated_src.to_path_buf())
    })
}
