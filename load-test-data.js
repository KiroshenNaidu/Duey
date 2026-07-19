// Paste this entire block into the browser DevTools console while the app is open.
// It loads the bundled Alex Dlamini sample dataset (a full duey-backup: debts, history,
// budgets, transport, custom themes, favourites, day/night + all quick-menu settings) and
// reloads the app. The file is served from /public, so this works on the dev server.

fetch('/test-data.json')
  .then(r => r.json())
  .then(data => {
    // Match the app's Import: strip the backup envelope + wallpaper/avatar blobs, keep the state.
    const { _meta, backgroundImage, backgroundVideo, avatarImage, ...appState } = data;
    localStorage.setItem('appState', JSON.stringify(appState));
    console.log('Test data loaded. Reloading…');
    location.reload();
  })
  .catch(() => {
    console.error('Could not fetch /test-data.json. Use Settings → Data Management → Import Data and select test-data.json instead.');
  });
