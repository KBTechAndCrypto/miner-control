# Miner Control – Installation und Betrieb

Ein kleines Dashboard für alle AxeOS-Miner (LuckyAxe, Bitaxe …). Es **liest nur**: Am Miner wird nichts verändert. Einstellungen am Miner machst du wie gewohnt über „ÖFFNEN ↗“ in AxeOS.

Drei Wege, es zu betreiben:

| Weg | Für wen |
|---|---|
| **A. Docker mit Portainer** (Kapitel 1–3) | Heimserver mit CasaOS/Portainer, so läuft es bei dir |
| **B. Ohne Docker unter Linux** (Kapitel 10) | Raspberry Pi, Ubuntu, Debian … mit systemd |
| **C. Ohne Docker unter Windows** (Kapitel 11) | Windows-PC, der sowieso läuft |

Die Oberfläche gibt es auf **Deutsch und Englisch** (Kapitel 8). HTTPS für App-Installation und Push geht über **Tailscale** (Kapitel 9), ist aber optional.

---

## 1. Dateien auf den Server kopieren

Lege mit der **CasaOS-Dateiverwaltung** (Files) oder mit WinSCP diese Ordner an und lade die Dateien hoch. Den Ordner `app` am besten komplett überschreiben (so ist nach einem Update nichts veraltet):

```
/DATA/AppData/minerdash/
└── app/
    ├── server.js
    ├── pool.js
    ├── push.js
    ├── scan.js            ← neu: Netzwerk-Suche nach Minern
    └── public/
        ├── index.html
        ├── widget.html
        ├── i18n.js            ← Übersetzungen (Deutsch / Englisch)
        ├── sw.js
        ├── manifest.webmanifest
        └── icon-192.png, icon-512.png, apple-touch-icon.png, badge-96.png
```

Den Ordner `data` musst du nicht anlegen; den erstellt Docker beim ersten Start selbst.

## 2. Stack in Portainer anlegen oder aktualisieren

1. Portainer öffnen → **Stacks** → **+ Add stack** (bei einem Update: Stack `minerdash` öffnen → **Editor**)
2. Name: `minerdash`
3. **Web editor**: Inhalt von `casaos/docker-compose.yml` einfügen
4. **Deploy the stack** (bei Update: **Update the stack**)

Portainer lädt dabei einmalig das offizielle Image `node:22-alpine` (ca. 50 MB). Weitere Pakete sind nicht nötig.

Die Compose-Datei kennt jetzt optionale Variablen (Tabelle in Kapitel 4, Vorlage in `casaos/.env.example`). Ohne Variablen verhält sie sich wie vorher: gleiche Ordner, Port 18090, Sprache Deutsch.

## 3. Aufrufen

- Im Heimnetz: `http://<IP-deines-Servers>:18090`
- Unterwegs über Tailscale: `http://<Tailscale-IP-des-Servers>:18090`

Beim ersten Aufruf ist das Dashboard leer → **⚙ EINSTELLUNGEN** → Miner mit Name und IP eintragen (oder bequemer über **🔍 Netzwerk durchsuchen**, Kapitel 12) → **SPEICHERN**. Nach wenigen Sekunden erscheinen die Karten. Der Verlauf füllt sich ab dann jede Minute.

## 4. Gut zu wissen

| Thema | |
|---|---|
| Port belegt? | Variable `MC_PORT` setzen (oder in der Compose-Datei `18090` ersetzen) und den Stack neu deployen. Wer Tailscale über den Stack nutzt, ändert den Port auch in `casaos/tailscale/serve.json`. |
| Update | Ordner `app` neu hochladen, dann in Portainer den Container **Restart**. Im Browser / in der App danach einmal neu laden. |
| Daten | `config.json` (Einstellungen), `history.json` (Verlauf), `store.json` (Ereignisse, Best Diff, Blöcke), `pool-history.json`, `push.json` im Ordner `data`. |
| Speicherbedarf | ca. 2 MB pro Miner bei 30 Tagen Verlauf. |
| Logs | Portainer → Containers → `minerdash` → **Logs**. |
| Sicherheit | Die Einstellungen des Dashboards haben kein Passwort. Nur im Heimnetz bzw. über Tailscale nutzen, nicht ins Internet freigeben. |
| Matrix-Regen | Lässt sich unter ⚙ EINSTELLUNGEN abschalten (gilt nur für den jeweiligen Browser). |

