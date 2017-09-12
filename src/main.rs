extern crate clap;
extern crate term;
use clap::{App, Arg};

fn main() {
    let version = "0.18.10";
    let args = App::new("elm-test")
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

    // Print the headline. Something like:
    //
    // elm-test 0.18.10
    // ----------------
    print_headline(version);

    // Validate CLI arguments
    let seed: Option<i32> = parse_or_die("--seed", args.value_of("seed"));
    let fuzz: Option<i32> = parse_or_die("--fuzz", args.value_of("fuzz"));

    println!("Value for seed: {}", seed.unwrap_or(9).to_string());
    println!("Value for fuzz: {}", fuzz.unwrap_or(9).to_string());
}

// Turn the given Option<&str> into an Option<i32>, or else die and report the invalid argument.
fn parse_or_die(arg_name: &str, val: Option<&str>) -> Option<i32> {
    return val.map(|str| match str.parse::<i32>() {
        Ok(num) => num,
        Err(_) => {
            println!("Invalid {} value: {}", arg_name, str);
            ::std::process::exit(1);
        }
    });
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
