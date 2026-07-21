/**
 * We used to use `xmlbuilder@15.1.1` from npm to generate XML.
 * However, we only used a tiny fraction of that package.
 * This file implements only the bits we need.
 *
 * This function takes an object that describes XML.
 * You can specify element names, attributes, text and nested elements.
 *
 * NOTE: Element names and attribute names are assumed to be valid.
 * Attribute values and text are escaped.
 *
 * Example input:
 *
 *     {
 *         "plain": "text content", // <plain>text content</plain>
 *         "rich": {
 *             "@my-attr": "my value", // <rich my-attr="my value">
 *             "nested": "text", // <nested>text</nested> (nested under <rich>)
 *             "child": [
 *                 { name: "John" }, // <child><name>John</name></child> (nested under <rich>)
 *                 { name: "Jane" }, // <child><name>Jane</name></child> (nested under <rich>)
 *             ],
 *         },
 *     }
 *
 * @typedef { { [key: string]: XmlValue } } Xml
 * @typedef { string | number | Array<Xml> | Xml } XmlValue
 *
 * @param { Xml } xml
 * @returns { string }
 */
function toString(xml) {
  const string = Object.entries(xml)
    .map(([key, value]) => {
      if (key.startsWith('@')) {
        throw new Error(
          `Attributes cannot be set at the top level. Key: ${JSON.stringify(
            key
          )}`
        );
      }
      return xmlValueToString(key, value);
    })
    .join('');
  return '<?xml version="1.0"?>' + string;
}

/**
 * @param { string } elementName
 * @param { XmlValue } xmlValue
 * @returns { string }
 */
function xmlValueToString(elementName, xmlValue) {
  if (Array.isArray(xmlValue)) {
    return xmlValue
      .map((value) => xmlValueToString(elementName, value))
      .join('');
  }

  const attributes =
    typeof xmlValue === 'object'
      ? Object.entries(xmlValue).flatMap(([key, value]) => {
          if (!key.startsWith('@')) {
            return [];
          }
          const escapedValue = xmlValueToAttributeValue(key, value);
          return `${key.slice(1)}="${escapedValue}"`;
        })
      : [];

  const attributesString =
    attributes.length === 0 ? '' : ' ' + attributes.join(' ');

  const childrenString =
    typeof xmlValue === 'object'
      ? Object.entries(xmlValue)
          .flatMap(([key, value]) =>
            key.startsWith('@') ? [] : xmlValueToString(key, value)
          )
          .join('')
      : typeof xmlValue === 'string'
      ? escapeText(xmlValue)
      : xmlValue.toString();

  return childrenString === ''
    ? `<${elementName}${attributesString}/>`
    : `<${elementName}${attributesString}>${childrenString}</${elementName}>`;
}

/**
 * @param { string } key
 * @param { XmlValue } xmlValue
 * @returns { string }
 */
function xmlValueToAttributeValue(key, xmlValue) {
  switch (typeof xmlValue) {
    case 'string':
      return escapeAttributeValue(xmlValue);
    case 'number':
      return xmlValue.toString();
    default:
      throw new Error(
        `Attribute values must be strings or numbers. Key: ${JSON.stringify(
          key
        )}. Value: ${JSON.stringify(xmlValue)}`
      );
  }
}

// https://github.com/oozcitak/xmlbuilder-js/blob/ce625aeb9f52d1f75d5d94260794d3b5fd74a8b1/src/XMLStringifier.coffee#L119
const invalidCharRegex =
  // eslint-disable-next-line no-control-regex
  /[\0-\x08\x0B\f\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;

/**
 * @param { string } string
 * @returns { string }
 */
function escapeAttributeValue(string) {
  return (
    string
      .replace(invalidCharRegex, invalidCharReplacement)
      // https://github.com/oozcitak/xmlbuilder-js/blob/ce625aeb9f52d1f75d5d94260794d3b5fd74a8b1/src/XMLStringifier.coffee#L179-L184
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;')
      .replace(/\t/g, '&#x9;')
      .replace(/\n/g, '&#xA;')
      .replace(/\r/g, '&#xD;')
  );
}

/**
 * @param { string } string
 * @returns { string }
 */
function escapeText(string) {
  return (
    string
      .replace(invalidCharRegex, invalidCharReplacement)
      // https://github.com/oozcitak/xmlbuilder-js/blob/ce625aeb9f52d1f75d5d94260794d3b5fd74a8b1/src/XMLStringifier.coffee#L166-L169
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r/g, '&#xD;')
  );
}

/**
 * Some characters are invalid in XML, like backspaces. In an attempt to
 * retain useful information in the output, we try and output a
 * hex-encoded unicode codepoint for the invalid character. For
 * example, the start of a terminal escape (`\u{001B}` in Elm) will be output as a
 * literal `\u{001B}`.
 *
 * @param { string } char
 * @returns { string }
 */
function invalidCharReplacement(char) {
  return `\\u{${(char.codePointAt(0) || 0).toString(16).padStart(4, '0')}}`;
}

module.exports = {
  toString,
};