Variablen der Compose-Datei (alle optional):

| Variable | Standard | Bedeutung |
|---|---|---|
| `MC_LANG` | `de` | Startsprache einer neuen Installation (`de` oder `en`) |
| `TZ` | `Europe/Berlin` | Zeitzone für Datum und Uhrzeit im Log |
| `MC_PORT` | `18090` | Web-Port |
| `MC_DIR` | `/DATA/AppData/minerdash` | Basisordner auf dem Server |
| `CKPOOL_HOST_DIR` | `/home/you/ckpool` | ckpool-Ordner (nur lesend eingebunden) |
| `COMPOSE_PROFILES` | – | `tailscale` schaltet den optionalen Tailscale-Container ein (Kapitel 9) |
| `TS_AUTHKEY`, `TS_HOSTNAME` | – / `minerdash` | nur für das Tailscale-Profil |

## 5. Was angezeigt wird

- Summen: Hashrate (mit Soll), Leistung, kWh und Stromkosten pro Tag/Monat, Effizienz, beste Difficulty, gefundene Blöcke, Shares
- Hashrate-Verlauf 1 h bis 30 Tage, gesamt und je Miner
- Je Miner: Hashrate, Profil/OC (LuckyAxe), Leistung, J/TH, Frequenz, Kernspannung, ASIC-/VR-Temperaturen, Eingangsspannung, Lüfter, Best Diff, Error-Rate, Pools mit accepted/rejected, Uptime
- Ereignisse: Blockfund, neue Best Difficulty (jede neue löst eine eigene Meldung aus), offline/online, Warnungen, bei ckpool: Worker verbunden/ohne Share sowie **ckpool gestoppt / läuft wieder** und **Node nicht erreichbar / wieder erreichbar**
- Warnungen (einstellbar): ASIC- und VR-Temperatur, Hashrate unter Soll, offline, Eingangsspannung, Overheat, Lüfter steht

## 6. Pool-Seite (ckpool)

Oben zwischen **MINER** und **POOL** umschalten. Die Pool-Seite liest **nur lesend** die Dateien von ckpool:

| Quelle | Inhalt |
|---|---|
| `ckpool.conf` | Zugangsdaten der Node, Auszahlungsadresse, Stratum-Port |
| `logs/pool/pool.status` | Pool-Hashrate, Shares, Best Share seit letztem Block |
| `logs/users/*` | alle Benutzer und Worker mit Namen, Hashrate, Best Share |
| `logs/ckpool.log` | nur gefundene Blöcke („Solved and confirmed block“) |
| Node (RPC) | Blockhöhe, Netzwerk-Difficulty, Netz-Hashrate |

Dafür läuft der Container im **Host-Netzwerk** (`network_mode: host`) und bindet den ckpool-Ordner nur lesend ein. Die Adresse bleibt `:18090`.
Block-Chance = erwartete Zeit bis zum Block bei der aktuellen 1-h-Pool-Hashrate (reine Statistik). Der BCH-Kurs kommt von der Coinbase-API, in der Währung, die du bei den Stromkosten gewählt hast (EUR oder USD).

Wer kein ckpool betreibt, kann die Pool-Seite einfach ignorieren.

## 7. Benachrichtigungen aufs Handy (Web Push)

1. Die App über eine **HTTPS-Adresse** öffnen (Kapitel 9). Über `http://…:18090` geht Push nicht.
2. ⚙ EINSTELLUNGEN → „Benachrichtigungen aufs Handy“ → **Aktivieren** → Benachrichtigungen erlauben.
3. **Test** drücken, die Testmeldung muss sofort ankommen.
4. Häkchen setzen, welche Meldungen kommen sollen, **SPEICHERN**.

Die Nachrichten laufen über den Push-Dienst des Browsers (bei Android: Google). Der Server braucht dafür Internetzugang, das Handy nicht über Tailscale. Ein Tipp auf die Meldung öffnet die App.
Damit Meldungen zuverlässig ankommen: in den Android-Einstellungen für Chrome bzw. die App **Akku-Optimierung aus**.
Jedes Gerät meldet man einzeln an (Handy, PC …). Die Schlüssel liegen in `data/push.json`.

## 8. Sprache (Deutsch / Englisch)

