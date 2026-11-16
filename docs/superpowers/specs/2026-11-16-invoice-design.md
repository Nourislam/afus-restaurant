# Phase 9 — The formal invoice (facture)

**Why.** A ticket and an invoice are two different documents in Algerian law. A
company that eats at the restaurant cannot deduct the meal with a till ticket: it
needs a *facture* carrying both parties' fiscal identity, its own sequential
number, the VAT broken out, and — a requirement people outside Algeria often miss
— **the total written out in words**. Until now the program could only print a
ticket, so the owner lost every business customer or wrote the invoice by hand.

## What an invoice carries that a ticket does not

| | Ticket | Invoice |
|---|---|---|
| Numbering | `A-<n>`, the order | its own unbroken series, `FA-<year>-<n>` |
| Seller | name, address | full identity: raison sociale, NIF, NIS, RC, AI |
| Buyer | — | name, address, and NIF / RC when it is a company |
| Lines | name, qty, amount | plus unit price excluding tax, and the taxable base |
| Tax | one "TVA (info)" line | base and amount per rate, and the rate itself |
| Total | the sum | HT, TVA, timbre, TTC — and **TTC written in words** |
| Paper | 80 mm roll | A4 |

## Decisions

1. **A series of its own.** Invoice numbers are sequential and unbroken, counted
   per year, and never reuse the order number. An order can be invoiced once; the
   second request returns the invoice already issued rather than a new one.
2. **Only a finished sale.** An invoice is issued against a completed order, so
   the figures it carries can never change afterwards. It snapshots the totals at
   the moment of issue rather than reading them back later.
3. **The amount in words is part of the document.** `amountToWords` writes the
   total in Arabic and in French, with the right dual and plural forms in Arabic
   and the French conventions Algeria uses (soixante-dix, quatre-vingts). It is
   tested on its own, because an invoice whose words disagree with its figures is
   worse than no invoice.
4. **The buyer is asked for, not guessed.** A company's NIF and RC are typed when
   the invoice is requested; if the order already has a customer, their name,
   address and phone are filled in and can be corrected.
5. **Kept, not regenerated.** The issued invoice is stored with its buyer and its
   totals so a reprint is always byte-identical, which is the whole point of a
   document that a tax inspector may ask for two years later.

## Schema (V7)

```
invoices(id, orderId UNIQUE, number, seq, year,
         buyerName, buyerAddress, buyerNif, buyerRc, buyerPhone,
         subtotalCents, discountCents, taxCents, stampCents, totalCents,
         taxRateBp, currency, issuedAt, userId)
```

## Tests

Numbering is sequential within a year and restarts the next; an order can only be
invoiced once; an unfinished order is refused; the document carries both
identities and the VAT split; and the words match the figures across the hard
cases — zero, one, two, eleven, seventy, eighty, a hundred, a thousand, and the
centimes.
