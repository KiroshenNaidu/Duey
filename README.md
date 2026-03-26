Debt & Transit Tracker
Note: I built this app purely for myself. I have a pretty bad memory, and I needed a simple, reliable way to keep track of what I owe and when I traveled without relying on scattered notes or mental math.
A lightweight, offline-first tracking application built with Next.js, TypeScript, and Capacitor. This app is designed to help you manage personal debts and calculate transportation costs with absolute privacy.
📱 Download & Install
Since this is a personal project, it is not on the Play Store. You can download the latest version directly from the GitHub Releases page:
[![Download APK](https://img.shields.io/badge/Download-APK-green?style=for-the-badge&logo=android)](https://github.com/KiroshenNaidu/Duey/releases/latest)
Note: You may need to "Allow installation from unknown sources" in your Android settings to install the APK.
🚀 Key Features
1. Debt Tracking
Manual Entry: Quickly add who you owe and the total amount.
Progress Tracking: Manually update your balance as you make payments.
Visual Stats: A dedicated stats page to see your payment history, when you paid, and your overall progress.
2. Transportation & Calendar
Work Log: Use the built-in calendar to select the days you traveled to work.
Automated Calculation: The app calculates exactly how much you owe for transportation based on your custom daily rate.
3. Utility Tools
Built-in Calculator: Quickly crunch numbers without leaving the app.
Quick Notes: A small notes button on each entry for reminders or specific details about a debt.
4. Custom Themes
Personalized UI: Full control over the app's look and feel with custom theme settings.
🔒 Security & Privacy (100% Offline)
This app is built for maximum privacy:
No Internet Required: The app runs purely locally. There are no servers, no cloud sync, and no tracking.
Local Storage: All data is saved in a JSON file directly on your phone’s internal storage via Capacitor.
Data Ownership: Your data never leaves your device. If you delete the app or its data, the information is gone.
🛠 Tech Stack
Framework: Next.js (React)[1]
Language: TypeScript
Mobile Bridge: Capacitor (to convert the web app into a native Android app)[2]
Native Build: Compiled using Android Studio
Storage: Local JSON filesystem
Created to help a forgetful mind keep things organized.
