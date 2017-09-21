// Determine which values of type Test are exposed from a given module.

use std::fs::File;
use std::io::{BufReader, BufRead};
use io;
use std::path::Path;
use std::collections::HashSet;

#[derive(Debug)]
pub enum Problem {
    MissingModuleDeclaration,
    OpenFileToReadExports(io::Error),
    ReadingFileForExports(io::Error),
    ParseError,
}

pub fn read_exposed_values(path: &Path) -> Result<Option<HashSet<String>>, Problem> {
    let file = File::open(path).map_err(Problem::OpenFileToReadExports)?;
    let exposing = read_exposing(&file)?;

    if exposing.contains("..") && exposing.len() == 1 {
        // If we got `exposing (..)` then return None
        Ok(None)
    } else {
        // Otherwise, return the set of exposed values.
        Ok(Some(exposing))
    }
}


fn read_exposing(file: &File) -> Result<HashSet<String>, Problem> {
    let mut reader = BufReader::new(file);

    // how many levels deep in block comments we are.
    let mut block_comment_depth = 0;

    // if the module line has been read
    let mut has_module_line_been_read = false;

    let mut is_reading_module_name = false;
    let mut is_reading_exports = false;
    let mut is_between_parens = false;

    // number of open/closed parens seen so far
    let mut open_parens_seen = 0;
    let mut closed_parens_seen = 0;

    // data between exposing brackets
    let mut data = String::new();

    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|err| {
            Problem::ReadingFileForExports(err)
        })?;

        if line.is_empty() {
            return Err(Problem::ParseError);
        }

        let (line_without_comments, new_block_comment_depth) =
            strip_comments(&line, block_comment_depth);

        line = line_without_comments.to_owned();
        block_comment_depth = new_block_comment_depth;

        if line.is_empty() {
            continue;
        }

        // if we haven't started reading the first line
        if !has_module_line_been_read {
            let new_line = remove_module_declaration(&line);

            println!("without module declaration: {:?}", new_line);

            if new_line == line {
                // We did not find a module to remove, meaning we found content before the module
                // declaration. Error!
                return Err(Problem::MissingModuleDeclaration);
            } else {
                // We found and successfully removed the module declaration.
                has_module_line_been_read = true;
                is_reading_module_name = true;
            }
        } else {
            if line.is_empty() {
                continue;
            }
        }

        // if we are still reading the module line, find "exposing" and remove it.
        if is_reading_module_name {
            match remove_exposing(&line) {
                Some(line_without_exposing) => {
                    line = line_without_exposing;

                    is_reading_module_name = false;
                    is_reading_exports = true;

                    if line.is_empty() {
                        continue;
                    }
                }
                None => {
                    continue;
                }
            }
        }

        // if we are actually reading the exports
        if is_reading_exports {
            // remove everything before the open paren
            match remove_before_open_paren(&line) {
                Some(line_without_open_paren) => {
                    open_parens_seen += 1;
                    is_reading_exports = false;
                    is_between_parens = true;

                    line = line_without_open_paren;
                }
                None => {
                    continue;
                }
            }
        }

        // if we're before the final bracket
        if is_between_parens {
            // TODO this is probably inefficient
            let new_open_parens_seen = line.split("(").count();
            let new_closed_parens_seen = line.split(")").count();

            closed_parens_seen += new_closed_parens_seen;
            open_parens_seen += new_open_parens_seen;

            data += &line;

            if closed_parens_seen == open_parens_seen {
                return Ok(split_exposing(&data));
            }
        }
    }
}

#[cfg(test)]
mod test_read_exposing {
    extern crate tempfile;

    use super::*;
    use std::io::Write;

    #[test]
    fn works() {
        let mut file: File = tempfile::tempfile().unwrap();

        file.write_all(b"module Foo exposing (bar, baz)").unwrap();

        match read_exposing(&file) {
            Ok(actual) => {
                let expected = vec!["bar", "baz"]
                    .iter()
                    .cloned()
                    .map(String::from)
                    .collect::<HashSet<String>>();

                assert_eq!(expected, actual);
            }
            Err(err) => {
                // TODO there has to be a more idiomatic way to fail a test on purpose!
                assert!(false);
            }
        }
    }
}

