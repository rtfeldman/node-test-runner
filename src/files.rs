use std::io;
use std::fs;
use std::path::{PathBuf, Path};
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

pub fn possible_module_names(test_files: &HashSet<PathBuf>) -> HashSet<String> {
    let mut possibilities: HashSet<String> = HashSet::new();

    for test_file in test_files {
        let mut current_components: Vec<String> = vec![];

        // Drop the .elm extension and try everything else
        for component in test_file.with_extension("").components() {
            if let Some(component_str) = component.as_os_str().to_str() {
                if let Some(first_char) = component_str.chars().next() {
                    // Only uppercase filenames are valid Elm modules.
                    if first_char.is_uppercase() {
                        current_components.push(component_str.to_owned());

                        possibilities.insert(current_components.join("."));
                    }
                }
            }
        }
    }

    possibilities
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
        let actual = possible_module_names(&test_files);
        let expected: HashSet<String> = [
            "PassingTest",
            "FailingTest",
            "Passing",
            "Sponge",
            "Stuff",
            "Stuff.Things",
            "SweetTest.What",
            "One.More.Time",
            // Arguably, these shouldn't be in there. However, they could be in source-directories.
            // We could do a fancier check for source-directories, but it doesn't seem worth it.
            // You'd have to give your source-directories some pretty crazy names for this to
            // cause a problem, and long-term the goal is to scrap this code in favor of tighter
            // Elm compiler integration anyway, at which point this whole check will go away.
            "One.More",
            "One",
            "SweetTest",
        ].iter()
            .map(|&string| String::from(string))
            .collect();
        assert_eq!(expected, actual);
    }
}
