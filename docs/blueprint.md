# **App Name**: DebtMate

## Core Features:

- Debt Entry & Management: Users can add, view, and manage debt entries, each with a title, total amount, and monthly installment amount (all values defaulting to South African Rand).
- Payment Increment Tracker: Each debt card includes a prominent '+1 Payment' button to manually increment a 'payment score', reflecting installments paid, with the score capped at the total installments due.
- Payment History Log: Automatically record each '+1 Payment' action with a timestamp and the associated debt's title in a dedicated history log, accessible from the Settings tab.
- Financial Overview Dashboard: A dedicated 'Stats' section displaying a 'Global Total Debt', 'Global Amount Paid', and 'Global Remaining Balance', providing an aggregated view of all debts.
- Debt Progress Visualizer: In the 'Stats' section, visually represent each debt's payment progress using intuitive charts, highlighting 100% completion in a distinct green color.
- Offline Data Persistence: Securely save all application data locally to the user's device using localStorage, enabling full offline functionality and ensuring user privacy with no external servers.
- Data Export & Import: A 'Settings' feature allowing users to export all their financial data to a 'debt_backup.json' file for backup, and import from a previously exported file for data restoration.

## Style Guidelines:

- A deep, professional primary blue (#4062BF) to represent stability and trustworthiness in financial management.
- A dark, slightly blue-tinted background (#16181C) to establish a clean, dark-mode friendly and professional aesthetic.
- A bright cyan accent (#3DD0E9) for highlights and interactive elements, providing clear contrast against the dark background.
- Body and headline font: 'Inter' (sans-serif) for its modern, objective, and highly legible appearance, suitable for financial data.
- Use clear, modern, and outline-style icons provided by Lucide-React to maintain a consistent and professional look.
- Implement a 'Bottom Navigation Bar' with three distinct tabs: Debts, Stats, and Settings for intuitive mobile navigation.
- All interactive elements, particularly the '+1 Payment' button, will be large and touch-friendly for optimal mobile usability.
- Progress bars for debt visualization will clearly indicate completion, turning a vibrant green upon reaching 100%.