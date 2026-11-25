# November 25, 2026 · Spin to Win and Prize Verification

**Question.** Let a participant identify where to play and where to verify a code.

**Source and change.** Publicly served main-site JavaScript verified on November 25. The asset URL and SHA-256 are recorded in src/routes.json. The manifest and tests are newly authored.

**Observed result.** The commands below ran in a clean test context using local files and fixtures.

```sh
node --test tests/routes.test.mjs
```

**Next acceptance check.** A developer can validate both public route shapes from the fixture without creating a spin or redeeming a code.

**Owner and decision.** Chance owns the public release and approves campaign copy. The original spin engine and prize records were unavailable. No redemption, prize funding or availability was verified.

This dated record describes the developer package. Verify remote commit and tree in the publication receipt before announcing a GitHub release.
