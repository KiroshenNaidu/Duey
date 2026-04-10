# Duey 
**A personal, debt and transit tracker.**

[![Download APK](https://img.shields.io/badge/Download-APK-green?style=for-the-badge&logo=android)](https://github.com/KiroshenNaidu/Duey/releases/download/v.1.1/Deuy_V1.1.apk)

> **Why I built this:** 
> I have a pretty bad memory. I needed a simple way to keep track of what I owe and when I traveled to work without relying on scattered notes or mental math. I built Duey purely for myself to stay organized, but feel free to use it if you find it helpful!
> Heads up, the lower navigation bars **might** look a little larger for you if your device is utilsing the **Swipe Gestures**, I pretty much just added padding to the top and bottom so it sits well on devices that use the **Home Button Navigation** (as thats what I use).

---

## Privacy First (100% Offline)
Security is handled by keeping everything off the grid.
*   **No Internet Required:** The app has zero online connectivity.
*   **Local Storage:** All your data is saved in a simple **JSON file** directly on your phone.

---

##  Key Features

### Debt Management
*   **Track Balances:** Add entries for money owed and manually update them as you pay them off.
*   **Progress Tracking:** See exactly how much is left on any specific debt at a glance.
*   **Notes:** Each entry has a small notes button to jot down specific details or reminders.

### Transportation Calculator
*   **Calendar Integration:** A custom calendar where you can tap the days you traveled to work.
*   **Auto-Calc:** It automatically calculates the total amount you owe for transportation based on the days you've selected.

### Stats & Utilities
*   **Payment History:** A dedicated stats page showing when you paid, how much you paid, and when you paid. (not as reputable as a bank statement obviously)
*   **Built-in Calculator:** A calculator is baked into the app so you don't have to switch between apps to do math.
*   **Custom Themes:** Fully customizable UI—change the colors and look to match your personal style and upload whatever image you wish for your background

---
  
*   **BUG:** So small warning, i couldnt fix this but since its a small bug its not something I personally would want to lose (more) hair over, basically when you update the theme, an incomplete Debts page renders instead of the settings page, so just close the app and re-open it, it fixes itself pretty well and your theme will still be saved.

---

## Tech Stack
*   **Frontend:** Next.js & TypeScript
*   **Mobile Bridge:** Capacitor (Cross-platform)
*   **Build Tool:** Android Studio
*   **Data:** Local JSON File System

---

## Installation
1.  Download the latest APK from the [Releases Page](https://github.com/KiroshenNaidu/Duey/releases/latest).
2.  Open the `.apk` file on your Android device.
3.  You may need to "Allow installation from unknown sources" in your settings as well as telling Google this file is safe to install, Google will warn against it since its just a raw APK and typically is dangerous(in the context of downloading files from the internet from strangers...) so act with caution, me saying "trust me bro, just download my app its safe" is naturally, not something people would believe, so install if you trust the file, dont install if you dont, I wouldnt blame you lmao.
4.  Launch **Duey** and look at your debts in shame.

---
*Built with <3 to solve my own forgetfulness.*
