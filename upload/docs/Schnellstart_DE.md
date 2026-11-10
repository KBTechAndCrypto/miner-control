# Miner Control – Schnellstart für Einsteiger

**Programmieren musst du nichts.** Du lädst eine Datei herunter, entpackst sie und startest sie mit einem Doppelklick. Diese Anleitung zeigt Schritt für Schritt den einfachsten Weg mit einem **Windows-PC** (etwa 10 Minuten). **Ubuntu/Linux, Raspberry Pi, Docker und CasaOS** stehen weiter unten unter „Andere Systeme“.

---

## Wie das Ganze funktioniert

- Miner Control ist ein kleines Programm, das auf einem **Rechner in deinem Heimnetz** läuft (Windows-PC, Mini-PC, Server, Raspberry Pi …). Dieser Rechner fragt deine Miner regelmäßig ab.
- **Das Handy ist nur die Anzeige.** Du öffnest Miner Control im Browser (Chrome) – am PC oder am Handy.
- Damit die Werte aktuell bleiben und Meldungen kommen, muss der Rechner **eingeschaltet bleiben**, solange du Miner Control nutzen willst.
- Miner Control **liest nur** und verändert nichts an deinen Minern.

## Was du brauchst

- Einen **Windows-PC**, der im **selben Netzwerk** (gleicher Router) wie deine Miner hängt
- Deine Miner mit **AxeOS** (Bitaxe, NerdQaxe & Co.)
- Etwa 10 Minuten

---

## Schritt 1: Node.js installieren (einmalig)

1. Öffne **https://nodejs.org**.
2. Lade die Version **„LTS“** herunter.
3. Installieren: immer auf **Weiter / Next** klicken, nichts ändern.

## Schritt 2: Miner Control herunterladen

1. Öffne **https://github.com/KBTechAndCrypto/miner-control/releases**.
2. Beim obersten Eintrag („Latest“) unter **Assets** auf **„Source code (zip)“** klicken.
3. Die ZIP-Datei mit Rechtsklick → **„Alle extrahieren“** entpacken, zum Beispiel nach `Dokumente\miner-control`.

## Schritt 3: Starten

1. Im entpackten Ordner den Unterordner **`windows`** öffnen.
2. Doppelklick auf **`start.bat`**.
3. Es öffnet sich ein **schwarzes Fenster** – das ist Miner Control. **Offen lassen** (minimieren geht). Schließt du es, ist Miner Control aus.
4. Fragt Windows nach der **Firewall**: bei **„Private Netzwerke“** zulassen. Das ist nötig, damit dein Handy darauf zugreifen kann.

## Schritt 4: Im Browser öffnen und Miner hinzufügen

1. Am PC im Browser **http://localhost:18090** öffnen.
2. Oben rechts auf **⚙ Settings / Einstellungen**.
3. **„🔍 Netzwerk durchsuchen“** – deine Miner werden gefunden. Die gewünschten anhaken, **„Ausgewählte hinzufügen“** und dann unten **Speichern**.
   (Oder **„+ Miner hinzufügen“** und die IP-Adresse des Miners eintippen.)
4. Fertig – nach wenigen Sekunden erscheinen deine Miner.

Oben rechts kannst du zwischen **DE** und **EN** umschalten.

## Schritt 5: Am Handy anschauen

1. Am PC herausfinden, welche Adresse er im Netz hat: Startmenü → **`cmd`** eingeben → Enter → **`ipconfig`** eingeben → bei **„IPv4-Adresse“** steht z. B. `192.168.178.20`.
2. Am Handy (im **gleichen WLAN**) in Chrome öffnen: **`http://192.168.178.20:18090`** (deine Adresse einsetzen).

**Unterwegs (mobile Daten), als App installieren und Push-Meldungen** brauchen eine sichere Verbindung (HTTPS). Das geht kostenlos mit **Tailscale** – siehe Anleitung, Kapitel 9. Für den Anfang ist das nicht nötig.

## Schritt 6 (optional): Automatisch mit Windows starten

Im Ordner `windows` einmal **`autostart-on.bat`** doppelklicken. Dann startet Miner Control nach jedem Windows-Start unsichtbar im Hintergrund. Rückgängig: **`autostart-off.bat`**.

---

## Andere Systeme (statt Windows)

Überall gilt: Danach im Browser **`http://<Adresse-des-Rechners>:18090`** öffnen und wie in **Schritt 4** die Miner hinzufügen. Die Adresse des Rechners zeigt unter Linux der Befehl `hostname -I` (die erste Zahl).

