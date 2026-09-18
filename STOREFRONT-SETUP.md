# Storefront skeleton

The interface, cart, PayPal order flow, and D1 order storage are built. Inventory is intentionally empty.

Add products later in `store-catalog.js`. Paid products use a `priceKey`; inquiry products use `inquiryUrl`.

Before payments: set price variables, save `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` as Cloudflare secrets, use `PAYPAL_ENV=sandbox`, test a purchase, confirm it in D1 `store_orders`, then switch to `live`.

Never place the PayPal secret in HTML, browser JavaScript, GitHub, or `wrangler.jsonc`.
