extern crate clap;
extern crate term;
use clap::{App, Arg};

fn main() {
    let version = "0.18.10";
    let matches = App::new("elm-test")
        .version(version)
        .arg(
            Arg::with_name("seed")
                .short("s")
                .long("seed")
                .value_name("SEED")
                .help("Run with initial fuzzer seed")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("fuzz")
                .short("f")
                .long("fuzz")
                .value_name("FUZZ")
                .help("Run with each fuzz test performing this many iterations")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("TESTFILES")
                .help("Run TESTFILES, for example ")
                .index(1),
        )
        .get_matches();

    print_headline(version);
}

// prints something like this:
//
// elm-test 0.18.10
// ----------------
fn print_headline(version: &str) {
    let headline = String::from("elm-test ") + version;
    let bar = "-".repeat(headline.len());

    println!("\n{}\n{}\n", headline, bar);
}
