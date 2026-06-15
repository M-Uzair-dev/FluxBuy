# FluxBuy: Drop Purchase Flow (Naive Version) — Design

## Context

FluxBuy is a drop-based flash-sale marketplace. The auth phase is complete. This
design covers the core domain: products with a scheduled drop time/quantity, and
the purchase flow that handles stock holding + a mock payment service.

This is the **naive** version, deliberately built without proper concurrency
control. It is meant to be stress-tested later to surface an overselling race
condition, which will then be fixed in a separate "reinforce" design pass.

## Entities

### Product

- `id` (uuid)
- `sellerId` (FK → User)
- `name`, `description`
- `price`
- `quantity` (Int) — current available stock, decremented on purchase
- `dropAt` (DateTime) — when the product becomes purchasable

### Order

- `id` (uuid) — doubles as the idempotency key passed to the payment service
- `userId` (FK → User, buyer)
- `productId` (FK → Product)
- `quantity` (Int) — units purchased in this order
- `totalAmount` — price × quantity, snapshotted at order-creation time (so later
  price changes don't retroactively affect existing orders)
- `status`: enum `OrderStatus { PENDING, PAID, FAILED }`

Payment status is folded into `Order.status` rather than a separate `Payment`
table — avoids a join, and the three states cover the full naive lifecycle. A
separate `Payment` table would earn its keep if we need to track multiple
payment *attempts* per order (future "reinforce" phase).

## Idempotency

Two distinct concerns:

1. **Backend ↔ Payment service**: `Order.id` is passed to
   `PaymentService.charge(orderId, amount)` as an idempotency key. If the call to
   the payment service is retried, the payment service can recognize it's already
   processed that order and return the same result rather than double-charging.
   Handled in this design.
2. **Client ↔ Backend** (double-click / request retry creating two separate
   Orders): NOT handled in this naive version — intentionally deferred to the
   "reinforce" phase as something to discover via stress testing.

## Stock holding

Direct decrement on `Product.quantity`. On payment failure, the held quantity is
added back.

**Intentional flaw**: the check-then-decrement (`read quantity → check >=
requested → write quantity - requested`) is two separate DB operations, not
atomic. Under concurrent load this allows overselling — multiple requests can
pass the check before any of them writes. This is left as-is on purpose; it's
the target of a future stress test + fix.

## Mock payment service

In-process `PaymentService.charge(orderId, amount): Promise<{ status: 'success'
| 'failed' }>`.

- `await sleep(randomDelay)` — configurable via env vars
- Randomly resolves/rejects based on a configurable failure rate — also via env
  vars

Designed so a future swap to a real out-of-process service is a drop-in
replacement behind the same interface — not attempted now (deferred until
microservices are covered).

## Buy flow (`POST /products/:id/buy`)

Body: `{ quantity }`.

1. **Validate**: product exists, `dropAt <= now` (drop is live), `quantity > 0`,
   `product.quantity >= requested`
2. **Transaction 1** (DB-only, fast):
   - `product.quantity -= requested`
   - create `Order { status: PENDING, ... }`
3. **Outside any transaction**: `await paymentService.charge(order.id,
   order.totalAmount)`
4. **Transaction 2** (DB-only, fast):
   - success → `order.status = PAID`
   - failure → `order.status = FAILED`, `product.quantity += requested` (restore
     stock)
5. Return `{ success, order }`

**Why split into two transactions?** Step 3 can take seconds and might fail.
Holding a DB transaction (and its row locks) open across that wait would be
terrible for concurrency — so the "reservation" is committed first, the slow
external call happens with no locks held, and the "outcome" is committed
afterward.

## Build order

1. Prisma schema — `Product`, `Order` models + `OrderStatus` enum, migrate
2. Product module — CRUD: `POST /products`, `GET /products`, `GET /products/:id`
3. Payment module — `PaymentService.charge(orderId, amount)` with configurable
   delay/failure rate
4. Order module — `POST /products/:id/buy` implementing the buy flow above
5. Manual testing — happy path + forced-failure path (set failure rate to 100%
   temporarily)
6. Later — concurrent stress-test script to trigger the overselling bug, then
   fix it (separate design pass)

## Out of scope (deferred to "reinforce" phase)

- Client-side request idempotency (double-click / retry protection)
- Atomic stock decrement (the overselling fix)
- Separate `Payment` table for multi-attempt tracking
- Out-of-process payment service / microservices