Oben rechts in der Kopfzeile steht **DE | EN**. Ein Klick wechselt sofort die ganze Oberfläche (Karten, Log, Pool-Seite, Einstellungen, Widget).

- Die Wahl gilt für den **Browser** und wird zusätzlich auf dem **Server** gespeichert. Darum erscheinen auch **Push-Meldungen** in dieser Sprache.
- Neue Ereignisse im Log werden bei der Anzeige übersetzt, also auch in der anderen Sprache lesbar. Ereignisse, die vor diesem Update entstanden sind, bleiben auf Deutsch.
- Das **Widget** (`/widget`) folgt der Server-Sprache. Mit `/widget?lang=en` bzw. `?lang=de` lässt sich das für ein einzelnes Widget festlegen.
- Weitere Sprache hinzufügen: in `app/public/i18n.js` den Block `en` kopieren, übersetzen und den Code bei `LANGS` ergänzen.

## 9. HTTPS mit Tailscale (optional)

HTTPS braucht man für die **App-Installation** auf dem Handy und für **Push**. Ohne HTTPS funktioniert alles andere über `http://<IP>:18090`.

### Weg 1: Du hast Tailscale schon (so läuft es bei dir)

Auf dem Server einmalig, mit dem vorhandenen Tailscale-Container:

```
sudo docker exec tailscale tailscale serve --bg --https=8443 http://<IP-deines-Servers>:18090
```

Danach: `https://<servername>.<tailnet>.ts.net:8443`. Es ist nichts weiter nötig.

### Weg 2: Tailscale gleich im Stack mitstarten

Für alle, die noch **kein** Tailscale auf dem Server haben. Der Stack startet dann einen zweiten Container, der das Dashboard mit HTTPS veröffentlicht, nur innerhalb deines Tailnets.

1. Im Tailscale-Adminbereich (login.tailscale.com) unter **DNS** **MagicDNS** und **HTTPS Certificates** einschalten (einmalig).
2. Unter **Settings → Keys** einen **Auth key** erzeugen.
3. Die Datei `casaos/tailscale/serve.json` hochladen nach `/DATA/AppData/minerdash/tailscale/serve.json`.
4. In Portainer beim Stack unter **Environment variables** eintragen:
   `COMPOSE_PROFILES` = `tailscale` und `TS_AUTHKEY` = dein Auth key.
5. **Update the stack**.
6. Nach etwa einer Minute erscheint im Tailscale-Adminbereich ein neues Gerät `minerdash`. Aufrufen: `https://minerdash.<tailnet>.ts.net` (ohne Portnummer).

Der Auth key wird nur beim ersten Start gebraucht, danach liegt der Zugang unter `tailscale/state`. Ohne `COMPOSE_PROFILES=tailscale` startet dieser Container nie.
Wer schon Weg 1 nutzt, braucht Weg 2 nicht, sonst entstehen zwei Zugänge.

### Ohne Docker

Ist Tailscale direkt auf dem Rechner installiert (Linux oder Windows), reicht ein Befehl:

```
tailscale serve --bg --https=8443 http://127.0.0.1:18090
```

---

## 10. Ohne Docker: Linux

Voraussetzung: **Node.js 18 oder neuer** (`node -v` prüfen). Sonst ist nichts nötig, es gibt keine weiteren Pakete.

Entpacke die ZIP-Datei, zum Beispiel nach `~/minerdash`.

**Schnell ausprobieren:**

```
cd ~/minerdash
./linux/start.sh
```

Dann `http://localhost:18090` öffnen. Daten landen im Ordner `data` neben dem Programm. Mit **Strg+C** beenden.

**Dauerhaft als Dienst (systemd):**

```
cd ~/minerdash
sudo ./linux/install.sh
```

Das Skript kopiert das Programm nach `/opt/minerdash`, legt den Benutzer `minerdash` an und startet den Dienst bei jedem Systemstart. Danach:

| Thema | |
|---|---|
| Einstellungen | `/etc/minerdash.env` (Port, Sprache, Zeitzone, ckpool-Ordner). Nach Änderung: `sudo systemctl restart minerdash` |
| Daten | `/var/lib/minerdash` |
| Logs | `journalctl -u minerdash -f` |
| Update | neue ZIP entpacken, `sudo ./linux/install.sh` erneut ausführen (Einstellungen und Daten bleiben) |
| Entfernen | `sudo systemctl disable --now minerdash && sudo rm /etc/systemd/system/minerdash.service` (Daten in `/var/lib/minerdash` bleiben, bis du sie löschst) |
| Firewall | falls aktiv: `sudo ufw allow 18090/tcp` |

