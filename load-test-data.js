// Paste this entire block into the browser DevTools console while the app is open.
// It will load Kiroshen Naidu's test data and reload the app.

fetch('/test-data-kiroshen.json')
  .then(r => r.json())
  .then(data => {
    localStorage.setItem('appState', JSON.stringify(data));
    console.log('Test data loaded. Reloading...');
    location.reload();
  })
  .catch(() => {
    // Fallback: if fetch doesn't work, paste the JSON inline here.
    console.error('Could not fetch JSON file. Use Settings > Import Data instead and select test-data-kiroshen.json');
  });
