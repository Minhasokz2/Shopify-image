# Firestore composite indexes

Firestore auto-creates single-field indexes but requires manual composite indexes for any query
that combines an equality filter with `orderBy`, or uses more than one equality/`in` filter. The
queries in this app that need one (create these in the Firebase console under
Firestore Database → Indexes, or via `firebase deploy --only firestore:indexes` with a
`firestore.indexes.json` once this app has a Firebase CLI project set up):

| Collection | Fields | Used by |
|---|---|---|
| `jobs` | `shopDomain` ASC, `status` ASC, `createdAt` DESC | `jobsRepo.findByShop({ status })` — Job History filtered by status |
| `jobs` | `shopDomain` ASC, `contentType` ASC, `createdAt` DESC | `jobsRepo.findByShop({ contentType })` — Job History filtered by content type |
| `jobs` | `shopDomain` ASC, `batchId` ASC, `createdAt` DESC | `jobsRepo.findByShop({ batchId })` — jobs within one batch |
| `jobs` | `shopDomain` ASC, `status` IN | `jobsRepo.findActiveByShop` — active-job admission control fallback |
| `status` (single field, `IN`) | — | `jobsRepo.findResumable` — boot-time resume query |
| `batches` | `shopDomain` ASC, `createdAt` DESC | `batchesRepo.findByShop` — Bulk Queue page |
| `products` | `shopDomain` ASC | `productsRepo.findByShop` — cached catalog read |
| `conversion_jobs` | `shopDomain` ASC, `createdAt` DESC | `conversionJobsRepo.findByShop` — Compress Image → Conversion History page |
| `conversion_batches` | `shopDomain` ASC, `createdAt` DESC | `conversionBatchesRepo.findByShop` — Compress Image bulk batch progress |

Firestore will surface a direct "create this index" console link in the error message the first
time an unindexed composite query runs in production — the table above is a heads-up so those
don't come as a surprise during the first real usage of each page, not an exhaustive guarantee.