**ckpool auf demselben Rechner:** in `/etc/minerdash.env` die Zeile `CKPOOL_DIR=/home/du/ckpool` aktivieren. Der Dienst muss den Ordner lesen dürfen. Am einfachsten installierst du dann mit deinem eigenen Benutzer:
`sudo MC_USER=dein-benutzer ./linux/install.sh`

## 11. Ohne Docker: Windows

Voraussetzung: **Node.js 18 oder neuer** (LTS-Version von nodejs.org, bei der Installation alles auf Standard lassen).

1. ZIP-Datei entpacken, zum Beispiel nach `C:\minerdash`.
2. **`windows\start.bat`** doppelklicken. Es öffnet sich ein Fenster, das offen bleiben muss. Windows fragt eventuell nach der Firewall-Freigabe: für **private Netzwerke** erlauben.
3. Im Browser `http://localhost:18090` öffnen. Vom Handy: `http://<IP-des-PCs>:18090`.

Daten liegen im Ordner `data` neben dem Programm.

**Automatisch beim Anmelden starten (ohne Fenster):** `windows\autostart-on.bat` doppelklicken. Rückgängig mit `windows\autostart-off.bat`. Ein laufender Dienst wird dadurch nicht beendet; dazu im Task-Manager den Prozess `node.exe` beenden.

**Einstellungen** (Port, Sprache, ckpool-Ordner) stehen am Anfang von `windows\start.bat`. Dort `rem ` vor der passenden Zeile entfernen und den Wert anpassen.

**Update:** neue ZIP über den alten Ordner entpacken, den Ordner `data` dabei nicht löschen. Dann `windows\start.bat` neu starten.

Hinweis: Die Pool-Seite (ckpool) ist für Linux gedacht. Unter Windows läuft ckpool normalerweise nicht, die Seite zeigt dann „Kein ckpool gefunden“; die Miner-Seite ist davon nicht betroffen.

---

## 12. Miner im Netzwerk suchen

Unter **⚙ EINSTELLUNGEN** gibt es über der Miner-Liste den Knopf **🔍 Netzwerk durchsuchen**.

1. Knopf drücken. Ohne Eingabe sucht der Server automatisch in deinem eigenen Heimnetz (Adressen `x.x.x.1` bis `x.x.x.254`). Das dauert wenige Sekunden.
2. Es erscheint eine Liste: Name, IP-Adresse, Chip-Modell und aktuelle Hashrate. Schon eingetragene Miner sind ausgegraut.
3. Neue Miner angehakt lassen oder abwählen, **Ausgewählte hinzufügen** drücken, dann **SPEICHERN**.

Gefunden wird jedes Gerät, das auf `/api/system/info` wie ein AxeOS-Gerät antwortet (Bitaxe, LuckyAxe …). Der Scan **liest nur** und läuft **nur auf Knopfdruck**.

| Thema | |
|---|---|
| Anderes Netz | Im Feld unter dem Knopf einen Bereich eintragen, z. B. `192.168.2.0/24` (mehrere mit Komma). Erlaubt sind nur private Adressen, höchstens 1024 Adressen (`/22`). |
| „Kein Netzwerk erkannt“ | Dann Bereich selbst eintragen. Das passiert z. B., wenn der Dienst in einem Docker-Netz ohne Zugang zum Heimnetz läuft. Im Host-Modus dieses Stacks klappt die automatische Suche. |
| Miner nicht dabei | Muss eingeschaltet, im selben Netz und per Browser unter `http://<IP>` erreichbar sein. Manche Router trennen WLAN und LAN (Gastnetz): dann Bereich des anderen Netzes eintragen. |

## 13. Stromkosten (Euro oder US-Dollar)

Unter **⚙ EINSTELLUNGEN → Stromkosten** den **Strompreis pro kWh** eintragen (z. B. `0,32`, mit Punkt: `0.32`) und die **Währung** wählen (EUR oder USD). Bei `0` werden keine Kosten angezeigt.

