# Legacy Write Guard

`createScritturaContabile` is legacy/deprecated and must not be used for new accounting writes.

Manual registrations must pass through the guided canonical flow.

Before merging accounting changes, run the static guard script:

`node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs`

If the guard reports forbidden call sites, the change must be redirected to the guided path before commit.