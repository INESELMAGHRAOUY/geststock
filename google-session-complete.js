// Establish a first-party document before navigating with the Strict session cookie.
// An immediate redirect from the cross-site OAuth callback can omit that cookie.
function googleSessionCompleteHtml(){return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connexion Google — GestStock</title><link rel="stylesheet" href="/style.css"></head><body class="login-page"><main class="login-main"><div class="login-card"><h1>Connexion réussie</h1><p>Ouverture de votre espace…</p><a href="/" class="google-login-button">Continuer vers mon espace</a></div></main><script src="/google-complete.js"></script></body></html>';}
module.exports={googleSessionCompleteHtml};
