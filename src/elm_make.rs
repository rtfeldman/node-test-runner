use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::collections::HashSet;
use problems::Problem;
use cli;

pub fn run(compiler: Option<String>, test_files: HashSet<PathBuf>) -> Result<Child, Problem> {
    let path_to_elm_binary: PathBuf =
        cli::elm_binary_path_from_compiler_flag(compiler).map_err(Problem::Cli)?;
    Command::new(path_to_elm_binary)
        .arg("make")
        .arg("--yes")
        .arg("--output=/dev/null")
        .args(&test_files)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(Problem::SpawnElmMake)
}

pub fn wait(process: Child) -> Result<(), Problem> {
    let output = process
        .wait_with_output()
        .map_err(Problem::CompilationFailed)?;
    if !output.status.success() {
        // TODO this should bail out right?
        println!(
            "elm-make died with stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    };
    // TODO we probably want some nicer output
    println!("elm-make {}", String::from_utf8_lossy(&output.stdout));
    Ok(())
}
