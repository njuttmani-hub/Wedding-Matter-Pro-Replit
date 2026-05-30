---
name: Wedding Matter Pro — localStorage persistence constraint
description: Why order/photo persistence must surface quota failures and how upload images are stored
---

# Persistence is the whole backend

Wedding Matter Pro is frontend-only. ALL orders (typed + photo-upload) live in `localStorage` under `wmp_orders_v2`. There is no server.

## Rule: persistence writes must report success, not swallow errors
`saveOrders()` returns a boolean and `addOrder()` returns it; submit handlers must only show the success screen when the write succeeded, otherwise show a "storage full" toast.

**Why:** Upload-mode stores card-design + filled-form photos as compressed base64 JPEGs inline in the order. localStorage is ~5MB, so a handful of photos can exceed quota. An earlier version swallowed the `setItem` quota error silently, so the UI reported "submitted" while nothing was saved — the designer would never receive the order.

**How to apply:** Any new code path that writes orders must go through a save function that surfaces failure to the UI. Never wrap order saves in a silent `catch {}`.

## Image handling
Uploaded images are downscaled via canvas (`compressImage`, max ~1500px, JPEG ~0.72) before being stored as data URLs. Keep compression in place; raw uploads blow the quota almost immediately.

## Backward compatibility
`SubmittedOrder.mode: 'type' | 'upload'` was added later. `loadOrders()` migrates legacy orders missing `mode` by defaulting to `'type'`. Keep that defaulting if you ever tighten `mode` handling.
