# Spin to Win and Prize Verification

[Complete repository directory tree](docs/DIRECTORY.md)

**Public route and integration guide.** Let a participant identify where to play and where to verify a code.

### Setup and usage

Use Node.js 24 for the included checks.

```sh
node --test tests/routes.test.mjs
```

Review the public verification flow. 

### Developer entry points

The shipped website router defines distinct play and verification pages. The public integration guide projects those two paths from the observed client. Prize allocation, staff actions and redemption records belong upstream. Explore `src/`, `tests/` in the full tree.

### Verification

The commands below ran in a clean test context using local files and fixtures.

```sh
node --test tests/routes.test.mjs
```

### Release scope

The original spin engine and prize records were unavailable. No redemption, prize funding or availability was verified. Publicly served main-site JavaScript verified on November 25. The asset URL and SHA-256 are recorded in src/routes.json. The manifest and tests are newly authored.

[Technical whitepaper](docs/WHITEPAPER.md) · [Marketing and sales plan](docs/MARKETING.md) · [Dated developer log](docs/BUILD-LOG.md)

Existing asset and code terms remain applicable. Public access to a recording, illustration, brand or manuscript does not itself grant commercial reuse rights.
