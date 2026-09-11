// Paste this entire block into the browser DevTools console while the app is open.
// It wipes every trace of the app's data on this device — the same keys Settings → Data
// Management → Clear All Data removes, plus the whole IndexedDB store — and reloads into a
// fresh install (currency picker, tutorial, the lot).
//
// To reset the Android build instead: adb shell pm clear com.duey.app

(async () => {
  // Kill persistence expectations first: the reload below must not race a pending write.
  for (const key of ['appState', 'appState_corrupt_backup', 'appState_corrupt_backup_at',
                     'duey_device_id', 'duey_tutorial_seen']) {
    localStorage.removeItem(key);
  }
  sessionStorage.clear();

  // Wallpapers and the avatar live in IndexedDB, not localStorage — clearing only the
  // latter leaves a fresh install wearing the old background.
  try {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: 'AppDataStore' }];
    await Promise.all(dbs.map(({ name }) => name && new Promise(resolve => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    })));
  } catch (e) {
    console.warn('IndexedDB not fully cleared:', e);
  }

  console.log('App data cleared. Reloading…');
  location.reload();
})();
