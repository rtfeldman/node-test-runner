function passThrough() {
  return {PATH: process.env.PATH, ELM_HOME: process.env.ELM_HOME};
};

module.exports = { passThrough: passThrough };
