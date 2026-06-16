# Duey
**A personal debt and transport tracker.**

[![Download APK](https://img.shields.io/badge/Download-APK-green?style=for-the-badge&logo=android)](https://github.com/KiroshenNaidu/Duey/releases/download/v.1.1/Deuy_V1.1.apk)

> I have a pretty bad memory. I needed a simple way to keep track of what I owe and when I traveled to work without relying on scattered notes or mental math. Built this purely for myself — feel free to use it if it helps you too.

---

## Privacy First — 100% Offline

- **No internet required.** Zero online connectivity.
- **Local storage only.** All data is saved directly on your device via IndexedDB.

---

## Features

### Debt Management
- Add and track balances for money owed
- See repayment progress at a glance
- Attach notes to individual debt entries

### Transport Calculator
- Tap days on a custom calendar to mark days you traveled
- Auto-calculates your total transport cost for the month

### Stats
- View payment history: what was paid, how much, and when

### Utilities
- Built-in calculator so you don't have to leave the app
- Export data to PDF, DOCX, or XLSX

### Customisation
- Change app colors and upload a custom background image
- **Note:** After changing the theme, close and reopen the app — an incomplete render shows briefly but your theme saves correctly.

---

## Notes

- Currency is hardcoded to ZAR (R). The numbers calculate the same regardless, so it's a cosmetic thing if you want to change it.
- Navigation bar padding is tuned for Home Button Navigation. Swipe Gesture devices may see slightly larger bars.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS, Radix UI, shadcn/ui |
| Mobile | Capacitor 7 (Android) |
| Storage | IndexedDB (via `idb`) |
| Charts | Recharts |
| Export | jsPDF, docx, xlsx |

---

## Installation

1. Download the latest APK from the [Releases page](https://github.com/KiroshenNaidu/Duey/releases/latest).
2. Open the `.apk` on your Android device.
3. Allow installation from unknown sources when prompted — Google will warn you since it's a raw APK. Install if you trust the file; don't if you don't. Fair enough.
4. Launch **Duey** and face your debts.

---

## Local Development

```bash
npm install
npm run dev        # runs on port 9002
```

To build and sync to Android:

```bash
npm run sync:android   # next build && cap sync android
npm run android        # opens Android Studio
```

---

*Built with <3 to solve my own forgetfulness.*