- Auf der Karte **Total Power** erscheinen danach die Kosten pro Tag und pro Monat (30 Tage), gerechnet aus der aktuellen Leistung aller laufenden Miner.
- Das Widget zeigt die Kosten pro Tag.
- Auf der Pool-Seite wird die Belohnung („Belohnung jetzt“) in der gewählten Währung umgerechnet.
- Die Kosten sind eine Hochrechnung aus der momentanen Leistung, keine Abrechnung.

## 14. Push-Benachrichtigungen auf dem iPhone

> **⚠ NICHT GETESTET.** Dieses Kapitel beschreibt, was nach Apples Regeln nötig ist. Es wurde mit keinem iPhone ausprobiert (der Entwickler nutzt Android). Wenn etwas nicht klappt, ist das kein Fehler bei dir.

Voraussetzungen laut Apple:

1. **iOS / iPadOS 16.4 oder neuer.**
2. Die Seite muss über **HTTPS** erreichbar sein (z. B. Tailscale `serve`, siehe Kapitel zu Tailscale). Über `http://IP:18090` gibt es auf dem iPhone keine Push-Meldungen.
3. Die Seite **mit Safari** öffnen, dann **Teilen → Zum Home-Bildschirm**. Push geht nur in der installierten App, nicht in einem normalen Safari-Tab.
4. Die App **vom Home-Bildschirm aus** öffnen, Einstellungen → Push aktivieren, Erlaubnis bestätigen, speichern.

Bekannte Unsicherheit: Die Push-Kennung enthält eine Platzhalter-Adresse (`mailto:miner-control@localhost.invalid` in `app/push.js`). Falls Apple die Anmeldung deswegen ablehnt, dort eine echte E-Mail-Adresse eintragen und neu starten.

## 15. ckpool-Ordner einstellen (eigener Pfad)

Die Seite **POOL** erscheint nur, wenn das Dashboard deinen ckpool findet. Es sucht die Datei `logs/pool/pool.status` und liest `ckpool.conf` (dort stehen auch die Zugangsdaten zur Node, Abschnitt `btcd`). Findet es nichts, ist der Knopf POOL ausgeblendet. Unter **Einstellungen → Pool** steht, in welchem Ordner gesucht wurde.

Gemeint ist immer der Ordner, in dem **`ckpool.conf`** und der Unterordner **`logs`** liegen, zum Beispiel:

```
/home/du/ckpool/
├── ckpool.conf
└── logs/
    ├── ckpool.log
    ├── pool/pool.status
    └── users/...
```

So stellst du den Pfad ein:

| Betrieb | Wo | Was |
|---|---|---|
| **CasaOS / Portainer** | Stack → Environment variables | `CKPOOL_HOST_DIR` = dein Ordner, z. B. `/home/du/ckpool`, dann **Update the stack** |
| **Docker Compose** (`docker/`) | Datei `docker/.env` | Zeile `CKPOOL_HOST_DIR=/home/du/ckpool`, dann `docker compose up -d` |
| **Linux-Dienst** | `/etc/minerdash.env` | Zeile `CKPOOL_DIR=/home/du/ckpool` aktivieren, dann `sudo systemctl restart minerdash` |
| **Linux von Hand** (`linux/start.sh`) | am Anfang von `start.sh` | `# ` vor `export CKPOOL_DIR=…` entfernen, Pfad anpassen |
| **Windows** (`windows\start.bat`) | am Anfang von `start.bat` | `rem ` vor `set CKPOOL_DIR=…` entfernen, Pfad anpassen |

Hinweise:

- Bei Docker heißt der Ordner **im Container** immer `/ckpool`, deshalb steht in den Einstellungen dann auch `/ckpool`. Der echte Ordner auf dem Server kommt aus `CKPOOL_HOST_DIR`.
- Das Dashboard braucht nur **Leserechte** auf den Ordner. Beim Linux-Dienst mit eigenem Systembenutzer am einfachsten mit `sudo MC_USER=dein-benutzer ./linux/install.sh` installieren.
- ckpool muss mindestens einmal gelaufen sein, sonst gibt es `pool.status` noch nicht.
- Nach dem Ändern erscheint der Knopf POOL beim nächsten Abruf (wenige Sekunden) von selbst.
- Andere Pools (nicht ckpool) werden auf der Seite POOL nicht unterstützt. Die Seite MINER funktioniert mit jedem Pool.

## 16. Farbe ändern

**Einstellungen → Anzeige → Farbe:** Grün (Standard), Bernstein, Cyan oder Violett. Beim Auswählen siehst du die Farbe sofort als Vorschau; übernommen wird sie mit **Speichern**, mit ✕ geht es zurück.

