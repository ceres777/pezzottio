<div align="center">

# **PEZZOTTIO**

### Lo streaming italiano. <span style="color:#e50914">Senza menate.</span>

Apri Stremio, premi play, guardi.
Film, serie, anime — tutti in italiano, prima possibile.
**Una sola installazione. Zero proxy da configurare. Zero Docker.**

[![Try it](https://img.shields.io/badge/▶_PROVALO_ORA-pezz8io.dpdns.org-e50914?style=for-the-badge)](https://pezz8io.dpdns.org/configure)
[![Telegram](https://img.shields.io/badge/Supporto-@Mbhere1-26a5e4?style=for-the-badge&logo=telegram)](https://t.me/Mbhere1)

[**Cosa fa**](#-cosa-fa) · [**Provalo**](#-provalo-in-30-secondi) · [**Domande**](#-domande-frequenti)

</div>

---

<div align="center">

<img src="assets/hero.png" alt="Pezzottio: lista stream italiana ordinata per lingua" width="100%">

</div>

---

## 🎬 Cosa fa

Pezzottio è un addon Stremio che **trova e riproduce film, serie e anime in italiano** senza che tu debba smanettare con niente. Lo installi una volta, scrivi la tua chiave Torbox, e via.

- 🇮🇹 **Audio italiano per primo.** Se esiste una versione doppiata, è in cima. Se no, sottotitoli ITA. Tutto il resto dopo.
- ⚡ **Riproduzione istantanea.** Niente "attesa torrent", niente "loading failed". Con Torbox premi play e parte. Subito.
- 📺 **Funziona anche senza account.** Stream HTTP italiani (AnimeWorld, AnimeSaturn, GuardaSerie, StreamingCommunity) inclusi gratis. Per il meglio però serve Torbox.
- 🎯 **Anime, film vecchi, serie introvabili.** Cerca su 30+ fonti contemporaneamente, tutte filtrate per italiano.
- 📦 **Pack stagione gestiti.** Apri S05E03 da un torrent con 5 stagioni intere: Pezzottio fa partire l'episodio giusto da solo.

---

## 🎯 Quello che lo rende diverso

Quasi tutti gli addon italiani per Stremio ti chiedono di **ospitare un server tuo da qualche parte** (un VPS, un Raspberry, un NAS sempre acceso) dove far girare un proxy chiamato MediaFlowProxy. Senza quello, dopo 5 minuti il video si pianta. Devi:

- pagare un VPS o esporre la tua rete di casa
- imparare Docker
- tenere il server sempre acceso
- aggiornare il proxy quando si rompe

Non è impossibile, ma non è roba per la maggior parte delle persone.

**Pezzottio quel proxy ce l'ha già dentro al server pubblico.**

Tu apri il link, copi-incolli in Stremio, finito. Funziona uguale su PC, telefono, tablet, Android TV, Fire TV. Senza che tu debba ospitare niente. Senza che tu sappia cosa sia un VPS o un Docker.

|  | Altri addon italiani | **Pezzottio** |
|---|:---:|:---:|
| Ti serve un server tuo (VPS/Raspberry) | 🔧 sì | ✅ no |
| Devi installare e mantenere MediaFlowProxy | 🔧 sì | ✅ no |
| Devi sapere cos'è Docker | 🤷 sì | ✅ no |
| Video si blocca dopo 5 min | ⚠️ se sbagli setup | ✅ mai |
| Funziona su Android/Fire TV | 😩 complicato | ✅ subito |
| Tempo di setup | 30-60 min | **30 secondi** |

---

## ⚡ Provalo in 30 secondi

### 1. Apri il link
### 👉 [**https://pezz8io.dpdns.org/configure**](https://pezz8io.dpdns.org/configure)

### 2. Metti la chiave Torbox

Se non hai ancora Torbox, prendilo qui (costa pochi euro al mese, ti permette di scaricare e riprodurre torrent istantaneamente dal cloud, senza saturare la tua connessione):

### 💎 [**Registrati a Torbox →**](https://torbox.app/subscription)

> Usando il link sopra supporti lo sviluppo di Pezzottio (a te non costa nulla in più). Grazie!

Dopo la registrazione: copia la API key da `torbox.app` → Settings → API Key, incollala su `pezz8io.dpdns.org/configure`.

### 3. Installa in Stremio

Clicca **"Installa in Stremio"** o inquadra il QR code dalla TV. Fatto.

Apri un film qualsiasi. Vedi gli stream italiani in cima. Premi play. Funziona.

---

## ❓ Domande frequenti

<details>
<summary><b>Quanto costa?</b></summary>

**Pezzottio è gratis.** Torbox costa pochi euro al mese (link sopra), e ti permette di riprodurre istantaneamente qualsiasi torrent senza scaricarlo sul tuo dispositivo. Senza Torbox funzionano comunque gli stream HTTP italiani gratuiti (AnimeWorld, AnimeSaturn, GuardaSerie, StreamingCommunity), ma con Torbox la libreria è infinita.
</details>

<details>
<summary><b>Real-Debrid funziona?</b></summary>

Real-Debrid è **in sviluppo** e attualmente NON consigliato. Real-Debrid ha disabilitato l'API che permetterebbe a Pezzottio di sapere velocemente cosa è disponibile, quindi i risultati sono pochi e lenti. Torbox invece funziona perfettamente: usalo. RD tornerà supportato quando troveremo una soluzione affidabile.
</details>

<details>
<summary><b>Devo ospitare qualcosa (MediaFlowProxy, Docker, VPS)?</b></summary>

**No.** Questo è il motivo principale per cui Pezzottio esiste. Tutti gli altri addon italiani ti fanno ospitare un proxy (MediaFlowProxy) su un tuo server esterno: un VPS pagato a parte, un Raspberry sempre acceso, un Docker su un NAS. Pezzottio ce l'ha già dentro al suo server pubblico. Tu apri il link, copi in Stremio, fine.
</details>

<details>
<summary><b>Funziona su Android TV / Fire TV / iPhone?</b></summary>

Sì, ovunque ci sia Stremio. Apri `/configure` dal browser del telefono o del PC, genera il link, e inquadralo con la TV (mostra un QR code). Niente da installare sulla TV oltre Stremio stesso.
</details>

<details>
<summary><b>La mia chiave Torbox è al sicuro?</b></summary>

Sì. La chiave non viene salvata sui nostri server. È codificata dentro il tuo link manifest personale e vive solo lì. Nessun database, nessun log. Se vuoi ancora più privacy, puoi ospitare la tua copia di Pezzottio in 5 minuti su Render (è gratuito).
</details>

<details>
<summary><b>Funziona con Crunchyroll / cataloghi anime?</b></summary>

Sì, qualunque catalogo tu abbia su Stremio (IMDb, Kitsu, MAL, AniList, Crunchyroll, AnimeUnity, ...) Pezzottio lo capisce e cerca lo stream giusto.
</details>

<details>
<summary><b>Apro S05E03 ma trovo solo un pack di 5 stagioni intere, parte l'episodio giusto?</b></summary>

Sì. Pezzottio rileva il file giusto dentro l'archivio e parte da lì. Niente più "ho aperto E03 ma parte E01".
</details>

<details>
<summary><b>Trova davvero film vecchi e anime di nicchia?</b></summary>

Sì. Pezzottio cerca su 30+ fonti contemporaneamente (incluse fonti italiane specifiche come ilCorsaroNero e gruppi come MIRCrew, NAHOM, Me7alh) + i provider HTTP italiani per gli anime (AnimeWorld, AnimeSaturn) che coprono anche le serie vecchie raramente indicizzate altrove.
</details>

<details>
<summary><b>Non vedo stream / qualcosa non funziona, dove chiedo aiuto?</b></summary>

Telegram: [**@Mbhere1**](https://t.me/Mbhere1). Scrivimi descrivendo cosa hai provato (titolo, screenshot se puoi) e ti rispondo appena posso.
</details>

---

## 🛠️ Self-hosting (per smanettoni)

Se vuoi ospitare la tua copia (utile se hai tanti utenti o vuoi privacy massima):

```bash
git clone https://github.com/ceres777/pezzottio.git
cd pezzottio
npm install
npm start
```

Apri `http://127.0.0.1:7001/configure`.

Deploy gratuito su Render: il repo include `render.yaml`. Fork → New Web Service → Deploy.

---

## 📞 Supporto

- **Telegram**: [@Mbhere1](https://t.me/Mbhere1) — per qualsiasi problema, segnalazione, richiesta
- **Issues GitHub**: [github.com/ceres777/pezzottio/issues](https://github.com/ceres777/pezzottio/issues)

---

## ⚠️ Disclaimer

Pezzottio è un progetto educativo open-source fornito "così com'è". L'addon non ospita né distribuisce alcun contenuto: si limita a interrogare API pubbliche di terze parti. L'utente è l'unico responsabile dell'uso del software e dei contenuti a cui accede. Rispetta le leggi sul diritto d'autore del tuo paese.

---

## 📜 Licenza

MIT. Vedi [`LICENSE`](LICENSE).

---

<div align="center">

**Smetti di cercare. Inizia a guardare.**

### 🔗 [pezz8io.dpdns.org/configure](https://pezz8io.dpdns.org/configure)

### 💎 [Registrati a Torbox](https://torbox.app/subscription)

<sub>Open source · MIT · Realizzato in 🇮🇹 · Supporto Telegram [@Mbhere1](https://t.me/Mbhere1)</sub>

</div>
