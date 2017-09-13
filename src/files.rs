extern crate globset;
extern crate walkdir;

use self::globset::{Glob, GlobMatcher};
use self::walkdir::WalkDir;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::ffi::OsStr;
use std::collections::HashSet;

pub fn find_nearest_elm_package_json(file_path: &mut PathBuf) -> Option<PathBuf> {
    let filename = "elm-package.json";

    if file_path.is_dir() {
        file_path.push(filename)
    }

    // Try to find an ancestor elm-package.json, starting with the given directory.
    // As soon as we find one, return it.
    loop {
        if file_path.exists() {
            // We found one! Bail out of the loop and return this as a directory.
            return Some(file_path.clone());
        } else {
            if file_path.pop() {
                return None;
            }

            file_path.push(filename);
        }
    }
}

fn matchers_from_patterns<'a, I: Iterator<Item = &'a str>>(
    root: &Path,
    patterns: I,
) -> Result<Vec<GlobMatcher>, globset::Error> {
    let mut matchers = vec![];

    for pattern in patterns {
        matchers.push(Glob::new(pattern)?.compile_matcher());
    }

    Ok(matchers)
}

pub fn walk_globs<'a, I: Iterator<Item = &'a str>>(
    root: &Path,
    patterns: I,
) -> Result<HashSet<PathBuf>, globset::Error> {
    visit_dirs(root, matchers_from_patterns(root, patterns)?).or_else(|_| {
        panic!("I/O error searching for test files.");
    })
}

// one possible implementation of walking a directory only visiting files
fn visit_dirs(dir: &Path, matchers: Vec<GlobMatcher>) -> Result<HashSet<PathBuf>, walkdir::Error> {
    let elm_file_extension = OsStr::new(".elm");
    let elm_stuff_dir = OsStr::new("elm-stuff");
    let mut results: HashSet<PathBuf> = HashSet::new();

    fn passes_matchers(path: &Path) -> bool {
        true
    }

    for path_buf in WalkDir::new(dir)
        .into_iter()
        .filter_map(|result| match result {
            Ok(dir_entry) => {
                let path = dir_entry.path();


                match path.metadata() {
                    Ok(metadata) => if
                    // Ignore individual files that don't end in .elm
                    (metadata.is_file() &&
                        path.extension() != Some(elm_file_extension)) ||
                        // Ignore elm-stuff directories
                        (metadata.is_dir() && path.file_name() == Some(elm_stuff_dir)) ||
                        // Ignore anything that doesn't match our globs
                        !passes_matchers(path)
                    {
                        None
                    } else {
                        Some(path.to_path_buf())
                    },

                    Err(_) => None,
                }
            }

            Err(_) => None,
        }) {
        results.insert(path_buf);
    }

    Ok(results.clone())
}

#[cfg(unix)]
fn write_path<W: Write>(mut wtr: W, path: &Path) {
    use std::os::unix::ffi::OsStrExt;
    wtr.write(path.as_os_str().as_bytes()).unwrap();
    wtr.write(b"\n").unwrap();
}

#[cfg(not(unix))]
fn write_path<W: Write>(mut wtr: W, path: &Path) {
    wtr.write(path.to_string_lossy().as_bytes()).unwrap();
    wtr.write(b"\n").unwrap();
}
