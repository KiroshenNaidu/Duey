'use client';

// Full-screen loading splash shown while AppDataContext hydrates (gated by `isLoaded`).
// Just a solid dark screen on the app's background — the app loads fast enough that a
// plain black splash bridges the native splash / WebView and the React first paint
// without any flash. Dismisses the instant the app is ready.
export function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] animate-in fade-in duration-150"
      style={{ backgroundColor: '#111113' }}
    />
  );
}
