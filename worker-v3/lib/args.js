function getArgValue(name, argv = process.argv) {
  const prefix = `--${name}=`;
  const value = argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(`--${name}`);
}

module.exports = {
  getArgValue,
  hasFlag,
};
