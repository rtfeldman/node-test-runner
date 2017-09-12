extern crate ignore;

use std::path::{Path, PathBuf};
use ignore::overrides::{Override, OverrideBuilder};
use ignore::Walk;
use ignore::WalkBuilder;


pub fn find_nearest_elm_package_dir(file_path: PathBuf) -> Option<PathBuf> {
    let mut current_file_path = file_path.as_path();

    // Try to find an ancestor elm-package.json, starting with the given directory.
    // As soon as we find one, return it.
    loop {
        if current_file_path
            .with_file_name("elm-package.json")
            .exists()
        {
            // We found one! Bail out of the loop and return this as a directory.
            return Some(current_file_path.with_file_name(""));
        } else {
            match current_file_path.parent() {
                Some(parent_file_path) => {
                    // Try the parent directory next.
                    current_file_path = parent_file_path;
                }

                None => {
                    // We hit the root. We're done; we didn't find one.
                    return None;
                }
            }
        }
    }
}

pub fn walk_globs<'a, I: Iterator<Item = &'a str>>(
    root: &Path,
    patterns: I,
) -> Result<Walk, ignore::Error> {
    build_overrides(root, patterns).map(|overrides| {
        WalkBuilder::new(root).overrides(overrides).build()
    })
}

fn build_overrides<'a, I: Iterator<Item = &'a str>>(
    root: &Path,
    patterns: I,
) -> Result<Override, ignore::Error> {
    let mut builder = &mut OverrideBuilder::new(root);

    // Ignore elm-stuff directories. Don't bother checking the error; we know this one can't fail.
    builder.add("!/**/elm-stuff/**");

    // Add all the patterns. If any are invalid globs, bail out with an error.
    for pattern in patterns {
        if let Err(err) = builder.add(pattern) {
            return Err(err);
        }
    }

    builder.build()
}
