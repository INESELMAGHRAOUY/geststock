# GestStock

Application web de gestion commerciale, en français. Node.js >= 22.13, sans dépendances externes.

## Démarrage

```sh
npm start
```

Ouvrir le serveur sur le port 3000 dans un navigateur disposant d’un accès à la machine. Par défaut, écoute locale uniquement. `HOST` et `PORT` sont configurables.

Produits et stocks, réceptions fournisseur, clients, fournisseurs, devis, factures, impression A4, tickets 58/80 mm et modèle générique de chèque. Paramétrer l’entreprise et la devise avant impression. Les factures validées déduisent le stock de façon transactionnelle et sont conservées. La conversion d’un devis reprend les prix courants du catalogue.

La base locale est `data/stock.db` (ignorée par Git). Sauvegarder cette base régulièrement. `DB_PATH` permet une base séparée pour les tests. `npm test` exécute les tests fonctionnels du serveur.

## Limites de la première version

Usage local de confiance uniquement : aucune authentification ni gestion des utilisateurs. Ne pas exposer publiquement le serveur. Pas encore de paiements, avoirs, retours, comptabilité ou garantie de conformité fiscale. Ajuster le modèle de chèque au formulaire bancaire avant utilisation ; le montant en lettres est saisi manuellement. L’impression utilise la boîte de dialogue du navigateur et nécessite une imprimante compatible.
