# Spin to Win and Prize Verification
## Whitepaper · public developer edition

**November 25, 2026 · Original promotion source and public route guide**

### Goal and audience

Let a participant identify where to play and where to verify a code. The immediate audience is community event organizers and developers.

### Design and implementation

The portfolio includes original participant-side wheel and verification components, the campaign and claim model, and a separate public route manifest. The services depend on the main website database and permissions. A verifier can accept a code without exposing the private inventory or the person who claimed it. Keep the public URLs documented independently of staff workflows.

### What a contributor can establish

The commands below ran in a clean test context using local files and fixtures. An observed route string shows the client has a destination. A real promotion needs tested terms, inventory and redemption handling before launch.

### Evidence and outstanding work

Original promotion logic and schema were inspected. No live draw, participant data, prize inventory, redemption or commercial availability was verified. The next acceptance case is concrete. A developer can validate both public route shapes from the fixture without creating a spin or redeeming a code.

### Place in POTIFY

Assess interest in one sponsored event after funding, fulfillment, eligibility and terms are confirmed. Count sponsor revenue only on a reconciled invoice. The marketing plan gives the test window and the evidence for a commercial outcome.

[Source provenance](source.json) · [Build log](BUILD-LOG.md) · [Marketing plan](MARKETING.md)
