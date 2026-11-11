# Miner Control – Installation and Operation

A small dashboard for all AxeOS miners (LuckyAxe, Bitaxe …). It is **read-only**: nothing is changed on the miners. Miner settings are changed as usual in AxeOS via “OPEN ↗”.

Three ways to run it:

| Way | For whom |
|---|---|
| **A. Docker with Portainer** (chapters 1–3) | Home server with CasaOS/Portainer |
| **B. Without Docker on Linux** (chapter 10) | Raspberry Pi, Ubuntu, Debian … with systemd |
| **C. Without Docker on Windows** (chapter 11) | A Windows PC that runs anyway |

The interface comes in **German and English** (chapter 8). HTTPS for installing the app and for push messages works through **Tailscale** (chapter 9) but is optional.

---

## 1. Copy the files to the server

Using the **CasaOS file manager** (Files) or WinSCP, create these folders and upload the files. It is best to overwrite the whole `app` folder, so nothing is outdated after an update:

```
/DATA/AppData/minerdash/
└── app/
    ├── server.js
    ├── pool.js
    ├── push.js
    ├── scan.js            ← new: network search for miners
    └── public/
        ├── index.html
        ├── widget.html
        ├── i18n.js            ← translations (German / English)
        ├── sw.js
        ├── manifest.webmanifest
        └── icon-192.png, icon-512.png, apple-touch-icon.png, badge-96.png
```

The `data` folder is created by Docker on first start.

## 2. Create or update the stack in Portainer

1. Open Portainer → **Stacks** → **+ Add stack** (for an update: open the stack `minerdash` → **Editor**)
2. Name: `minerdash`
3. **Web editor**: paste the content of `casaos/docker-compose.yml`
4. **Deploy the stack** (for an update: **Update the stack**)

Portainer pulls the official `node:22-alpine` image once (about 50 MB). No other packages are needed.

The compose file now understands optional variables (table in chapter 4, template in `casaos/.env.example`). Without variables it behaves as before: same folders, port 18090, German.

## 3. Open it

- At home: `http://<server-IP>:18090`
- On the road via Tailscale: `http://<server-Tailscale-IP>:18090`

On first start the dashboard is empty → **⚙ SETTINGS** → add miners with name and IP (or more comfortably with **🔍 Scan network**, chapter 12) → **SAVE**. The cards appear after a few seconds; history fills up every minute from then on.

## 4. Good to know

| Topic | |
|---|---|
| Port in use? | Set the variable `MC_PORT` (or replace `18090` in the compose file) and redeploy the stack. If you use Tailscale through the stack, change the port in `casaos/tailscale/serve.json` too. |
| Update | Upload the `app` folder again, then **Restart** the container in Portainer. Reload the page / app once afterwards. |
| Data | `config.json` (settings), `history.json` (history), `store.json` (events, best diff, blocks), `pool-history.json`, `push.json` in the `data` folder. |
| Disk usage | about 2 MB per miner for 30 days of history. |
| Logs | Portainer → Containers → `minerdash` → **Logs**. |
| Security | The dashboard settings have no password. Use it only on the home network or via Tailscale, never expose it to the internet. |
| Matrix rain | Can be switched off under ⚙ SETTINGS (per browser). |

