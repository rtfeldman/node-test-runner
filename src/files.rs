extern crate json;

use std::io;
use std::io::Read;

use std::fs;
use std::fs::File;
use std::path::{PathBuf, Path, Component};
use std::ffi::OsStr;
use std::collections::{HashSet, HashMap};

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

pub fn possible_module_names(
    test_files: &HashSet<PathBuf>,
    source_dirs: &HashSet<PathBuf>,
) -> HashMap<String, PathBuf> {
    // Each module must correspond to a file path, by way of a source directory.
    // This filters out stale modules left over from previous builds, for example
    // what happened in https://github.com/rtfeldman/node-test-runner/issues/122
    let mut possibilities: HashMap<String, PathBuf> = HashMap::new();

    for source_dir in source_dirs {
        let source_dir_components = source_dir.components().collect::<Vec<Component>>();

        for test_file in test_files {
            // If we can construct a valid module name based on this source directory
            // and filename combination, add it to the map!
            if let Some(valid_module_name) =
                to_module_name(&test_file.with_extension(""), &source_dir_components)
            {
                possibilities.insert(valid_module_name, test_file.clone());
            }
        }
    }

    possibilities
}

fn to_module_name(test_file: &Path, source_dir: &Vec<Component>) -> Option<String> {
    let test_file_components: Vec<Component> = test_file.components().collect();
    let (prefix, module_name_components) = test_file_components.split_at(source_dir.len());

    // If the test file doesn't start with this source dir, return None.
    if prefix == source_dir.as_slice() {
        // We've got a match! Build up the module name and return it.
        let mut results = vec![];

        // Iterate in reverse order because we'll be pushing onto a stack.
        for component in module_name_components.iter().rev() {
            match component.as_os_str().to_str() {
                Some(component_str) => {
                    // We got a valid string; add it to the list of module components.
                    results.push(component_str);
                }
                None => {
                    // If we couldn't get a valid string out of this, it's not a valid module name!
                    return None;
                }
            }
        }

        Some(results.join("."))
    } else {
        None
    }
}


#[cfg(test)]
mod possible_modules_tests {
    use super::*;

    #[test]
    fn works_for_several() {
        let test_files: HashSet<PathBuf> = [
            "tests/PassingTest.elm",
            "tests/FailingTest.elm",
            "otherTests/Passing.elm",
            "/etc/otherTests/Passing.elm",
            "blah/stuff/Sponge.elm",
            "blah/stuff/whee/Stuff.elm",
            "blah/stuff/whee/Stuff/Things.elm",
            "otherTests/SweetTest/What.elm",
            "blah/stuff/One/More/Time.elm",
        ].iter()
            .map(PathBuf::from)
            .collect();
        let source_dirs: HashSet<PathBuf> = [
            "tests",
            "otherTests",
            "/etc/otherTests",
            "blah/stuff",
            "blah/stuff/whee/",
        ].iter()
            .map(PathBuf::from)
            .collect();
        let actual = possible_module_names(&test_files, &source_dirs);
        let expected: HashMap<String, PathBuf> =
            [
                (String::from("PassingTest"), PathBuf::from("tests")),
                (String::from("FailingTest"), PathBuf::from("tests")),
                (String::from("Passing"), PathBuf::from("tests")),
                (String::from("Sponge"), PathBuf::from("tests")),
                (String::from("Stuff"), PathBuf::from("tests")),
                (String::from("Stuff.Things"), PathBuf::from("tests")),
                (String::from("SweetTest.What"), PathBuf::from("tests")),
                (String::from("One.More.Time"), PathBuf::from("tests")),
            ].iter()
                .cloned()
                .collect();
        assert_eq!(expected, actual);
    }
}

#[derive(Debug)]
pub enum ElmJsonError {
    OpenElmJson(io::Error),
    ReadElmJson(io::Error),
    ParseElmJson(json::Error),
    InvalidSourceDirectory(String),
    InvalidSourceDirectories,
}

pub fn read_source_dirs(root: &Path) -> Result<HashSet<PathBuf>, ElmJsonError> {
    let mut file = File::open(root
        // TODO don't join with tests/ - this is a hack for 0.18!
        .join(PathBuf::from("tests"))
        .join(PathBuf::from(ELM_JSON_FILENAME))).map_err(ElmJsonError::OpenElmJson)?;
    let mut file_contents = String::new();

    file.read_to_string(&mut file_contents).map_err(
        ElmJsonError::ReadElmJson,
    )?;

    let elm_json: json::JsonValue = json::parse(&file_contents).map_err(
        ElmJsonError::ParseElmJson,
    )?;

    match elm_json["source-directories"] {
        json::JsonValue::Array(ref source_dirs) => {
            let mut paths: HashSet<PathBuf> = HashSet::new();

            for source_dir in source_dirs {
                // TODO don't join with tests/ - this is a hack for 0.18!
                match PathBuf::from("tests")
                    .join(source_dir.to_string())
                    .canonicalize() {
                    Ok(path) => {
                        paths.insert(path);
                    }
                    Err(_) => {
                        return Err(ElmJsonError::InvalidSourceDirectory(source_dir.to_string()));
                    }
                }
            }

            Ok(paths)
        }
        _ => Err(ElmJsonError::InvalidSourceDirectories),
    }
}