### A) Ubuntu / Debian / Raspberry Pi OS – ohne Docker

Terminal öffnen (oder per SSH verbinden) und Zeile für Zeile eingeben:

```
sudo apt update
sudo apt install -y nodejs unzip wget
node -v
```

Zeigt `node -v` **v18 oder höher**, ist alles gut (Ubuntu 24.04 und Raspberry Pi OS Bookworm passen). Bei älteren Versionen (z. B. Ubuntu 22.04 zeigt v12):

```
sudo snap install node --classic
```

Dann Miner Control herunterladen und als Dienst einrichten (startet automatisch, auch nach einem Neustart):

```
cd ~
wget -O miner-control.zip https://github.com/KBTechAndCrypto/miner-control/archive/refs/heads/main.zip
unzip miner-control.zip
cd miner-control-main
sudo bash linux/install.sh
```

Am Ende zeigt das Skript die Adresse an, z. B. `http://192.168.178.50:18090`. Nur ausprobieren ohne Dienst: statt der letzten Zeile `bash linux/start.sh` (läuft, bis du **Strg+C** drückst).

### B) Docker (Linux)

Docker installieren, falls noch nicht vorhanden:

```
curl -fsSL https://get.docker.com | sudo sh
```

Dann:

```
cd ~
wget -O miner-control.zip https://github.com/KBTechAndCrypto/miner-control/archive/refs/heads/main.zip
unzip miner-control.zip
cd miner-control-main/docker
cp .env.example .env
sudo docker compose up -d
```

Fertig – der Container startet ab jetzt automatisch mit. Sprache, Zeitzone oder ckpool-Ordner änderst du bei Bedarf in der Datei `.env` (dann nochmal `sudo docker compose up -d`).

### C) CasaOS mit Portainer

1. In der **CasaOS-Dateiverwaltung** (Files) den Ordner **`/DATA/AppData/minerdash`** anlegen und den Ordner **`app`** aus der ZIP-Datei dort hineinladen. Ergebnis: `/DATA/AppData/minerdash/app/server.js` usw.
2. **Portainer** öffnen → **Stacks** → **Add stack** → Name `minerdash`.
3. Bei **Web editor** den Inhalt der Datei **`casaos/docker-compose.yml`** einfügen.
4. **Deploy the stack** klicken.

Eigenen ckpool? Unten bei **Environment variables** `CKPOOL_HOST_DIR` = dein ckpool-Ordner eintragen. Ohne ckpool einfach so lassen.

### D) Mac

Node.js von **nodejs.org** installieren, ZIP entpacken, im Terminal in den Ordner wechseln und `bash linux/start.sh` starten. **Nicht getestet.**

### Updates

Neue Version herunterladen und den Ordner **`app`** ersetzen (bzw. unter Linux `sudo bash linux/install.sh` erneut ausführen, bei Docker die Dateien ersetzen und `sudo docker compose up -d`). Deine Einstellungen und Daten bleiben erhalten (Ordner `data`).

---

## Häufige Fragen

**Muss ich programmieren?**
Nein. Herunterladen, entpacken, `start.bat` doppelklicken.

**Läuft das nur auf dem Handy?**
Nein – das Programm braucht einen Rechner, der läuft. Das Handy zeigt es nur an.

**Ändert Miner Control etwas an meinen Minern?**
Nein, es liest nur. Einstellungen am Miner machst du weiter in AxeOS (Knopf „Öffnen ↗“ bei jedem Miner).

**Kostet das etwas?**
Nein, es ist kostenlos und Open Source.

**Geht das auch ohne Windows?**
Ja – siehe oben „Andere Systeme“: Ubuntu/Linux, Raspberry Pi, Docker, CasaOS. Mac ist nicht getestet.

**Ich sehe meine Miner nicht.**
PC und Miner müssen im selben Netzwerk sein. Bei der Suche hilft es, den Bereich selbst einzutragen, z. B. `192.168.178.0/24`. Oder die IP des Miners direkt eingeben (steht im Miner-Display oder im Router).

**Sicherheit:** Die Einstellungen haben kein Passwort. Miner Control nur im Heimnetz oder über Tailscale nutzen – **nie** per Portfreigabe ins Internet stellen.

Ausführliche Anleitung: [`Anleitung_DE.md`](Anleitung_DE.md)
