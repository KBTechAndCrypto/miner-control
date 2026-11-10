# Miner Control – Quick start for beginners

**You don't need to write any code.** You download a file, unzip it and start it with a double-click. This guide shows the easiest way step by step with a **Windows PC** (about 10 minutes). **Ubuntu/Linux, Raspberry Pi, Docker and CasaOS** are further down under “Other systems”.

---

## How it works

- Miner Control is a small program that runs on a **computer in your home network** (Windows PC, mini PC, server, Raspberry Pi …). That computer polls your miners regularly.
- **Your phone is just the display.** You open Miner Control in the browser (Chrome) – on the PC or on the phone.
- To keep the values up to date and get notifications, the computer has to **stay switched on** while you want to use Miner Control.
- Miner Control **only reads** and never changes anything on your miners.

## What you need

- A **Windows PC** in the **same network** (same router) as your miners
- Your miners running **AxeOS** (Bitaxe, NerdQaxe & co.)
- About 10 minutes

---

## Step 1: install Node.js (once)

1. Open **https://nodejs.org**.
2. Download the **“LTS”** version.
3. Install it: just click **Next** every time, don't change anything.

## Step 2: download Miner Control

1. Open **https://github.com/KBTechAndCrypto/miner-control/releases**.
2. At the top entry (“Latest”) under **Assets**, click **“Source code (zip)”**.
3. Right-click the ZIP file → **“Extract All”**, for example to `Documents\miner-control`.

## Step 3: start it

1. In the extracted folder, open the subfolder **`windows`**.
2. Double-click **`start.bat`**.
3. A **black window** opens – that is Miner Control. **Keep it open** (minimising is fine). If you close it, Miner Control stops.
4. If Windows asks about the **firewall**: allow it for **“Private networks”**. That is needed so your phone can reach it.

## Step 4: open it in the browser and add your miners

1. On the PC open **http://localhost:18090** in the browser.
2. Top right: **⚙ Settings**.
3. **“🔍 Scan network”** – your miners are found. Tick the ones you want, click **“Add selected”**, then **Save** at the bottom.
   (Or **“+ Add miner”** and type the miner's IP address.)
4. Done – after a few seconds your miners appear.

At the top right you can switch between **DE** and **EN**.

## Step 5: view it on your phone

1. Find out the PC's address in your network: Start menu → type **`cmd`** → Enter → type **`ipconfig`** → next to **“IPv4 Address”** it says e.g. `192.168.1.20`.
2. On the phone (on the **same Wi-Fi**) open in Chrome: **`http://192.168.1.20:18090`** (use your address).

**On the go (mobile data), installing it as an app and push notifications** need a secure connection (HTTPS). That works for free with **Tailscale** – see the guide, chapter 9. You don't need it to get started.

## Step 6 (optional): start automatically with Windows

In the `windows` folder, double-click **`autostart-on.bat`** once. Miner Control then starts invisibly in the background after every Windows start. To undo: **`autostart-off.bat`**.

---

## Other systems (instead of Windows)

In every case: afterwards open **`http://<computer-address>:18090`** in the browser and add your miners as in **step 4**. On Linux the command `hostname -I` shows the computer's address (the first number).

### A) Ubuntu / Debian / Raspberry Pi OS – without Docker

Open a terminal (or connect via SSH) and type line by line:

```
sudo apt update
sudo apt install -y nodejs unzip wget
node -v
```

If `node -v` shows **v18 or higher**, you're fine (Ubuntu 24.04 and Raspberry Pi OS Bookworm are). On older versions (e.g. Ubuntu 22.04 shows v12):

```
sudo snap install node --classic
```

Then download Miner Control and set it up as a service (starts automatically, also after a reboot):

```
cd ~
wget -O miner-control.zip https://github.com/KBTechAndCrypto/miner-control/archive/refs/heads/main.zip
unzip miner-control.zip
cd miner-control-main
sudo bash linux/install.sh
```

At the end the script shows the address, e.g. `http://192.168.1.50:18090`. Just trying it without a service: instead of the last line run `bash linux/start.sh` (runs until you press **Ctrl+C**).

### B) Docker (Linux)

Install Docker if you don't have it yet:

```
curl -fsSL https://get.docker.com | sudo sh
```

Then:

```
cd ~
wget -O miner-control.zip https://github.com/KBTechAndCrypto/miner-control/archive/refs/heads/main.zip
unzip miner-control.zip
cd miner-control-main/docker
cp .env.example .env
sudo docker compose up -d
```

Done – the container now starts automatically. Change language, time zone or ckpool folder in the `.env` file if needed (then run `sudo docker compose up -d` again).

### C) CasaOS with Portainer

1. In the **CasaOS file manager** (Files) create the folder **`/DATA/AppData/minerdash`** and upload the **`app`** folder from the ZIP into it. Result: `/DATA/AppData/minerdash/app/server.js` etc.
2. Open **Portainer** → **Stacks** → **Add stack** → name `minerdash`.
3. In the **Web editor** paste the content of **`casaos/docker-compose.yml`**.
4. Click **Deploy the stack**.

Your own ckpool? Under **Environment variables** set `CKPOOL_HOST_DIR` = your ckpool folder. Without ckpool just leave it.

### D) Mac

Install Node.js from **nodejs.org**, unzip, change to the folder in Terminal and run `bash linux/start.sh`. **Not tested.**

### Updates

Download the new version and replace the **`app`** folder (on Linux run `sudo bash linux/install.sh` again, with Docker replace the files and run `sudo docker compose up -d`). Your settings and data are kept (`data` folder).

---

## FAQ

**Do I need to code?**
No. Download, unzip, double-click `start.bat`.

**Does it run on the phone alone?**
No – the program needs a computer that keeps running. The phone only shows it.

**Does Miner Control change anything on my miners?**
No, it only reads. You still change miner settings in AxeOS (button “Open ↗” on each miner).

**Does it cost anything?**
No, it's free and open source.

**Does it work without Windows?**
Yes – see “Other systems” above: Ubuntu/Linux, Raspberry Pi, Docker, CasaOS. Mac is untested.

**I don't see my miners.**
PC and miners must be in the same network. For the scan it helps to enter the range yourself, e.g. `192.168.1.0/24`. Or enter the miner's IP directly (shown on the miner's display or in your router).

**Security:** the settings have no password. Use Miner Control only in your home network or via Tailscale – **never** expose it to the internet with port forwarding.

Full guide: [`Guide_EN.md`](Guide_EN.md)