Variables of the compose file (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `MC_LANG` | `de` | Start language of a new installation (`de` or `en`) |
| `TZ` | `Europe/Berlin` | Time zone for dates and times in the log |
| `MC_PORT` | `18090` | Web port |
| `MC_DIR` | `/DATA/AppData/minerdash` | Base folder on the server |
| `CKPOOL_HOST_DIR` | `/home/you/ckpool` | ckpool folder (mounted read-only) |
| `COMPOSE_PROFILES` | – | `tailscale` switches on the optional Tailscale container (chapter 9) |
| `TS_AUTHKEY`, `TS_HOSTNAME` | – / `minerdash` | only for the Tailscale profile |

## 5. What is shown

- Totals: hashrate (with target), power, kWh and electricity cost per day/month, efficiency, best difficulty, blocks found, shares
- Hashrate history from 1 h to 30 days, total and per miner
- Per miner: hashrate, profile/OC (LuckyAxe), power, J/TH, frequency, core voltage, ASIC / VR temperatures, input voltage, fans, best diff, error rate, pools with accepted/rejected, uptime
- Events: block found, new best difficulty (each new one triggers its own notification), offline/online, warnings, for ckpool: worker connected / without shares as well as **ckpool stopped / running again** and **node not reachable / reachable again**
- Warnings (adjustable): ASIC and VR temperature, hashrate below target, offline, input voltage, overheat, fan stalled

## 6. Pool page (ckpool)

Switch between **MINER** and **POOL** at the top. The pool page reads ckpool's files **read-only**:

| Source | Content |
|---|---|
| `ckpool.conf` | node credentials, payout address, stratum port |
| `logs/pool/pool.status` | pool hashrate, shares, best share since last block |
| `logs/users/*` | all users and workers with name, hashrate, best share |
| `logs/ckpool.log` | solved blocks only (“Solved and confirmed block”) |
| Node (RPC) | block height, network difficulty, network hashrate |

The container runs in **host network mode** and mounts the ckpool folder read-only. The address stays `:18090`.
Block chance = expected time to a block at the current 1 h pool hashrate (statistics only). The BCH price comes from the Coinbase API, in the currency you chose for the electricity cost (EUR or USD).

If you don't run ckpool, just ignore the pool page.

## 7. Phone notifications (Web Push)

1. Open the app via an **HTTPS address** (chapter 9). Push does not work over `http://…:18090`.
2. ⚙ SETTINGS → “Phone notifications” → **Enable** → allow notifications.
3. Press **Test**; the test message should arrive right away.
4. Tick which events you want and press **SAVE**.

Messages are delivered through the browser's push service (Google on Android). The server needs internet access for this; the phone does not need Tailscale to receive them. Tapping a notification opens the app.
For reliable delivery, turn **battery optimisation off** for Chrome / the app in Android settings.
Each device is enabled separately. Keys are stored in `data/push.json`.

## 8. Language (German / English)

In the top right of the header there is **DE | EN**. One click switches the whole interface at once (cards, log, pool page, settings, widget).

- The choice applies to the **browser** and is also saved on the **server**, so **push messages** use the same language.
- New events in the log are translated when they are shown, so they can be read in either language. Events created before this update stay in German.
- The **widget** (`/widget`) follows the server language. With `/widget?lang=en` or `?lang=de` you can fix it for a single widget.
- To add another language: copy the `en` block in `app/public/i18n.js`, translate it and add the code to `LANGS`.

## 9. HTTPS with Tailscale (optional)

HTTPS is needed for **installing the app** on a phone and for **push**. Everything else works over `http://<IP>:18090` without it.

### Way 1: You already run Tailscale

Once, on the server, using your existing Tailscale container:

```
sudo docker exec tailscale tailscale serve --bg --https=8443 http://<server-IP>:18090
```

Then open `https://<servername>.<tailnet>.ts.net:8443`. Nothing else is needed.

### Way 2: Start Tailscale together with the stack

For everyone who has **no** Tailscale on the server yet. The stack then starts a second container that publishes the dashboard with HTTPS, only inside your tailnet.

1. In the Tailscale admin console (login.tailscale.com) switch on **MagicDNS** and **HTTPS Certificates** under **DNS** (once).
2. Create an **Auth key** under **Settings → Keys**.
3. Upload `casaos/tailscale/serve.json` to `/DATA/AppData/minerdash/tailscale/serve.json`.
4. In Portainer, under **Environment variables** of the stack, add:
   `COMPOSE_PROFILES` = `tailscale` and `TS_AUTHKEY` = your auth key.
5. **Update the stack**.
6. After about a minute a new device `minerdash` appears in the Tailscale admin console. Open `https://minerdash.<tailnet>.ts.net` (no port number).

The auth key is only needed on first start; afterwards the login is kept in `tailscale/state`. Without `COMPOSE_PROFILES=tailscale` this container never starts.
If you already use way 1, you don't need way 2, otherwise you get two entrances.

### Without Docker

If Tailscale is installed directly on the computer (Linux or Windows), one command is enough:

```
tailscale serve --bg --https=8443 http://127.0.0.1:18090
```

---

## 10. Without Docker: Linux

Requirement: **Node.js 18 or newer** (check with `node -v`). Nothing else is needed, there are no further packages.

Unpack the ZIP file, for example to `~/minerdash`.

**Quick try:**

```
cd ~/minerdash
./linux/start.sh
```

Then open `http://localhost:18090`. Data is stored in the `data` folder next to the program. Stop with **Ctrl+C**.

**Permanently as a service (systemd):**

```
cd ~/minerdash
sudo ./linux/install.sh
```

The script copies the program to `/opt/minerdash`, creates the user `minerdash` and starts the service at every boot. Afterwards:

| Topic | |
|---|---|
| Settings | `/etc/minerdash.env` (port, language, time zone, ckpool folder). After a change: `sudo systemctl restart minerdash` |
| Data | `/var/lib/minerdash` |
| Logs | `journalctl -u minerdash -f` |
| Update | unpack the new ZIP and run `sudo ./linux/install.sh` again (settings and data are kept) |
| Remove | `sudo systemctl disable --now minerdash && sudo rm /etc/systemd/system/minerdash.service` (data in `/var/lib/minerdash` stays until you delete it) |
| Firewall | if active: `sudo ufw allow 18090/tcp` |

**ckpool on the same machine:** enable the line `CKPOOL_DIR=/home/you/ckpool` in `/etc/minerdash.env`. The service must be allowed to read that folder. The easiest way is to install with your own user:
`sudo MC_USER=your-user ./linux/install.sh`

## 11. Without Docker: Windows

Requirement: **Node.js 18 or newer** (LTS version from nodejs.org, keep the defaults during installation).

1. Unpack the ZIP file, for example to `C:\minerdash`.
2. Double-click **`windows\start.bat`**. A window opens that has to stay open. Windows may ask for a firewall permission: allow it for **private networks**.
3. Open `http://localhost:18090` in the browser. From a phone: `http://<IP-of-the-PC>:18090`.

Data is stored in the `data` folder next to the program.

**Start automatically at login (without a window):** double-click `windows\autostart-on.bat`. Undo with `windows\autostart-off.bat`. This does not stop a running instance; to do that, end the `node.exe` process in Task Manager.

**Settings** (port, language, ckpool folder) are at the top of `windows\start.bat`. Remove the `rem ` in front of the matching line and change the value.

**Update:** unpack the new ZIP over the old folder, but do not delete the `data` folder. Then restart `windows\start.bat`.

Note: the pool page (ckpool) is meant for Linux. ckpool normally doesn't run on Windows, so the page shows “No ckpool found”; the miner page is not affected.

---

## 12. Find miners in the network

Under **⚙ SETTINGS** there is the button **🔍 Scan network** above the miner list.

1. Press the button. Without any input the server searches your own home network automatically (addresses `x.x.x.1` to `x.x.x.254`). This takes a few seconds.
2. A list appears: name, IP address, chip model and current hashrate. Miners you already added are greyed out.
3. Keep the new miners ticked or untick them, press **Add selected**, then **SAVE**.

Every device that answers `/api/system/info` like an AxeOS device is found (Bitaxe, LuckyAxe …). The scan is **read-only** and runs **only when you press the button**.

| Topic | |
|---|---|
| Another network | Enter a range in the field below the button, e.g. `192.168.2.0/24` (several separated by commas). Only private addresses are allowed, at most 1024 addresses (`/22`). |
| “No network detected” | Then enter the range yourself. This happens e.g. if the service runs in a Docker network without access to the home network. In the host mode of this stack the automatic search works. |
| Miner missing | It must be switched on, in the same network and reachable in a browser at `http://<IP>`. Some routers separate Wi-Fi and LAN (guest network): then enter the range of the other network. |

## 13. Electricity cost (euro or US dollar)

Under **⚙ SETTINGS → Electricity cost** enter the **price per kWh** (e.g. `0.32`) and choose the **currency** (EUR or USD). With `0` no costs are shown.

- The **Total Power** card then shows the cost per day and per month (30 days), calculated from the current power of all running miners.
- The widget shows the cost per day.
- On the pool page the reward (“Reward now”) is converted into the chosen currency.
- The costs are a projection from the current power, not a bill.

## 14. Push notifications on iPhone

> **⚠ NOT TESTED.** This chapter describes what Apple's rules require. It has not been tried on any iPhone (the developer uses Android). If something does not work, it is not necessarily your fault.

Requirements according to Apple:

1. **iOS / iPadOS 16.4 or newer.**
2. The page must be reachable over **HTTPS** (e.g. Tailscale `serve`, see the Tailscale chapter). Over `http://IP:18090` the iPhone gives no push messages.
3. Open the page **in Safari**, then **Share → Add to Home Screen**. Push only works in the installed app, not in a normal Safari tab.
4. Open the app **from the Home Screen**, Settings → enable push, confirm the permission, save.

Known uncertainty: the push identity contains a placeholder address (`mailto:miner-control@localhost.invalid` in `app/push.js`). If Apple rejects the registration because of it, enter a real email address there and restart.

## 15. Setting the ckpool folder (own path)

The **POOL** page only appears when the dashboard finds your ckpool. It looks for the file `logs/pool/pool.status` and reads `ckpool.conf` (which also holds the node login, section `btcd`). If it finds nothing, the POOL button is hidden. **Settings → Pool** shows which folder was searched.

It always means the folder that contains **`ckpool.conf`** and the subfolder **`logs`**, for example:

```
/home/you/ckpool/
├── ckpool.conf
└── logs/
    ├── ckpool.log
    ├── pool/pool.status
    └── users/...
```

How to set the path:

| Running as | Where | What |
|---|---|---|
| **CasaOS / Portainer** | stack → Environment variables | `CKPOOL_HOST_DIR` = your folder, e.g. `/home/you/ckpool`, then **Update the stack** |
| **Docker Compose** (`docker/`) | file `docker/.env` | line `CKPOOL_HOST_DIR=/home/you/ckpool`, then `docker compose up -d` |
| **Linux service** | `/etc/minerdash.env` | enable the line `CKPOOL_DIR=/home/you/ckpool`, then `sudo systemctl restart minerdash` |
| **Linux by hand** (`linux/start.sh`) | top of `start.sh` | remove `# ` in front of `export CKPOOL_DIR=…`, change the path |
| **Windows** (`windows\start.bat`) | top of `start.bat` | remove `rem ` in front of `set CKPOOL_DIR=…`, change the path |

Notes:

- With Docker the folder is always called `/ckpool` **inside the container**, so the settings show `/ckpool`. The real folder on the server comes from `CKPOOL_HOST_DIR`.
- The dashboard only needs **read access** to the folder. For the Linux service with its own system user, the easiest way is `sudo MC_USER=your-user ./linux/install.sh`.
- ckpool must have run at least once, otherwise `pool.status` does not exist yet.
- After the change the POOL button appears by itself on the next poll (a few seconds).
- Other pools (not ckpool) are not supported on the POOL page. The MINER page works with any pool.

## 16. Changing the colour

**Settings → Display → Colour:** green (default), amber, cyan or purple. When you pick one you see it at once as a preview; it is kept with **Save**, ✕ goes back.

- The colour applies to **this device only** (like the matrix rain). Phone and PC can look different.
- Warnings stay yellow/orange, errors red. With the amber theme warnings turn orange-red so they stand out from the main colour.
- **Widget:** uses the colour chosen in the dashboard if it runs in the same browser. Otherwise put the colour in the address: `/widget?theme=amber` (`green`, `amber`, `cyan`, `purple`), can be combined with `&lang=en`.

### BTC or BCH

The dashboard detects the coin automatically from the node (Bitcoin Cash Node, ABC, Flowee, bchd → **BCH**; Bitcoin Core, Knots → **BTC**). Price, the label at “Reward now” and the address display depend on it (CashAddr only on BCH). If the node is unreachable or unknown, the variable `MC_COIN` applies (e.g. `MC_COIN=BTC`), otherwise BCH.

## 17. Miner availability (uptime)

At the bottom of the MINER page the **Availability** box shows per miner:

- **24 h / 7 days / 30 days:** share of time the miner was hashing (green from 99 %, yellow from 95 %, otherwise red).
- **Outages**, the **longest** outage and **restarts** of the last 30 days.
- **Recent outages and restarts** with time – this shows patterns (always at the same time? all miners at once → rather power, router or Wi-Fi).

How it is counted (every minute gets one state):

| State | Meaning | counts as outage |
|---|---|---|
| hashing | answers and delivers hashrate | no |
| **offline** | no answer during the whole minute | yes |
| **not hashing** | answers, but delivers 0 or under 5 % of its target hashrate | yes |
| restart | up to 2 min after boot without hashrate, and the offline minutes right before the boot | no (left out) |
| paused | mining paused in AxeOS | no (left out) |
| unknown | the dashboard itself was not running | no (left out) |

**After a restart a miner gets 2 minutes** to start hashing. If it still does not hash after that, it counts as a “not hashing” outage from then on.

**Restarts** are detected from the miner's running time (it jumps back), even if the miner was hardly away or the dashboard was off at the time. They are also written to the event log, but **not** sent as push (a restart may be intentional).

Counting starts with version 1.5.0; earlier times are “unknown”. Data: `data/uptime.json`, 30 days.

## 18. LOG page – all entries of the last 30 days

At the top under **LOG** (next to MINER and POOL) you see all entries of the last 30 days.

- **Filters:** miner (all, one miner or pool), kind (outages, warnings, back online, restarts, blocks found, best difficulty) and period (24 h, 7 days, 30 days). The browser remembers your choice.
- **Overview:** a grid matching the period – 24 h (today and yesterday), 7 or 30 days (rows) by 24 hours (columns). Green = no outages, yellow = partly, red = mostly down, white dot = restart. With “All miners” the worst miner of each hour counts. This shows at a glance whether outages always happen at the same time.
- **Click an hour:** shows only the entries of that hour. Click again or the ✕ on the filter to see everything.
- **⬇ CSV:** downloads the entries shown as a table (opens in Excel or LibreOffice).

The event log is now kept for 30 days (at most 5000 entries) instead of only the last 300.

### Boot time after a restart

After every restart the dashboard measures **how long it takes until the miner hashes again** (accurate to about one poll interval). In the Availability box the **Boot** column shows the last value and below it the average of the last 30 days. If the last start was clearly slower than usual (at least 1.5 times as long and 15 s more, from 3 measurements on), it turns yellow. That way a miner that takes longer and longer to come back stands out.

The log then shows e.g. “Restart – hashing again after 48 s”. If a miner is still not hashing after 2 minutes: “Restart – no hashrate after 2 min”. If the restart was noticed late (miner unreachable for a while or dashboard off), the boot time cannot be measured; then it only says “Restart detected”.

### Event log on the MINER and POOL pages

The **Event Log** and **Pool Event Log** boxes only show as many of the newest entries as fit next to the box on the right, without their own scrollbar. All entries: the link **“All entries in LOG ›”** below – it opens the LOG page with the matching filter (on the pool page “Pool”).

### Miner pool changes in the log

The dashboard remembers which pool each miner is connected to and writes changes to the log:

| Entry | When | Push |
|---|---|---|
| connected to … | once, when a miner is polled for the first time (also after the update to 1.6.0) | no |
| **fallback pool active: … – main pool unreachable?** | the miner switched to its fallback pool | yes, under “warnings” |
| back on the main pool: … | back from the fallback | yes, under “back online” |
| **pool disconnected: …** / pool connected again: … | dual pool: one of the two pools loses the connection or is back | yes (“warnings” / “back online”) |
| pool changed: old → new | pool address changed in AxeOS | no |
| pool mode: Dual-Pool / 1 Pool | switched between one and two pools | no |

A change has to be seen on **two polls in a row** – a short hiccup creates no entry. The LOG page has the kind **“Miner pool changes”** for this. If the pool changes while the dashboard is off, it is added at the next start.

## 19. Support export (report for a manufacturer's support)

On the **LOG** page next to “CSV”: **🧾 Support export**. It takes the currently selected **miner and period** (also a clicked hour) and creates a report for a support ticket – **always in English**, so any support team can read it.

Content: dashboard version and time zone, per miner firmware, board revision, ASIC, current values, fans, pools, rejected shares, availability, boot times, the outages and restarts in the period, an **hour overview as a text graphic** and all log entries. The alert thresholds are at the end.

Before saving you see a **preview**. Checkboxes: **remove IP addresses** and **remove pool addresses** (both on), **replace miner names** (off). **Wallet addresses are always removed**, pool user names are never included. Then **Copy** (for a ticket form) or **Save as .txt** (to attach).