- Die Farbe gilt **nur für dieses Gerät** (wie Matrix-Regen). Handy und PC können also verschieden aussehen.
- Warnungen bleiben gelb/orange, Fehler rot. Beim Bernstein-Theme werden Warnungen orange-rot, damit sie sich von der Grundfarbe abheben.
- **Widget:** übernimmt die im Dashboard gewählte Farbe, wenn es im selben Browser läuft. Sonst die Farbe in der Adresse angeben: `/widget?theme=amber` (`green`, `amber`, `cyan`, `purple`), kombinierbar mit `&lang=en`.

### BTC oder BCH

Das Dashboard erkennt die Münze automatisch an der Node (Bitcoin Cash Node, ABC, Flowee, bchd → **BCH**; Bitcoin Core, Knots → **BTC**). Davon hängen Kurs, Bezeichnung bei „Belohnung jetzt“ und die Adressanzeige ab (CashAddr nur bei BCH). Ist die Node nicht erreichbar oder unbekannt, gilt die Variable `MC_COIN` (z. B. `MC_COIN=BTC`), sonst BCH.

## 17. Verfügbarkeit (Uptime) der Miner

Unten auf der Seite MINER zeigt der Kasten **Verfügbarkeit** pro Miner:

- **24 h / 7 Tage / 30 Tage:** Anteil der Zeit, in der der Miner gehasht hat (grün ab 99 %, gelb ab 95 %, sonst rot).
- **Ausfälle**, **längster** Ausfall und **Neustarts** der letzten 30 Tage.
- **Letzte Ausfälle und Neustarts** mit Uhrzeit – so erkennst du Muster (immer zur gleichen Uhrzeit? alle Miner gleichzeitig → eher Strom, Router oder WLAN).

So wird gezählt (jede Minute bekommt einen Zustand):

| Zustand | Bedeutung | zählt als Ausfall |
|---|---|---|
| hasht | antwortet und liefert Hashrate | nein |
| **offline** | antwortet in der ganzen Minute nicht | ja |
| **kein Hashing** | antwortet, liefert aber 0 bzw. unter 5 % der Soll-Hashrate | ja |
| Neustart | bis 2 min nach dem Hochfahren noch ohne Hashrate, sowie die Offline-Minuten direkt vor dem Hochfahren | nein (wird nicht mitgerechnet) |
| pausiert | Mining in AxeOS pausiert | nein (wird nicht mitgerechnet) |
| unbekannt | das Dashboard selbst lief nicht | nein (wird nicht mitgerechnet) |

**Nach einem Neustart hat der Miner 2 Minuten Zeit**, bis er hasht. Hasht er danach immer noch nicht, zählt das ab dann als Ausfall „kein Hashing“.

**Neustarts** werden an der Laufzeit des Miners erkannt (sie springt zurück), auch wenn der Miner dabei kaum weg war oder das Dashboard in der Zeit aus war. Sie stehen zusätzlich im Event-Log, werden aber **nicht** als Push gemeldet (ein Neustart kann gewollt sein).

Die Zählung beginnt mit Version 1.5.0; ältere Zeiten sind „unbekannt“. Daten: `data/uptime.json`, 30 Tage.

## 18. Seite LOG – alle Einträge der letzten 30 Tage

Oben über **LOG** (neben MINER und POOL) siehst du alle Einträge der letzten 30 Tage.

- **Filter:** Miner (alle, ein bestimmter Miner oder Pool), Art (Ausfälle, Warnungen, wieder online, Neustarts, Blockfunde, Best Difficulty) und Zeitraum (24 h, 7 Tage, 30 Tage). Die Auswahl merkt sich der Browser.
- **Übersicht:** ein Raster passend zum Zeitraum – 24 h (heute und gestern), 7 oder 30 Tage (Zeilen) mal 24 Stunden (Spalten). Grün = keine Ausfälle, gelb = teilweise, rot = überwiegend ausgefallen, weißer Punkt = Neustart. Bei „Alle Miner“ zählt pro Stunde der schlechteste Miner. So siehst du auf einen Blick, ob Ausfälle immer zur gleichen Uhrzeit passieren.
- **Stunde anklicken:** zeigt nur die Einträge dieser Stunde. Nochmal klicken oder auf das ✕ am Filter, um alles zu sehen.
- **⬇ CSV:** lädt die angezeigten Einträge als Tabelle herunter (öffnet sich in Excel oder LibreOffice).

