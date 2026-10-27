# Changelog

## Unreleased (2026-10-27)

### Fixed
- The CLI rejects unknown options with exit code 64. Before this, a typo such as `--nmae Mothership`
  was quietly taken as an unknown option and the check went ahead without the name.
- `firsthour verify` refuses a `--verified` file larger than 1 MB instead of reading all of it into
  memory. Usage errors raised while reading the file are no longer reported as "cannot read".
- Tests are in `test/cli.test.js`.