// remove everything before the open paren
fn remove_before_open_paren(line: &str) -> Option<String> {
    match line.find("(") {
        Some(first_paren_index) => {
            let line_length = line.len();
            let start_index = first_paren_index + 1;

            unsafe { Some(line.slice_unchecked(start_index, line_length).to_owned()) }
        }
        None => None,
    }
}

#[cfg(test)]
mod test_remove_open_paren {
    use super::*;

    #[test]
    fn no_exposing() {
        assert_eq!(None, remove_before_open_paren("blah"));
    }

    #[test]
    fn starts_with_paren() {
        assert_eq!(
            Some(" foo bar".to_owned()),
            remove_before_open_paren("( foo bar")
        );
    }

    #[test]
    fn ends_with_paren() {
        assert_eq!(
            Some("".to_owned()),
            remove_before_open_paren(" blah, etc (")
        );
    }

    #[test]
    fn paren_surrounded() {
        assert_eq!(
            Some(" etc, blah ".to_owned()),
            remove_before_open_paren(" foo, bar ( etc, blah ")
        );
    }
}

fn remove_exposing(line: &str) -> Option<String> {
    match line.find("exposing") {
        Some(exposing_index) => {
            let line_length = line.len();
            let after_index = exposing_index + 8;

            let before_exposing = unsafe { line.slice_unchecked(0, exposing_index) };
            let after_exposing = unsafe { line.slice_unchecked(after_index, line_length) };

            return Some(before_exposing.to_owned() + after_exposing);
        }
        None => None,
    }
}

#[cfg(test)]
mod test_remove_exposing {
    use super::*;

    #[test]
    fn no_exposing() {
        assert_eq!(None, remove_exposing("blah"));
    }

    #[test]
    fn starts_with_exposing() {
        assert_eq!(
            Some(" foo, bar".to_owned()),
            remove_exposing("exposing foo, bar")
        );
    }

    #[test]
    fn ends_with_exposing() {
        assert_eq!(
            Some(" blah, etc ".to_owned()),
            remove_exposing(" blah, etc exposing")
        );
    }

    #[test]
    fn exposing_surrounded() {
        assert_eq!(
            Some(" foo, bar  etc, blah ".to_owned()),
            remove_exposing(" foo, bar exposing etc, blah ")
        );
    }
}


/* Remove all the comments from the line,
   and also return whether we are still in a comment block.
*/
fn strip_comments(original_line: &str, original_block_comment_depth: u32) -> (String, u32) {
    let mut line = original_line;
    let mut block_comment_depth = original_block_comment_depth;

    loop {
        // Don't bother checking for "--" if we're inside a block comment; it means nothing there.
        if block_comment_depth == 0 {
            // We have a single line comment
            if let Some(single_line_comment_index) = line.find("--") {
                // We know these indices will be okay because we got them from find()
                unsafe {
                    line = line.slice_unchecked(0, single_line_comment_index);
                }

                continue;
            }
        }

        let block_comment_start = line.find("{-");
        let block_comment_end = line.find("-}");

        match (block_comment_start, block_comment_end) {
            // when there's a start and end
            (Some(start_index), Some(end_index)) => {
                let (first_index, second_index) = if end_index > start_index {
                    // this is the {- ... -} case
                    (start_index, end_index)
                } else {
                    // this is the -} ... {- case
                    (end_index, start_index)
                };

                // We know these indices will be okay because we got them from find()
                unsafe {
                    line = line.slice_unchecked(0, first_index);
                }

                // Subtract start_index because the line just got shorter by that much.
                let dest_index = (second_index + 2) - first_index;
                let line_length = line.len();

                // We know these indices will be okay because we got them from find()
                unsafe {
                    line = line.slice_unchecked(dest_index, line_length - dest_index);
                }
            }

            // when there's a start, but no end
            (Some(start_index), None) => {
                // We know these indices will be okay because we got them from find()
                unsafe {
                    line = line.slice_unchecked(0, start_index);
                }

                block_comment_depth += 1;
            }

            // when there's an end, but no start
            (None, Some(end_index)) => {
                let line_length = line.len();

                // We know these indices will be okay because we got them from find()
                unsafe {
                    line = line.slice_unchecked(end_index + 2, line_length);
                }

                block_comment_depth -= 1;
            }

            // when there are no block comment chars
            (None, None) => {
                if block_comment_depth > 0 {
                    // All of this is a comment, so throw it all out.
                    return ("".to_owned(), block_comment_depth);
                } else {
                    // None of this is a comment, so keep it all.
                    return (line.to_owned(), block_comment_depth);
                }
            }
        }
    }
}


