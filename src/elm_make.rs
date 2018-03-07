use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::mpsc::Receiver;
use std::thread;
use std::process::{Command, Stdio};
use std::collections::{HashMap, HashSet};
use problems::Problem;
use cli;
use exposed_tests;

pub fn run(
    compiler: Option<String>,
    test_files: HashSet<PathBuf>,
) -> Receiver<Result<HashMap<PathBuf, Option<HashSet<String>>>, Problem>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || tx.send(elm_make(compiler, test_files)));
    rx
}

fn elm_make(
    compiler: Option<String>,
    test_files: HashSet<PathBuf>,
) -> Result<HashMap<PathBuf, Option<HashSet<String>>>, Problem> {
    let path_to_elm_binary: PathBuf =
        cli::elm_binary_path_from_compiler_flag(compiler).map_err(Problem::Cli)?;

    // Start `elm make` running.
    let mut elm_make_process = Command::new(path_to_elm_binary)
        .arg("make")
        .arg("--yes")
        .arg("--output=/dev/null")
        .args(&test_files)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(Problem::SpawnElmMake)?;

    // TODO we can do these next two things in parallel!

    // TODO [Thread 1] Determine what values each module exposes.
    let exposed_values_by_file: HashMap<PathBuf, Option<HashSet<String>>> =
        exposed_tests::get_exposed_tests(test_files).map_err(|(test_file, err)| {
            elm_make_process.kill().expect("command wasn't running");
            Problem::ExposedTest(test_file, err)
        })?;

    let elm_make_output = elm_make_process
        .wait_with_output()
        .map_err(Problem::CompilationFailed)?;

    if !elm_make_output.status.success() {
        // TODO this should bail out right?
        println!(
            "elm-make died with stderr: {}",
            String::from_utf8_lossy(&elm_make_output.stderr)
        );
    };
    // TODO we probably want some nicer output
    println!(
        "elm-make {}",
        String::from_utf8_lossy(&elm_make_output.stdout)
    );
    Ok(exposed_values_by_file)
}
