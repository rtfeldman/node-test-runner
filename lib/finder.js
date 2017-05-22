var fs = require("fs-extra");

function readExposing(file){
  return new Promise(function(resolve, reject){
    // read 60 chars at a time. roughly optimal: memory vs performance
    var stream = fs.createReadStream(file, {encoding: 'utf8', highWaterMark: 8 * 60});
    var buffer = "";
    var parser = new Parser();

    stream.on('error', reject);

    stream.on('data', function(chunk){
        buffer += chunk;
        // when the chunk has a newline, process each line
        if (chunk.indexOf('\n') > -1){
            var lines = buffer.split('\n');

            lines.slice(0, lines.length - 1).forEach(parser.parseLine.bind(parser));
            buffer = lines[lines.length - 1];

            // end the stream early if we're past the exports
            // to save on memory
            if (parser.isDoneReading()){
                stream.destroy();
            }
        }
    });
    stream.on('close', function (){
      if (parser.getExposing().length === 0) return reject(filePath + " is missing a module declaration.");

      resolve(parser.getExposing());
    });
  });
}

var stripComments = function(line, isInComment) {
  while (true || line.length > 0){
    var startIndex = line.indexOf("{-");
    var endIndex = line.indexOf("-}");
    var singleLineComment = line.indexOf('--');

    if (singleLineComment > -1 && !isInComment){
      line = line.substr(0, singleLineComment);
      continue;
    }

    // when there's no comment chars
    if (startIndex === -1 && endIndex === -1) {
      return { 
        line: isInComment ? "" : line, 
        isInComment: isInComment
      };
    }
    // when there's a start and end
    if (startIndex > -1 && endIndex > -1) { 
      line = line.substr(0, startIndex) + line.substr(endIndex + 2);
      continue;
    }

    // when there's a start, but no end
    if (startIndex > -1 ) return { line : line.substr(0, startIndex), isInComment: true };
    
    // when there's an end, but no start
    if (endIndex > -1 && isInComment) return { line: line.substr(endIndex + 2), isInComment: false };
  } 
  return { line: "", isInComment: isInComment };
}


function Parser(){
  var moduleRead = false;
  var parsingDone = false;
  var isInComment = false;
  var isReadingModuleName = false;
  var isReadingExports = false;
  var isBetweenBrackets = false;
  var exposedFunctions = [];
  var openBracketsSeen = 0;
  var closedBracketsSeen = 0;
  var data = "";


  this.parseLine = function(line){
    if (parsingDone) return;
    
    var whereWeUpTo = stripComments(line, isInComment);
    isInComment = whereWeUpTo.isInComment;
    line = whereWeUpTo.line.trim();

    if (line.length == 0) return;

    if (!moduleRead &&
        (line.startsWith('module ')
            || line.startsWith('port module')
            || line.startsWith('effect module')
        )
    ) {
      moduleRead = true;
      // drop module from the line
      line = line.substr(line.indexOf('module') + 7).trim();
      isReadingModuleName = true;

      if (line.length === 0) {
        return;
      }
    } else if (moduleRead && line.indexOf('import ') === 0){
        parsingDone = true;
        return;
    } 

    if (!moduleRead) {
      parsingDone = true;
      return;
    }

    if (isReadingModuleName) {
      var exposingIndex = line.indexOf('exposing');

      if (exposingIndex === -1) return;

      line = line.substr(exposingIndex + 8).trim();
      isReadingModuleName = false;
      isReadingExports = true;

      if (line.length === 0) return;
    }

    if (isReadingExports) {
      var firstBracket = line.indexOf('(');

      if (firstBracket === -1) return;

      openBracketsSeen += 1;
      isReadingExports = false;
      isBetweenBrackets = true;
      line = line.substr(firstBracket + 1).trim(); 
    }

    if (isBetweenBrackets) {
      var newOpenBracketsSeen = line.split('(').length;
      var newCloseBracketsSeen = line.split(')').length;
      data += line;

      if (newCloseBracketsSeen + closedBracketsSeen === newOpenBracketsSeen + openBracketsSeen){
        exposedFunctions = data
          .substr(0, data.lastIndexOf(')'))
          .split(',')
          .map((str) => str.trim())
          .filter((str) => str[0].toLowerCase() === str[0]);
        parsingDone = true;
        return;
      }

      closedBracketsSeen += newCloseBracketsSeen;
      openBracketsSeen += newOpenBracketsSeen;
    }
  };

  this.isDoneReading = function() {
    return parsingDone;
  }

  this.getExposing = function() {
    return exposedFunctions;
  }

  return this;
}


module.exports = {
  readExposing: readExposing,
  stripComments: stripComments,
  Parser: Parser
};