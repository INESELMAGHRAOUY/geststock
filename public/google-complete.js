// The callback document is now on the application's origin. Remove the OAuth
// callback query before the next navigation; no authorization code is retained.
history.replaceState(null,'','/login?google-complete=1');
location.replace('/');
