# Changelog

## 1.5.0 – 2026-11-09
- Availability per miner: uptime % for 24 h / 7 / 30 days, outages (offline / not hashing), longest outage, restarts, list of recent outages and restarts. Restarts are logged, not pushed. New file `app/uptime.js`. Idea by Rax Mining – thanks!
- New LOG page: all events of the last 30 days, filter by miner / kind / period, 30-day hour grid (click an hour to see its entries), CSV download. Event log kept for 30 days.
- 2-minute grace after a miner restart before "not hashing" counts as an outage; more robust restart detection.


## 1.4.2 – 2026-11-09
- Fix: push notifications for workers whose names differ only by a number (e.g. `Rental` / `Rental2`) were dropped by the cooldown. The cooldown now separates messages by name, only measured values are ignored.

## 1.4.1 – 2026-11-08
- Coin is detected from the node (Bitcoin Cash Node etc. → BCH, Bitcoin Core / Knots → BTC): correct price, label and address display for BTC ckpools. Fallback: `MC_COIN`.

## 1.4.0 – 2026-11-08
- Colour themes: green (default), amber, cyan, purple, chosen per device; widget accepts `?theme=`.

## 1.3.1 – 2026-11-08
- POOL page is hidden when no ckpool is found; settings show the searched folder.
- Guide: how to set the ckpool path on every platform.

## 1.3.0 – 2026-11-08
- Project split into platform folders: `docker/`, `casaos/`, `linux/`, `windows/`, `docs/`.
- README, `.gitignore`.

## 1.2.2 – 2026-11-08
- Notifications when ckpool stops / runs again and when the node is unreachable / reachable again.
- Every new best difficulty / best share now sends its own push message.
- Guide: iPhone push (untested).

## 1.2.0
- Network scan for AxeOS miners.
- Electricity cost per day and month in EUR or USD; coin price in the chosen currency.

## 1.1.0
- Interface switchable between German and English (also push texts and widget).
- Optional Tailscale (HTTPS) as a Docker Compose profile.
- Running without Docker: Linux (start script, systemd installer) and Windows (start script, autostart).

## 1.0.0
- First version: miner page, pool page for ckpool, alerts, event log, PWA, web push, widget.
