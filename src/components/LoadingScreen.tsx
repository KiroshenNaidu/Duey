'use client';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
      <p className="text-sm font-medium tracking-widest uppercase text-black/40">Loading...</p>
    </div>
  );
}
