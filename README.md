# GestStock

Application web de gestion commerciale, en français. Node.js >= 22.13, sans dépendances externes.

## Démarrage

```sh
npm start
```

Avant le démarrage, définir `ADMIN_USER` et `ADMIN_PASSWORD` (16 caractères minimum) dans les variables d’environnement. La page /login propose un formulaire de connexion. Toutes les données et pages de gestion nécessitent une session, conservée dans un cookie HttpOnly et SameSite=Strict (Secure sur hébergement). Les sessions expirent après 8 heures et sont invalidées lors d’un redémarrage ou via le bouton Déconnexion. Utiliser HTTPS en ligne.

Pour le développement local uniquement, `ALLOW_LOCAL_NO_AUTH=1` permet de démarrer sans identifiants si `HOST` est absent ou égal à `127.0.0.1`. Ne jamais définir ce contournement sur un hébergement.

Ouvrir le serveur sur le port 3000 dans un navigateur disposant d’un accès à la machine. Par défaut, écoute locale uniquement. `HOST` et `PORT` sont configurables.

Produits et stocks, réceptions fournisseur, clients, fournisseurs, devis, factures, impression A4, tickets 58/80 mm et modèle générique de chèque. Paramétrer l’entreprise et la devise avant impression. Les factures validées déduisent le stock de façon transactionnelle et sont conservées. La conversion d’un devis reprend les prix courants du catalogue.

La base locale est `data/stock.db` (ignorée par Git). Sauvegarder cette base régulièrement. `DB_PATH` permet une base séparée pour les tests. `npm test` exécute les tests fonctionnels du serveur.

## Limites de la première version

Un seul compte administrateur ; pas encore de rôles ni gestion multi-utilisateurs. Authentification par session, HTTPS requis sur un hébergement. La limitation des tentatives repose sur l’adresse du pair réseau ; derrière un proxy, cette limite peut être partagée. Pas encore de paiements, avoirs, retours, comptabilité ou garantie de conformité fiscale. Ajuster le modèle de chèque au formulaire bancaire avant utilisation ; le montant en lettres est saisi manuellement. L’impression utilise la boîte de dialogue du navigateur et nécessite une imprimante compatible.

## Hostinger et sauvegardes

- Node.js 24, entrée `server.js`, aucune compilation, npm, racine `./`.
- Définir `HOST=0.0.0.0`, `ADMIN_USER`, `ADMIN_PASSWORD`, et `DB_PATH` vers un fichier dans un dossier privé permanent hors des versions de déploiement. Hostinger fournit `PORT`.
- Ne jamais placer la base ou ses sauvegardes dans `public_html`, ni les ajouter à Git.
- Au démarrage puis chaque heure, le serveur crée une sauvegarde SQLite cohérente si aucune n’existe pour la date UTC courante. Conservation : les 30 derniers fichiers journaliers. Par défaut : dossier `backups` à côté de la base ; `BACKUP_DIR` peut modifier ce chemin.
- Ces copies sur le même serveur ne remplacent pas une sauvegarde externe. Télécharger régulièrement une copie journalière et vérifier la restauration sur une base de test.
- Vérifier que les données restent visibles après redémarrage et après un déploiement. Une migration depuis la base initiale nécessite de ne pas saisir de nouvelles données entre sauvegarde et bascule.
- Restauration : arrêter les écritures et le serveur via une procédure prise en charge par l’hébergeur, préserver la base actuelle, restaurer la copie sélectionnée au chemin `DB_PATH`, puis redémarrer et contrôler les données. Ne jamais remplacer une base utilisée par un processus actif.
