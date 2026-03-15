# Audiobook PoC — Audible Search, Download & DRM Decryption

A standalone proof-of-concept demonstrating Audible library search, AAX/AAXC download, and
DRM decryption via ffmpeg. This is **not** connected to the main Transcribedd project.

---

## Legal Disclaimer

> **Personal use only.** DRM circumvention laws vary by jurisdiction. In the United States,
> the DMCA (17 U.S.C. § 1201) restricts bypassing technological protection measures.
> Exceptions exist for personal format-shifting of media you legally own; however, this
> is unsettled law and you should consult legal counsel before relying on any exception.
>
> This code is provided for **research and educational purposes only**. The authors do not
> condone piracy. Only use these scripts on audiobooks you have purchased and own a licence
> for. Do not distribute decrypted copies.

---

## Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://www.python.org/) |
| ffmpeg | any recent | `brew install ffmpeg` (macOS) / `apt install ffmpeg` (Linux) |
| audible-cli | latest | `pip install audible-cli` |

---

## One-Time Setup

### 1. Authenticate with Audible

Run the interactive quickstart to generate an auth file:

```bash
audible quickstart
```

Follow the prompts. By default this creates `~/.audible/credentials.json` (the path you
will pass as `--auth-file` to every script below).

### 2. Retrieve your activation bytes

Activation bytes are a short hex string tied to your Audible account. They are needed to
decrypt AAX files.

```bash
audible activation-bytes
```

Copy the 8-character hex string (e.g. `1a2b3c4d`). Keep it private — it unlocks all AAX
files associated with your account.

---

## Install Python dependencies

```bash
cd audiobook-poc
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## Scripts

### search.py — Search your Audible library

```bash
# Search by title keyword
python search.py --auth-file ~/.audible/credentials.json --query "Sapiens"

# Look up a single book by ASIN
python search.py --auth-file ~/.audible/credentials.json --asin B00ICN066A

# Extra options
python search.py --auth-file ~/.audible/credentials.json --query "Dune" --limit 5 --locale uk
```

### download.py — Download an AAX file

```bash
python download.py \
  --auth-file ~/.audible/credentials.json \
  --asin B00ICN066A \
  --output ./downloads/
```

Options: `--quality` (default `Extreme`), `--codec` (default `AAX`).

### decrypt.py — Decrypt an AAX file to MP3/WAV

```bash
python decrypt.py \
  --input ./downloads/B00ICN066A.aax \
  --activation-bytes 1a2b3c4d \
  --output ./output/sapiens.mp3
```

Options: `--format mp3` (default) or `--format wav`.

### pipeline.py — All-in-one: search → download → decrypt

```bash
python pipeline.py \
  --auth-file ~/.audible/credentials.json \
  --activation-bytes 1a2b3c4d \
  --asin B00ICN066A \
  --output ./output/
```

This looks up the book, downloads the AAX to a temp file, decrypts it to
`{Title}.mp3` in the output directory, and cleans up the temp file.

---

## Directory layout

```
audiobook-poc/
  audible_client.py   # shared async helpers (imported by all scripts)
  search.py           # library search CLI
  download.py         # AAX download CLI
  decrypt.py          # AAX decryption CLI
  pipeline.py         # all-in-one CLI
  requirements.txt
  downloads/          # default download destination (git-ignored)
  output/             # default decryption destination (git-ignored)
```

---

## Troubleshooting

**`audible` ImportError** — make sure you activated the virtualenv and ran `pip install -r requirements.txt`.

**`ffmpeg not found`** — install ffmpeg and ensure it is on your PATH (`ffmpeg -version` should print a version).

**`401 Unauthorized` from Audible** — re-run `audible quickstart`; sessions can expire.

**Wrong activation bytes** — re-run `audible activation-bytes`. The hex string is
account-scoped, not device-scoped.
