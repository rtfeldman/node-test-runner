module.exports = {
  singleQuote: true,
  proseWrap: 'never',
  overrides: [
    {
      files: '*.js',
      options: {
        parser: 'flow',
      },
    },
  ],
};
