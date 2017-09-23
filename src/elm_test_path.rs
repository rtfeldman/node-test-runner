use std::fs;
use std::env;
use std::io;
use std::path::PathBuf;

// Get the path to the elm-test installation.
pub fn get() -> io::Result<PathBuf> {
    // Get the path to the currently executing elm-test binary. This may be a symlink.
    let path_to_elm_test_binary: PathBuf = env::current_exe()?;

    // If it's a symlink, follow it.
    Ok(fs::read_link(&path_to_elm_test_binary).unwrap_or(
        path_to_elm_test_binary,
    ))
}
