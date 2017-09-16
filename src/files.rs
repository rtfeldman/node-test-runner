use std::io;
use std::fs;
use std::path::PathBuf;
use std::ffi::OsStr;
use std::collections::HashSet;

const ELM_JSON_FILENAME: &str = "elm-package.json";

pub fn find_nearest_elm_json(file_path: &mut PathBuf) -> Option<PathBuf> {
    if file_path.is_dir() {
        file_path.push(ELM_JSON_FILENAME)
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

            file_path.push(ELM_JSON_FILENAME);
        }
    }
}

const ELM_FILE_EXTENSION: &str = "elm";
const ELM_STUFF_DIR: &str = "elm-stuff";

pub fn gather_all<I: Iterator<Item = PathBuf>>(
    results: &mut HashSet<PathBuf>,
    paths: I,
) -> io::Result<()> {
    let elm_file_extension = Some(OsStr::new(ELM_FILE_EXTENSION));
    let elm_stuff_dir = Some(OsStr::new(ELM_STUFF_DIR));

    // TODO performance optimization: make sure cases like ["elm-code/src", "elm-code/tests"]
    // work well. Split the given paths into components, then build a representation that only
    // traverses each directory once.

    for raw_path in paths {
        let path = raw_path.canonicalize()?;
        let metadata = path.metadata()?;

        if metadata.is_file() {
            // Only keep .elm files
            if path.extension() == elm_file_extension {
                results.insert(path);
            }
        } else if metadata.is_dir() {
            // Use a stack instead of recursion.
            let mut stack: Vec<PathBuf> = vec![path];

            while !stack.is_empty() {
                // It's okay to unwrap() here, since we just verified the stack is non-empty.
                let dir = stack.pop().unwrap();

                // Ignore elm-stuff directories
                if dir.file_name() != elm_stuff_dir {
                    for raw_child in fs::read_dir(dir)? {
                        let child = raw_child?.path().canonicalize()?;
                        let child_metadata = child.metadata()?;

                        if child_metadata.is_file() {
                            // Only keep .elm files
                            if child.extension() == elm_file_extension {
                                results.insert(child);
                            }
                        } else if metadata.is_dir() {
                            // Recurse into directories.
                            stack.push(child);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
