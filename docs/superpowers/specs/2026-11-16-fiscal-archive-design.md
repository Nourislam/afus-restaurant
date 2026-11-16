# Phase 11 — The sealed yearly archive

**Why.** The publisher attestation pack (Phase 5) proves the program *keeps* its
records honestly: sales are sealed into a hash chain, the audit log is chained,
and a day can be closed. What it could not do is **put a year away**. An
inspection may ask for 2026 two years later, by which time the shop has changed
its machine, its printer and maybe its software. A year has to leave the program
as one file that can be stored anywhere, that nobody can read without the
restaurant's own key, and that proves on opening that nothing in it moved.

## The file

One JSON envelope, with a **clear head and a sealed body**:

```jsonc
{
  "format": "afus-fiscal-archive", "version": 1,
  "year": 2026, "createdAt": "...",
  "restaurant": { "name": "...", "legalName": "...", "nif": "...", "rc": "..." },
  "counts": { "sales": 4120, "auditRows": 9887, "closures": 365 },
  "kdf":    { "name": "scrypt", "N": 16384, "r": 8, "p": 1, "salt": "…" },
  "cipher": { "name": "aes-256-gcm", "iv": "…", "tag": "…" },
  "payloadSha256": "…",
  "payload": "…"            // the year itself, encrypted
}
```

The head stays readable **on purpose**: an inspector holding a folder of files
must be able to see which restaurant and which year each one is, and how many
records it claims, without anybody's key. Everything that is actually commercial
— the sales, the audit trail, the closures — is inside the body.

- **Key**: scrypt over a passphrase the owner chooses, with a per-file salt. The
  passphrase is never stored; losing it loses the archive, which is said plainly
  in the screen and in the attestation.
- **Seal**: AES-256-GCM. Its tag means a single flipped byte is caught on
  opening, and `payloadSha256` lets the plaintext be checked independently once
  decrypted.
- **Contents**: every sealed sale of the year with its fiscal number and chain
  hashes, the audit rows, the closures, and the fiscal identity as it stood —
  so the document can be read without the program that wrote it.

## Verifying

`verifyArchive(file, passphrase)` opens it and answers four questions: does the
tag hold, does the plaintext hash match, is the sales chain inside unbroken, and
does the row count agree with the head. Any no is reported with what failed —
never a bare false.

## Tests

A round trip returns the year's own sales and nothing from another year; a wrong
passphrase fails cleanly rather than throwing something raw; a single flipped
byte in the body is caught; a changed count in the clear head is caught; and the
inner chain is verified rather than trusted.
