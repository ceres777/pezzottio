<div align="center">

# **PEZZOTTIO**

### Your Stremio life, no setup. · La tua vita su Stremio, senza menate.

All-in-one Stremio addon: streams from 30+ sources, integrated catalogs (movies, series, anime),
multi-profile, TorBox + Real-Debrid, server-side HLS proxy. One install, zero external tooling.

[![Try it · English](https://img.shields.io/badge/▶_TRY_IT_EN-pezz8io.dpdns.org/configure--en-e50914?style=for-the-badge)](https://pezz8io.dpdns.org/configure-en)
[![Provalo · Italiano](https://img.shields.io/badge/▶_PROVALO_IT-pezz8io.dpdns.org/configure-009246?style=for-the-badge)](https://pezz8io.dpdns.org/configure)
[![Telegram](https://img.shields.io/badge/Support_/_Supporto-@Mbhere1-26a5e4?style=for-the-badge&logo=telegram)](https://t.me/Mbhere1)

[**🇬🇧 English**](#-english) · [**🇮🇹 Italiano**](#-italiano) · [**🛠️ Self-hosting**](#%EF%B8%8F-self-hosting-for-power-users) · [**⚠️ Legal Disclaimer**](#%EF%B8%8F-legal-disclaimer--disclaimer-legale)

</div>

---

<div align="center">

<img src="assets/hero.png" alt="Pezzottio — clean stream list, language-sorted" width="100%">

</div>

---

## 🇬🇧 ENGLISH

### What is Pezzottio

Pezzottio is a Stremio addon that bundles **streams, catalogs, anime resolution, multi-profile and debrid integration into a single install**. You don't need MediaFlowProxy. You don't need Docker. You don't need a VPS of your own. Open Stremio, paste a URL, press play.

- 🔌 **30+ stream sources in one list** — torrent indexers, external Stremio addons, and HTTP streaming sites integrated server-side (StreamingCommunity for movies/series, Animepahe for anime, and others). All merged, ranked by debrid-cached → quality → language preference.
- 📚 **Integrated catalogs** — TMDB-powered Discover for movies/series (Pezzottio Extra) and Kitsu-powered anime catalog with genre filters (Pezzottio Anime). No separate catalog addons required.
- 🤖 **Anime ID resolution** — Kitsu, MAL, AniList, AniDB all resolve correctly. Absolute episode mapping handled (e.g. One Piece S23E08 → ep 1163). Spin-offs and movies filtered out when looking for the main series.
- ⚡ **TorBox + Real-Debrid** — instant cache check. Cached plays in ~2s. Not cached → the addon tells you upfront instead of giving you a "loading failed" 30s later.
- 👥 **Multi-profile** — each configuration generates its own addon URL. Different profiles ("kids", "main", "anime-only") without account juggling.
- 🔧 **Server-side HLS proxy with token rotation** — HTTP-source authentication and segment proxying are handled on the backend. No MediaFlowProxy, no Docker, no env vars required.
- 📦 **Season packs handled** — open S05E03 from a torrent that contains 5 full seasons: Pezzottio picks the right file automatically.
- 📊 **Live status panel** — real-time view of which sources are up / rate-limited.
- 🔒 **No tracking, no analytics, no ads, no cookies.** Stream URLs are signed and short-lived.

### Quick start

1. Open **https://pezz8io.dpdns.org/configure-en**
2. (Optional) Paste your TorBox or Real-Debrid token
3. Click **Install in Stremio**

Works without debrid too (HTTP sources only). Works on Stremio Desktop, Web, iOS, Android, Android TV, FireStick, LG WebOS, Apple TV (via Omni).

### English FAQ

<details>
<summary><b>Is it free?</b></summary>

Yes, the addon is completely free. TorBox and Real-Debrid are third-party debrid services that cost a few dollars/month — they're optional but make playback nearly instant. Without them, the integrated HTTP sources still work.
</details>

<details>
<summary><b>Does Real-Debrid work?</b></summary>

Yes. Pezzottio batch-checks cached torrents and emits lazy URLs that resolve on click — no API rate-limit issues.
</details>

<details>
<summary><b>Do I need MediaFlowProxy, Docker, or my own VPS?</b></summary>

No. That's the whole point. The HLS proxy is already inside Pezzottio's backend. You install one addon URL into Stremio and you're done.
</details>

<details>
<summary><b>Smart TV / FireStick / Apple TV?</b></summary>

Works everywhere Stremio runs. Configure on your phone or PC, then scan the QR code with the TV. No setup on the TV itself other than Stremio.
</details>

<details>
<summary><b>Is my debrid key safe?</b></summary>

The key is encoded inside your personal manifest URL and never stored in a database. It only lives in your URL.
</details>

<details>
<summary><b>Where do I ask for help?</b></summary>

Telegram: [@Mbhere1](https://t.me/Mbhere1). Describe what you tried (title, screenshot) and I'll get back to you.
</details>

---

## 🇮🇹 ITALIANO

### Cosa fa Pezzottio

Pezzottio è un addon Stremio che **trova e riproduce film, serie e anime in italiano** senza che tu debba smanettare con niente. Lo installi una volta, scrivi la tua chiave Torbox, e via. Adesso include anche **cataloghi integrati, multi-profilo e una versione inglese**.

- 🇮🇹 **Audio italiano per primo.** Se esiste una versione doppiata, è in cima. Se no, sottotitoli ITA. Tutto il resto dopo.
- ⚡ **Riproduzione istantanea.** Niente "attesa torrent", niente "loading failed". Con Torbox premi play e parte.
- 📺 **Funziona anche senza account.** Stream HTTP italiani inclusi gratis: **StreamingCommunity, GuardaSerie, AnimeWorld, AnimeSaturn, AnimeUnity**.
- ⚡ **Real-Debrid supportato.** RD ora funziona con cache check istantaneo via batch endpoint (niente più rate-limit).
- 🎯 **Anime, film vecchi, serie introvabili.** Cerca su 30+ fonti contemporaneamente, tutte filtrate per italiano.
- 📦 **Pack stagione gestiti.** Apri S05E03 da un torrent con 5 stagioni intere: Pezzottio fa partire l'episodio giusto da solo.
- 📚 **Cataloghi integrati.** **Pezzottio Extra** (Netflix / Prime / Disney+ / HBO Max / Apple TV+ / Crunchyroll con metadata TMDB) e **Pezzottio Anime** (Kitsu con filtri per genere) direttamente nel Discover di Stremio. Niente addon catalog separati.
- 👥 **Multi-profilo.** Ogni configurazione genera il suo URL. Crea "Casa", "Mamma", "Anime-only" — basta cambiare URL in Stremio per switchare.
- 📊 **Pannello status live.** Vedi in tempo reale quali provider sono up, down o in cooldown.
- 🌐 **Versione inglese.** `pezz8io.dpdns.org/configure-en` per chi vuole guardare in inglese (catalogo separato, audio EN, sub EN, source EN-friendly).
- 🔒 **No tracking, no analytics, no cookie, no ads.**

### Quello che lo rende diverso

Quasi tutti gli addon italiani per Stremio ti chiedono di **ospitare un server tuo da qualche parte** (un VPS, un Raspberry, un NAS sempre acceso) dove far girare MediaFlowProxy. Senza quello, dopo 5 minuti il video si pianta. Devi:

- pagare un VPS o esporre la tua rete di casa
- imparare Docker
- tenere il server sempre acceso
- aggiornare il proxy quando si rompe

**Pezzottio quel proxy ce l'ha già dentro al server pubblico.**

Tu apri il link, copi-incolli in Stremio, finito. Funziona uguale su PC, telefono, tablet, Android TV, Fire TV, Apple TV. Senza ospitare niente.

|  | Altri addon italiani | **Pezzottio** |
|---|:---:|:---:|
| Ti serve un server tuo (VPS/Raspberry) | 🔧 sì | ✅ no |
| Devi installare e mantenere MediaFlowProxy | 🔧 sì | ✅ no |
| Devi sapere cos'è Docker | 🤷 sì | ✅ no |
| Video si blocca dopo 5 min | ⚠️ se sbagli setup | ✅ mai |
| Cataloghi inclusi (Netflix/Prime/...) | ❌ addon separati | ✅ inclusi |
| Multi-profilo | ❌ | ✅ |
| Funziona su Android/Fire TV | 😩 complicato | ✅ subito |
| Tempo di setup | 30-60 min | **30 secondi** |

### Provalo in 30 secondi

**1.** Apri il link 👉 [**https://pezz8io.dpdns.org/configure**](https://pezz8io.dpdns.org/configure)

**2.** Incolla la chiave Torbox (opzionale, ma consigliata)

Se non hai Torbox: [**torbox.app/subscription**](https://torbox.app/subscription) (pochi euro/mese, libreria infinita, niente attese).

**3.** Clicca **"Installa in Stremio"** o inquadra il QR code dalla TV. Fatto.

### FAQ italiane

<details>
<summary><b>Quanto costa?</b></summary>

Pezzottio è gratis. Torbox / Real-Debrid sono opzionali (~5€/mese) e ti permettono riproduzione istantanea. Senza, funzionano comunque gli stream HTTP italiani inclusi.
</details>

<details>
<summary><b>Real-Debrid funziona?</b></summary>

Sì, ora è supportato con cache check via batch endpoint (niente più rate-limit).
</details>

<details>
<summary><b>Devo ospitare qualcosa (MediaFlowProxy, Docker, VPS)?</b></summary>

No, per usare Pezzottio non devi self-hostare nulla. L'**HLS proxy** per StreamingCommunity, VidXgo, AnimeWorld/Saturn/Unity (che normalmente richiederebbero MediaFlowProxy) gira nel nostro server pubblico.

**Disclaimer di onestà:** la modalità predefinita di Pezzottio chiama in parallelo le istanze pubbliche di alcuni addon community-mantenuti (StremThru di Munif, Comet di Goldy, MediaFusion + Meteor di Midnight) per arricchire il pool di torrent. Quelle istanze non sono nostre — sono servizi gratuiti gestiti dai rispettivi maintainer. Se vuoi alleggerire il loro carico puoi self-hostare gli upstream con Docker (sono tutti open-source) e configurare le tue URL via env var — vedi la sezione [Self-hosting](#%EF%B8%8F-self-hosting-for-power-users) sotto.
</details>

<details>
<summary><b>Funziona su Android TV / Fire TV / iPhone / LG WebOS / Apple TV?</b></summary>

Sì, ovunque ci sia Stremio (o un client compatibile come Omni su iOS). Apri `/configure` dal browser del telefono o PC, genera il link e inquadra il QR dalla TV.
</details>

<details>
<summary><b>La mia chiave Torbox / RD è al sicuro?</b></summary>

Sì. La chiave non viene salvata sui nostri server. È codificata dentro il tuo link manifest personale e vive solo lì.
</details>

<details>
<summary><b>Cataloghi anime e Crunchyroll?</b></summary>

Sì: catalogo anime integrato basato su Kitsu (filtri per genere) + supporto qualsiasi catalogo Stremio (Kitsu, MAL, AniList, Crunchyroll, AnimeUnity, ...).
</details>

<details>
<summary><b>Pack stagione: apro S05E03 ma il torrent ha 5 stagioni, parte l'episodio giusto?</b></summary>

Sì. Pezzottio rileva il file giusto dentro l'archivio e parte da lì.
</details>

<details>
<summary><b>Trova film vecchi / anime di nicchia?</b></summary>

Sì. 30+ fonti in parallelo, inclusi gruppi italiani specifici (MIRCrew, NAHOM, Me7alh) + provider HTTP italiani che coprono anche serie vecchie raramente indicizzate altrove.
</details>

<details>
<summary><b>Non vedo stream / qualcosa non funziona, dove chiedo aiuto?</b></summary>

Telegram: [**@Mbhere1**](https://t.me/Mbhere1). Scrivimi con titolo + screenshot e ti rispondo appena posso.
</details>

---

## 🤝 Credits / Upstream services

Pezzottio's `/stream` resolver, in its default configuration, fans out requests in parallel to several community-maintained Stremio addons to enrich the torrent pool. **These instances are NOT ours** — they are free public services generously provided by their respective authors. All credit and gratitude goes to them.

| Upstream | Maintainer | Default instance | Repo |
|---|---|---|---|
| **StremThru** | [Munif](https://github.com/MunifTanjim) | `stremthru.13377001.xyz` | [github.com/MunifTanjim/stremthru](https://github.com/MunifTanjim/stremthru) |
| **Comet** | [Goldy / G0ldyy](https://github.com/g0ldyy) | `comet.feels.legal` | [github.com/g0ldyy/comet](https://github.com/g0ldyy/comet) |
| **MediaFusion** | [Midnight](https://github.com/mhdzumair) | `mediafusionfortheweebs.midnightignite.me` | [github.com/mhdzumair/MediaFusion](https://github.com/mhdzumair/MediaFusion) |
| **Meteor** | [Midnight](https://github.com/mhdzumair) | `meteorfortheweebs.midnightignite.me` | [github.com/mhdzumair/MediaFusion](https://github.com/mhdzumair/MediaFusion) |
| **Torrentio** | [Bogdan89](https://github.com/Bogdan89) (operator) | `torrentio.strem.fun` | [github.com/Stremio/stremio-addon-torrentio](https://github.com/Stremio/stremio-addon-torrentio) |

Catalog data for the Pezzottio Extra catalog (streaming platform sections like Netflix / Prime / Disney+ etc.) is fetched directly from the **public [TMDB API](https://developer.themoviedb.org/)** — no AIOMetadata / external metadata proxy. Anime metadata comes from **[Kitsu API](https://kitsu.docs.apiary.io/)**.

If you're running an instance and want us off your servers, just open an issue — we'll switch defaults or remove. We're also working on self-hosting these upstreams ourselves to reduce load.

---

## 🛠️ Self-hosting (for power users)

If you want to host your own copy (useful for max privacy, heavy users, or to take load off the community upstreams):

```bash
git clone https://github.com/ceres777/pezzottio.git
cd pezzottio
npm install
cp .env.example .env  # fill in your debrid keys + (optional) upstream URLs
npm start
```

Open `http://127.0.0.1:7001/configure` (IT) or `/configure-en` (EN).

Free deploy on Render: the repo includes `render.yaml`. Fork → New Web Service → Deploy.

### Self-hosting the upstream community addons (recommended for heavy users)

Pezzottio defaults to the public instances listed above, but you can override each one via env vars to point at your own private instance:

```bash
# In .env — leave blank to keep the community default, or set your own URL
TORRENTIO_URL=https://my-torrentio.example.com/providers=yts,eztv,...
COMET_URL=https://my-comet.example.com/eyJ...config-base64...
COMET_URL_EN=...                           # same with EN-language filter
STREMTHRU_URL=https://my-stremthru.example.com/stremio/torz/eyJ...
STREMTHRU_URL_EN=...
MEDIAFUSION_URL=https://my-mediafusion.example.com/encrypted-token
MEDIAFUSION_HOST=https://my-mediafusion.example.com
METEOR_URL=https://my-meteor.example.com/eyJ...
METEOR_URL_EN=...
```

Each upstream has its own Docker / install guide on the repo linked in the Credits table. **StremThru** and **Comet** are the lightest (~50-150 MB RAM each) and the most worth self-hosting if you have spare infra — they cover ~90% of what `/stream` needs.

---

## 📞 Support / Supporto

- **Telegram**: [@Mbhere1](https://t.me/Mbhere1) — for any issue, report, or request
- **GitHub Issues**: [github.com/ceres777/pezzottio/issues](https://github.com/ceres777/pezzottio/issues)

---

## ⚠️ Legal Disclaimer / Disclaimer Legale

> ### English Version

**1. Nature of the Software.** Pezzottio (the "Software", the "Project", the "Addon") is a free, open-source, non-commercial, educational software project. The Software is a metadata aggregator and proxy layer that operates exclusively as a client of publicly accessible, third-party Application Programming Interfaces ("third-party APIs") and publicly indexed resources. The Software does not host, store, cache for distribution, upload, seed, share, transmit, transcode for redistribution, or otherwise distribute any audiovisual, textual, or other copyrighted content. The Software is, by design and by implementation, content-agnostic.

**2. "AS IS" and "AS AVAILABLE" Basis.** THE SOFTWARE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, COMPLETENESS, OR UNINTERRUPTED SERVICE. NO ORAL OR WRITTEN INFORMATION OR ADVICE GIVEN BY THE AUTHOR, MAINTAINERS, OR CONTRIBUTORS SHALL CREATE A WARRANTY.

**3. Limitation of Liability.** TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE AUTHOR, MAINTAINERS, CONTRIBUTORS, OR HOSTING PROVIDERS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF PROFITS, BUSINESS INTERRUPTION, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES, OR ANY LEGAL FEES, FINES, OR JUDGMENTS) ARISING OUT OF OR IN ANY WAY CONNECTED WITH THE USE, MISUSE, OR INABILITY TO USE THE SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

**4. User Responsibility.** The end user ("User") is solely, exclusively, and entirely responsible for: (a) the manner in which the Software is used; (b) the legal status of any third-party content, links, streams, or resources accessed by, through, or with the Software; (c) compliance with all applicable national, supranational, regional, and local laws, statutes, regulations, treaties, directives, and ordinances, including but not limited to copyright law, intellectual property law, data protection law, electronic communications law, broadcasting law, and any law concerning the access to, possession of, reproduction of, distribution of, or public communication of audiovisual works; (d) obtaining, holding, and maintaining all licenses, authorizations, subscriptions, or permissions required by the User's jurisdiction to access any content; (e) any financial, civil, administrative, or criminal consequence arising from such use. By installing, configuring, or otherwise using the Software, the User unconditionally accepts this responsibility in full.

**5. Educational and Research Purpose.** The Software is developed, distributed, and made available strictly for educational, research, interoperability, technical demonstration, personal study, and academic illustration purposes. Any other use is undertaken at the User's own initiative and entirely at the User's own risk. The Author does not encourage, endorse, solicit, condone, promote, advise, or otherwise invite the use of the Software for any unlawful purpose.

**6. Third-Party Services and Trademarks.** The Software interacts with third-party services and APIs operated by independent entities ("Third-Party Services"), including but not limited to debrid services, metadata providers, public torrent indexers, and streaming sites. The Author has no affiliation, sponsorship, partnership, endorsement, license, or commercial relationship with any of these Third-Party Services unless explicitly stated. All trademarks, service marks, trade names, product names, logos, and brand identifiers referenced in the Software, the documentation, the configuration interfaces, or any associated materials are and remain the exclusive property of their respective owners. References are used solely for descriptive, identifying, and interoperability purposes and do not imply any endorsement, affiliation, or sponsorship. The User is responsible for complying with the Terms of Service of each Third-Party Service the User chooses to use.

**7. No Content Hosting; Compliance Procedure.** The Author does not host, control, edit, or monitor the content available through Third-Party Services. The Software performs purely transient technical operations (caching, transcoding hints, segment proxying) that fall within recognized safe-harbor provisions of applicable law, including, where applicable, the EU Directive on Electronic Commerce (2000/31/EC), the EU Digital Services Act (Regulation (EU) 2022/2065), the United States Digital Millennium Copyright Act (17 U.S.C. § 512), and analogous national implementing legislation. Should any rights holder believe that the Software, in its source code, default configuration, or documentation, facilitates infringement of their rights, they are invited to submit a written, substantiated, and legally compliant notice to the maintainer contact listed in this repository. The Author reserves the right to remove, disable, modify, or amend any component of the Software upon receipt of a valid notice.

**7-bis. Default Upstream Community Addons.** In its default configuration, the Software's `/stream` resolver issues parallel HTTP requests to several public instances of community-maintained Stremio addons in order to enrich the torrent pool: **StremThru** (default endpoint `https://stremthru.13377001.xyz`, maintained by Munif Tanjim), **Comet** (default endpoint `https://comet.feels.legal`, maintained by Goldy/g0ldyy), **MediaFusion** and **Meteor** (default endpoints under `*.midnightignite.me`, maintained by Midnight/mhdzumair), and **Torrentio** (default endpoint `https://torrentio.strem.fun`). These instances are free public services generously made available by their respective maintainers; the Author has no affiliation, partnership, sponsorship, or commercial relationship with them, has not requested authorization for the volume of traffic generated by the public Pezzottio instance, and acknowledges that such usage is undertaken at the discretion and tolerance of the upstream maintainers. Each upstream endpoint is overridable via environment variable (`STREMTHRU_URL`, `COMET_URL`, `COMET_URL_EN`, `MEDIAFUSION_URL`, `MEDIAFUSION_HOST`, `METEOR_URL`, `METEOR_URL_EN`, `TORRENTIO_URL`); self-hosting users are strongly encouraged to deploy their own private instances of these upstream addons (all of which are open-source) rather than relying on the community defaults. Should any upstream maintainer wish to be removed from the default configuration, a notice opened on the repository issue tracker shall be honored promptly. Full credits and links to each upstream project are provided in the "Credits / Upstream services" section of this repository's README.

**8. No Storage of User Data.** The publicly hosted instance of the Software, if and when available, does not persist user credentials, debrid API keys, IP addresses, viewing history, watchlists, or any other personally identifiable information in a database. Debrid keys and configuration parameters are encoded inside the User's personal addon URL and exist only therein. No telemetry, advertising, third-party tracker, or analytics is integrated into the Software. The Author reserves the right to retain transient operational logs (request paths, timestamps, status codes, error traces) strictly for the purpose of preserving service stability, diagnosing technical malfunctions, and preventing abuse, with such logs being rotated and discarded according to a short retention policy.

**9. No Guarantee of Availability.** The Author makes no commitment to maintain, operate, host, or continue the public instance of the Software, in whole or in part, for any period of time. The public instance, third-party API integrations, individual sources, catalogs, and any other component may be discontinued, suspended, throttled, or modified at any time, without prior notice, and without any obligation to provide replacement, migration, or refund of any kind.

**10. Self-Hosting.** The Software's source code is distributed under the MIT License. Users who wish to deploy a private, independently operated instance of the Software for their own personal use are free to do so under the terms of the MIT License. Self-hosting Users are solely responsible for the legal status of their deployment in their jurisdiction, including any obligations regarding registration, taxation, data protection, and content moderation that may apply.

**11. No Professional Advice.** Nothing in the Software, the documentation, the website, or any associated communication channel constitutes legal advice, fiscal advice, technical certification, or any other form of professional consultation. Users seeking such guidance must consult a qualified, locally licensed professional.

**12. Indemnification.** The User agrees to indemnify, defend, and hold harmless the Author, the maintainers, the contributors, and any hosting providers from and against any and all claims, demands, actions, suits, proceedings, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or in any way related to (a) the User's use or misuse of the Software, (b) the User's violation of any law, regulation, or third-party right, or (c) the User's breach of any term of this Disclaimer.

**13. Severability.** If any provision of this Disclaimer is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such provision shall be deemed modified to the minimum extent necessary to make it valid, legal, and enforceable; the remaining provisions shall continue in full force and effect.

**14. Acceptance.** Installation, configuration, deployment, or any other use of the Software constitutes the User's unconditional and irrevocable acceptance of every term of this Disclaimer. Users who do not agree with any term of this Disclaimer must not install, configure, deploy, or use the Software.

**15. Amendments.** The Author reserves the right to modify, amend, supplement, or replace this Disclaimer at any time, at the Author's sole discretion. The current version of the Disclaimer is the version published in this repository at the time the User accesses the Software. Continued use of the Software after any modification constitutes acceptance of the modified Disclaimer.

**16. Governing Law and Jurisdiction.** This Disclaimer shall be governed by and construed in accordance with the laws of the Italian Republic, without regard to its conflict of laws principles. Any dispute arising out of or in connection with this Disclaimer shall be subject to the exclusive jurisdiction of the courts having competence over the legal residence of the Author, to the extent permitted by applicable mandatory provisions of consumer or other protective legislation.

---

> ### Versione Italiana

**1. Natura del Software.** Pezzottio (il "Software", il "Progetto", l'"Addon") è un progetto software libero, open-source, non commerciale e a scopo educativo. Il Software è un aggregatore di metadati e uno strato di proxy tecnico che opera esclusivamente come client di Application Programming Interfaces ("API di terze parti") e risorse pubblicamente indicizzate, gestite da soggetti indipendenti. Il Software **non ospita, non archivia per la distribuzione, non memorizza in modo persistente, non carica, non condivide tramite seeding, non trasmette, non transcodifica per la ridistribuzione, né altrimenti distribuisce alcun contenuto audiovisivo, testuale o di altra natura protetto da diritto d'autore**. Per design e per implementazione, il Software è agnostico rispetto al contenuto.

**2. Fornitura "COSÌ COM'È" e "COME DISPONIBILE".** IL SOFTWARE È FORNITO "COSÌ COM'È" E "COME DISPONIBILE", SENZA GARANZIE DI ALCUN GENERE, ESPRESSE O IMPLICITE, INCLUSE, A TITOLO ESEMPLIFICATIVO E NON ESAUSTIVO, GARANZIE IMPLICITE DI COMMERCIABILITÀ, IDONEITÀ A UN PARTICOLARE SCOPO, NON VIOLAZIONE DI DIRITTI DI TERZI, ACCURATEZZA, COMPLETEZZA O CONTINUITÀ DEL SERVIZIO. Nessuna informazione o consiglio, orale o scritto, fornito dall'Autore, dai manutentori o dai contributori costituisce o costituirà una garanzia.

**3. Limitazione di Responsabilità.** NELLA MISURA MASSIMA CONSENTITA DALLA LEGGE APPLICABILE, IN NESSUN CASO L'AUTORE, I MANUTENTORI, I CONTRIBUTORI O I PROVIDER DI HOSTING SARANNO RESPONSABILI PER ALCUN DANNO DIRETTO, INDIRETTO, INCIDENTALE, SPECIALE, ESEMPLARE, CONSEQUENZIALE O PUNITIVO (INCLUSI, A TITOLO ESEMPLIFICATIVO, PERDITA DI DATI, PERDITA DI PROFITTI, INTERRUZIONE DELL'ATTIVITÀ, COSTI PER L'APPROVVIGIONAMENTO DI BENI O SERVIZI SOSTITUTIVI, ONERI LEGALI, SANZIONI O CONDANNE) DERIVANTI DA O IN QUALSIASI MODO CONNESSI ALL'USO, ALL'USO IMPROPRIO O ALL'IMPOSSIBILITÀ DI USO DEL SOFTWARE, ANCHE SE INFORMATI DELLA POSSIBILITÀ DI TALI DANNI.

**4. Responsabilità dell'Utente.** L'utente finale ("Utente") è l'unico, esclusivo e integrale responsabile di: (a) le modalità con cui il Software viene utilizzato; (b) la qualifica giuridica di qualsiasi contenuto, link, stream o risorsa di terze parti consultato o reso accessibile tramite il Software; (c) il rispetto integrale di tutte le leggi, normative, regolamenti, trattati, direttive, ordinanze e disposizioni applicabili a livello nazionale, sovranazionale, regionale e locale, ivi inclusi, a titolo non esaustivo, il diritto d'autore, il diritto della proprietà intellettuale, la normativa in materia di protezione dei dati personali, la normativa sulle comunicazioni elettroniche, la normativa sulla radiodiffusione e qualsivoglia disposizione relativa all'accesso, al possesso, alla riproduzione, alla distribuzione o alla comunicazione al pubblico di opere audiovisive; (d) l'ottenimento e il mantenimento di tutte le licenze, autorizzazioni, abbonamenti o permessi richiesti nella giurisdizione dell'Utente per accedere a qualsivoglia contenuto; (e) qualunque conseguenza di carattere economico, civile, amministrativo o penale derivante da tale uso. Installando, configurando o altrimenti utilizzando il Software, l'Utente accetta incondizionatamente e integralmente tale responsabilità.

**5. Finalità Educativa e di Ricerca.** Il Software è sviluppato, distribuito e reso disponibile esclusivamente per finalità di studio, ricerca, interoperabilità tecnica, dimostrazione didattica, approfondimento personale e illustrazione accademica. Qualunque altro utilizzo è effettuato per iniziativa autonoma dell'Utente e a totale ed esclusivo rischio dello stesso. L'Autore non incoraggia, non promuove, non approva, non sollecita né altrimenti invita l'uso del Software per finalità illecite.

**6. Servizi di Terze Parti e Marchi.** Il Software interagisce con servizi e API gestiti da soggetti indipendenti ("Servizi di Terze Parti"), inclusi a titolo esemplificativo servizi di debrid, fornitori di metadati, indici di torrent pubblici e siti di streaming. L'Autore non ha alcun rapporto di affiliazione, sponsorizzazione, partnership, endorsement, licenza o relazione commerciale con tali Servizi di Terze Parti, salvo ove espressamente dichiarato. Tutti i marchi, marchi di servizio, denominazioni commerciali, nomi di prodotto, loghi e segni distintivi citati nel Software, nella documentazione, nelle interfacce di configurazione o nei materiali correlati sono di proprietà esclusiva dei rispettivi titolari. Tali riferimenti sono utilizzati esclusivamente per finalità descrittive, identificative e di interoperabilità tecnica e non implicano alcun endorsement, affiliazione o sponsorizzazione. L'Utente è responsabile del rispetto dei Termini di Servizio di ciascun Servizio di Terze Parti del quale decida di avvalersi.

**7. Assenza di Hosting di Contenuti; Procedura di Conformità.** L'Autore non ospita, non controlla, non modifica e non monitora i contenuti accessibili tramite i Servizi di Terze Parti. Il Software esegue operazioni tecniche di natura transitoria (caching, suggerimenti di transcodifica, proxy di segmenti) che ricadono nelle previsioni di esonero da responsabilità riconosciute dalla normativa applicabile, ivi incluse, ove applicabili, le disposizioni della Direttiva 2000/31/CE sul commercio elettronico, del Regolamento (UE) 2022/2065 (Digital Services Act), e della corrispondente normativa nazionale di recepimento (D.Lgs. 70/2003 e successive modifiche). Qualora un titolare di diritti ritenga che il Software, nel suo codice sorgente, nella configurazione predefinita o nella documentazione, agevoli la violazione dei propri diritti, è invitato a trasmettere una notifica scritta, motivata e conforme ai requisiti di legge al contatto del manutentore indicato nel presente repository. L'Autore si riserva il diritto di rimuovere, disabilitare, modificare o emendare qualsiasi componente del Software a fronte del ricevimento di una notifica valida.

**7-bis. Addon di Comunità Predefiniti come Upstream.** Nella propria configurazione predefinita, il resolver `/stream` del Software invia richieste HTTP in parallelo verso diverse istanze pubbliche di addon Stremio mantenuti dalla comunità, al fine di arricchire il pool di torrent: **StremThru** (endpoint predefinito `https://stremthru.13377001.xyz`, mantenuto da Munif Tanjim), **Comet** (endpoint predefinito `https://comet.feels.legal`, mantenuto da Goldy/g0ldyy), **MediaFusion** e **Meteor** (endpoint predefiniti sotto `*.midnightignite.me`, mantenuti da Midnight/mhdzumair), e **Torrentio** (endpoint predefinito `https://torrentio.strem.fun`). Tali istanze sono servizi pubblici gratuiti generosamente messi a disposizione dai rispettivi manutentori; l'Autore non ha alcuna affiliazione, partnership, sponsorizzazione o relazione commerciale con essi, non ha richiesto autorizzazione per il volume di traffico generato dall'istanza pubblica di Pezzottio, e riconosce che tale utilizzo è subordinato alla discrezione e tolleranza dei manutentori upstream. Ciascun endpoint upstream è sovrascrivibile tramite variabile d'ambiente (`STREMTHRU_URL`, `COMET_URL`, `COMET_URL_EN`, `MEDIAFUSION_URL`, `MEDIAFUSION_HOST`, `METEOR_URL`, `METEOR_URL_EN`, `TORRENTIO_URL`); gli utenti che fanno self-hosting sono fortemente incoraggiati a deployare le proprie istanze private di tali addon upstream (tutti open-source) anziché affidarsi ai default di comunità. Qualora un manutentore upstream desideri essere rimosso dalla configurazione predefinita, una segnalazione aperta sull'issue tracker del repository sarà onorata tempestivamente. Crediti completi e link a ciascun progetto upstream sono forniti nella sezione "Credits / Upstream services" del README di questo repository.

**8. Assenza di Conservazione dei Dati dell'Utente.** L'istanza pubblicamente ospitata del Software, ove disponibile, non conserva su database credenziali utente, chiavi API di debrid, indirizzi IP, cronologie di visualizzazione, watchlist o qualsivoglia altra informazione personalmente identificabile. Le chiavi di debrid e i parametri di configurazione sono codificati all'interno dell'URL personale dell'addon dell'Utente ed esistono unicamente lì. Nessun sistema di telemetria, pubblicità, tracker di terze parti o analitica è integrato nel Software. L'Autore si riserva la facoltà di conservare log operativi transitori (percorsi delle richieste, timestamp, codici di stato, tracce di errore) esclusivamente al fine di preservare la stabilità del servizio, diagnosticare malfunzionamenti tecnici e prevenire abusi, con politica di rotazione e cancellazione a breve termine.

**9. Nessuna Garanzia di Disponibilità.** L'Autore non assume alcun impegno a mantenere, operare, ospitare o continuare l'istanza pubblica del Software, in tutto o in parte, per alcun periodo di tempo. L'istanza pubblica, le integrazioni con API di terze parti, le singole fonti, i cataloghi e qualunque altro componente potranno essere dismessi, sospesi, limitati o modificati in qualsiasi momento, senza preavviso e senza alcun obbligo di fornire sostituzioni, migrazioni o rimborsi.

**10. Self-Hosting.** Il codice sorgente del Software è distribuito secondo i termini della Licenza MIT. Gli Utenti che desiderino effettuare il deployment di un'istanza privata e gestita in modo indipendente del Software, per il proprio uso personale, sono liberi di farlo nei termini della Licenza MIT. Gli Utenti che ospitano autonomamente il Software sono esclusivi responsabili della qualifica giuridica del loro deployment nella propria giurisdizione, ivi inclusi obblighi di registrazione, fiscali, di protezione dei dati e di moderazione dei contenuti eventualmente applicabili.

**11. Assenza di Consulenza Professionale.** Nessun elemento contenuto nel Software, nella documentazione, nel sito web o in qualsivoglia canale di comunicazione associato costituisce consulenza legale, consulenza fiscale, certificazione tecnica o altra forma di consulenza professionale. Gli Utenti che necessitino di tale consulenza sono tenuti a rivolgersi a un professionista qualificato e abilitato nella propria giurisdizione.

**12. Manleva e Indennizzo.** L'Utente si impegna a manlevare, difendere e tenere indenni l'Autore, i manutentori, i contributori e qualsivoglia provider di hosting da e contro ogni e qualsiasi pretesa, richiesta, azione, causa, procedimento, responsabilità, danno, perdita, costo e spesa (incluse le ragionevoli spese legali) derivanti da o in qualunque modo connessi a (a) l'uso o l'uso improprio del Software da parte dell'Utente, (b) la violazione di qualsivoglia legge, regolamento o diritto di terzi da parte dell'Utente, (c) la violazione di qualsivoglia clausola del presente Disclaimer da parte dell'Utente.

**13. Salvaguardia delle Clausole.** Qualora una qualsivoglia disposizione del presente Disclaimer sia ritenuta invalida, illegittima o non eseguibile da parte di un'autorità giudiziaria competente, tale disposizione sarà considerata modificata nella misura minima necessaria a renderla valida, legittima ed eseguibile; le restanti disposizioni resteranno pienamente in vigore.

**14. Accettazione.** L'installazione, la configurazione, il deployment o qualsivoglia altro utilizzo del Software costituisce accettazione incondizionata e irrevocabile, da parte dell'Utente, di ogni clausola del presente Disclaimer. Gli Utenti che non intendano accettare anche una sola clausola del presente Disclaimer sono tenuti a non installare, non configurare, non distribuire e non utilizzare il Software.

**15. Modifiche.** L'Autore si riserva il diritto di modificare, integrare, sostituire o emendare il presente Disclaimer in qualsiasi momento, a propria esclusiva discrezione. La versione vigente è quella pubblicata in questo repository nel momento in cui l'Utente accede al Software. Il proseguimento dell'uso del Software successivo a qualsivoglia modifica costituisce accettazione del Disclaimer modificato.

**16. Legge Applicabile e Foro Competente.** Il presente Disclaimer è regolato e interpretato secondo la legge della Repubblica Italiana, senza riguardo ai relativi principi sui conflitti di legge. Qualunque controversia derivante dal o connessa al presente Disclaimer sarà devoluta alla competenza esclusiva del foro avente competenza sulla residenza legale dell'Autore, nei limiti consentiti dalle disposizioni inderogabili in materia di tutela del consumatore o di altra natura.

---

## 📜 License / Licenza

MIT. See [`LICENSE`](LICENSE).

---

<div align="center">

**Stop searching. Start watching. · Smetti di cercare. Inizia a guardare.**

### 🇬🇧 [pezz8io.dpdns.org/configure-en](https://pezz8io.dpdns.org/configure-en) · 🇮🇹 [pezz8io.dpdns.org/configure](https://pezz8io.dpdns.org/configure)

<sub>Open source · MIT · 🇮🇹 Made in Italy · Support / Supporto: [@Mbhere1](https://t.me/Mbhere1)</sub>

</div>
