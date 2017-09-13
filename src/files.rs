extern crate crossbeam;
extern crate ignore;

use std::thread;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use globset::{GlobBuilder, GlobMatcher};

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
    root: &Path,
    patterns: I,
) -> Result<Walk, ignore::Error> {
    let queue: Arc<crossbeam::sync::MsQueue<Option<DirEntry>>> =
        Arc::new(crossbeam::sync::MsQueue::new());

    let stdout_queue = queue.clone();
    let stdout_thread = thread::spawn(move || {
        let mut stdout = io::BufWriter::new(io::stdout());
        while let Some(dent) = stdout_queue.pop() {
            write_path(&mut stdout, dent.path());
        }
    });

    build_overrides(root, patterns).map(|overrides| {
        WalkBuilder::new(root).build_parallel().run(|| {
            let queue = queue.clone();
            Box::new(move |result| {
                use ignore::WalkState::*;

                queue.push(Some(result.unwrap()));
                Continue
            })
        });

        queue.push(None);
        stdout_thread.join().unwrap();

        WalkBuilder::new(root).overrides(overrides).build()
    })
}

fn build_overrides<'a, I: Iterator<Item = &'a str>>(
    root: &Path,
    patterns: I,
) -> Result<Override, ignore::Error> {
    let builder = &mut OverrideBuilder::new(root);

    // Ignore elm-stuff directories. Don't bother checking the error; we know this one can't fail.
    builder.add("!*elm-stuff*").unwrap();

    // Add all the patterns. If any are invalid globs, bail out with an error.
    for pattern in patterns {
        if let Err(err) = builder.add(pattern) {
            return Err(err);
        }
    }


    builder.build()
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