Das Event-Log wird jetzt 30 Tage aufbewahrt (höchstens 5000 Einträge), statt nur die letzten 300.

### Startzeit nach einem Neustart

Nach jedem Neustart misst das Dashboard, **wie lange es dauert, bis der Miner wieder hasht** (genau auf etwa ein Abfrage-Intervall). Im Kasten Verfügbarkeit zeigt die Spalte **Start** den letzten Wert und darunter den Durchschnitt der letzten 30 Tage. Ist der letzte Start deutlich langsamer als üblich (mindestens 1,5-mal so lang und 15 s mehr, ab 3 Messungen), wird er gelb. So fällt ein Miner auf, der immer länger zum Hochfahren braucht.

Im Log steht dann z. B. „Neustart – hasht wieder nach 48 s“. Hasht ein Miner nach 2 Minuten noch nicht, kommt „Neustart – nach 2 min noch keine Hashrate“. Wurde der Neustart erst spät bemerkt (Miner war länger nicht erreichbar oder das Dashboard aus), lässt sich die Startzeit nicht messen; dann steht nur „Neustart erkannt“.

### Event-Log auf den Seiten MINER und POOL

Die Kästen **Event Log** und **Pool Event Log** zeigen nur so viele der neuesten Einträge, wie neben den Kasten rechts passen, ohne eigenen Scrollbalken. Alle Einträge: Link **„Alle Einträge im LOG ›“** darunter – er öffnet die Seite LOG gleich mit passendem Filter (auf der Pool-Seite „Pool“).

### Pool-Wechsel der Miner im Log

Das Dashboard merkt sich, mit welchem Pool jeder Miner verbunden ist, und schreibt Änderungen ins Log:

| Eintrag | Wann | Push |
|---|---|---|
| verbunden mit … | einmal, wenn ein Miner zum ersten Mal abgefragt wird (auch nach dem Update auf 1.6.0) | nein |
| **Fallback-Pool aktiv: … – Hauptpool nicht erreichbar?** | der Miner ist auf seinen Fallback-Pool gesprungen | ja, unter „Warnungen“ |
| wieder auf dem Hauptpool: … | zurück vom Fallback | ja, unter „wieder online“ |
| **Pool getrennt: …** / Pool wieder verbunden: … | Dual-Pool: einer der beiden Pools verliert die Verbindung bzw. ist wieder da | ja („Warnungen“ bzw. „wieder online“) |
| Pool geändert: alt → neu | Pool-Adresse in AxeOS geändert | nein |
| Pool-Modus: Dual-Pool / 1 Pool | zwischen einem und zwei Pools umgeschaltet | nein |

Eine Änderung muss bei **zwei Abfragen hintereinander** zu sehen sein – ein kurzer Aussetzer erzeugt keinen Eintrag. Auf der Seite LOG gibt es dafür die Art **„Pool-Wechsel der Miner“**. Ändert sich der Pool, während das Dashboard aus ist, wird das beim nächsten Start nachgetragen.

## 19. Support-Export (Bericht für den Hersteller-Support)

Auf der Seite **LOG** neben „CSV“: **🧾 Support-Export**. Er nimmt den gerade gewählten **Miner und Zeitraum** (auch eine angeklickte Stunde) und erstellt einen Bericht für ein Support-Ticket – **immer auf Englisch**, damit jeder Support ihn lesen kann.

Inhalt: Dashboard-Version und Zeitzone, pro Miner Firmware, Board-Revision, ASIC, aktuelle Werte, Lüfter, Pools, abgelehnte Shares, Verfügbarkeit, Startzeiten, die Ausfälle und Neustarts im Zeitraum, eine **Stunden-Übersicht als Textgrafik** und alle Log-Einträge. Am Ende stehen die Warngrenzen.

Vor dem Speichern siehst du eine **Vorschau**. Häkchen: **IP-Adressen entfernen** und **Pool-Adressen entfernen** (beide an), **Miner-Namen ersetzen** (aus). **Wallet-Adressen werden immer entfernt**, Pool-Benutzernamen sind nie enthalten. Dann **Kopieren** (für ein Ticket-Formular) oder **Als .txt speichern** (zum Anhängen).
