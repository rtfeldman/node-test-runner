extern crate glob;

use std::path::PathBuf;
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

pub fn walk_globs<'a, I: Iterator<Item = &'a str>>(
    patterns: I,
) -> Result<HashSet<PathBuf>, glob::PatternError> {
    let mut results: HashSet<PathBuf> = HashSet::new();

    for pattern in patterns {
        for path in glob::glob(pattern)? {
            match path {
                Ok(valid_path) => {
                    results.insert(valid_path);
                }

                Err(err) => {
                    println!("Error! {:?}", err);
                }
            }
        }
    }

    Ok(results)
}