#[cfg(test)]
mod test_strip_comments {
    use super::*;

    #[test]
    fn strips_inline_comments() {
        assert_eq!(
            ("module Foo ".to_owned(), 0),
            strip_comments("module Foo -- blah blah whatever ", 0)
        );
    }

    #[test]
    fn single_line_comment_inside_block_comment() {
        for depth in 1..3 {
            assert_eq!(
                ("".to_owned(), depth),
                strip_comments(" Foo -- single line comment inside block comment", depth)
            );
        }
    }

    #[test]
    fn nested_block_comment() {
        for depth in 1..3 {
            assert_eq!(
                ("".to_owned(), depth + 1),
                strip_comments(" Bar {- start of nested block comment", depth)
            );
        }
    }

    #[test]
    fn inside_block_comment() {
        for depth in 1..3 {
            assert_eq!(
                ("".to_owned(), depth),
                strip_comments("stuff inside block comment", depth)
            );
        }
    }

    #[test]
    fn end_of_block_comment() {
        let depth = 1;
        assert_eq!(
            (" bar baz".to_owned(), depth - 1),
            strip_comments("end of block comment -} bar baz", depth)
        );
    }

    #[test]
    fn end_of_nested_block_comment() {
        for depth in 2..3 {
            assert_eq!(
                ("".to_owned(), depth - 1),
                strip_comments("end of block comment -} bar baz", depth)
            );
        }
    }
}


// Returns whether it found and removed a module declaration
fn remove_module_declaration(line: &str) -> &str {
    if line.starts_with("module") {
        let start_index = 6;
        let end_index = line.len();
        unsafe { line.slice_unchecked(start_index, end_index) }
    } else if line.starts_with("port module") {
        let start_index = 11;
        let end_index = line.len();
        unsafe { line.slice_unchecked(start_index, end_index) }
    } else if line.starts_with("effect module") {
        let start_index = 13;
        let end_index = line.len();
        unsafe { line.slice_unchecked(start_index, end_index) }
    } else {
        line
    }
}

#[cfg(test)]
mod test_remove_module_declaration {
    use super::*;

    #[test]
    fn removes_module() {
        let line = "module Foo exposing (blah)".to_owned();

        assert_eq!(" Foo exposing (blah)", remove_module_declaration(&line));
    }

    #[test]
    fn removes_port_module() {
        let line = "port module Bar exposing (blah)".to_owned();

        assert_eq!(" Bar exposing (blah)", remove_module_declaration(&line));
    }

    #[test]
    fn removes_effect_module() {
        let line = "effect module Baz exposing (blah)".to_owned();

        assert_eq!(" Baz exposing (blah)", remove_module_declaration(&line));
    }

    #[test]
    fn does_nothing_if_no_module() {
        let line = "blah blah whatever".to_owned();

        assert_eq!("blah blah whatever", remove_module_declaration(&line));
    }
}

fn split_exposing(line: &str) -> HashSet<String> {
    match line.rfind(")") {
        Some(close_paren_index) => {
            // We know these indices will be okay because we got them from find()
            unsafe {
                line.slice_unchecked(0, close_paren_index)
                    .split(",")
                    .map(|string| string.trim().to_owned())
                    .collect::<HashSet<String>>()
            }
        }
        None => HashSet::new(),
    }
}

#[cfg(test)]
mod test_split_exposing {
    use super::*;

    #[test]
    fn none() {
        assert_eq!(
            vec![""]
                .into_iter()
                .map(|string| string.to_owned())
                .collect::<HashSet<String>>(),
            split_exposing("   )  ")
        );
    }

    #[test]
    fn one() {
        assert_eq!(
            vec!["one"]
                .into_iter()
                .map(|string| string.to_owned())
                .collect::<HashSet<String>>(),
            split_exposing("one ) ")
        );
    }

    #[test]
    fn two() {
        assert_eq!(
            vec!["one", "two"]
                .into_iter()
                .map(|string| string.to_owned())
                .collect::<HashSet<String>>(),
            split_exposing(" one , two ) ")
        );
    }

    #[test]
    fn three() {
        assert_eq!(
            vec!["one", "two", "three"]
                .into_iter()
                .map(|string| string.to_owned())
                .collect::<HashSet<String>>(),
            split_exposing(" one , two ,    three ) ")
        );
    }
}
