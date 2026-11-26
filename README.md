# Spin to Win and Prize Verification

[Complete repository directory tree](docs/DIRECTORY.md)

## The wheel stops. What can a participant verify?

A spinning wheel is the easy part to recognize. The hard part comes afterward, when someone has a code and wants to know what it means. This project keeps the participant’s view, the verification route and the organizer’s responsibilities distinct.

The [public route manifest](src/routes.json) lists the wheel, verification entry and code-specific route. The [participant verification component](reference/pages/spin-verify.tsx) shows the other side of the handoff. A route string cannot establish available prizes, an active event or a completed redemption.

Trace a fictional code through the source and point out the first place a participant could confuse ‘code recognized’ with ‘prize delivered.’ A wording correction is useful here without launching a draw or exposing anyone’s claim.

**Original promotion source and public route guide.** Let a participant identify where to play and where to verify a code.

### Setup and usage

Use Node.js 24 for the included checks.

```sh
node --test tests/routes.test.mjs
```

Review the public verification flow. 

### Developer entry points

The portfolio includes original participant-side wheel and verification components, the campaign and claim model, and a separate public route manifest. The services depend on the main website database and permissions. Explore `reference/`, `src/`, `tests/` in the full tree.

### Verification

The commands below ran in a clean test context using local files and fixtures.

```sh
node --test tests/routes.test.mjs
```

### Release scope

Original promotion logic and schema were inspected. No live draw, participant data, prize inventory, redemption or commercial availability was verified. Publicly served main-site JavaScript verified on November 25. The asset URL and SHA-256 are recorded in src/routes.json. The manifest and tests are newly authored. Original display components, verification page, promotion and welcome-spin services, plus the schema, recovered from potify-website main at b40b28683e548a04619f1e018814dd91aec1256d. No runtime data exported.

[Technical whitepaper](docs/WHITEPAPER.md) · [Marketing and sales plan](docs/MARKETING.md) · [Dated developer log](docs/BUILD-LOG.md)

Existing asset and code terms remain applicable. Public access to a recording, illustration, brand or manuscript does not itself grant commercial reuse rights.
