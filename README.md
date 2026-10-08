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

Deux rôles : administrateur (accès complet) et utilisateur (gestion commerciale sans gestion des comptes ni paramètres). Authentification par session, HTTPS requis sur un hébergement. La limitation des tentatives repose sur l’adresse du pair réseau ; derrière un proxy, cette limite peut être partagée. Pas encore de paiements, avoirs, retours, comptabilité ou garantie de conformité fiscale. Ajuster le modèle de chèque au formulaire bancaire avant utilisation ; le montant en lettres est saisi manuellement. L’impression utilise la boîte de dialogue du navigateur et nécessite une imprimante compatible.

## Hostinger et sauvegardes

- Node.js 24, entrée `server.js`, aucune compilation, npm, racine `./`.
- Définir `HOST=0.0.0.0`, `ADMIN_USER`, `ADMIN_PASSWORD`, et `DB_PATH` vers un fichier dans un dossier privé permanent hors des versions de déploiement. Hostinger fournit `PORT`.
- Ne jamais placer la base ou ses sauvegardes dans `public_html`, ni les ajouter à Git.
- Au démarrage puis chaque heure, le serveur crée une sauvegarde SQLite cohérente si aucune n’existe pour la date UTC courante. Conservation : les 30 derniers fichiers journaliers. Par défaut : dossier `backups` à côté de la base ; `BACKUP_DIR` peut modifier ce chemin.
- Ces copies sur le même serveur ne remplacent pas une sauvegarde externe. Télécharger régulièrement une copie journalière et vérifier la restauration sur une base de test.
- Vérifier que les données restent visibles après redémarrage et après un déploiement. Une migration depuis la base initiale nécessite de ne pas saisir de nouvelles données entre sauvegarde et bascule.
- Restauration : arrêter les écritures et le serveur via une procédure prise en charge par l’hébergeur, préserver la base actuelle, restaurer la copie sélectionnée au chemin `DB_PATH`, puis redémarrer et contrôler les données. Ne jamais remplacer une base utilisée par un processus actif.

## Gestion des utilisateurs

Au premier démarrage sur une base sans comptes, `ADMIN_USER` et `ADMIN_PASSWORD` initialisent le premier administrateur. Sur une base contenant déjà des comptes, ces variables ne réinitialisent aucun mot de passe. Le menu Utilisateurs, accessible aux administrateurs, permet de créer des comptes, modifier le nom et le rôle, réinitialiser le mot de passe et désactiver un compte. Une modification révoque les sessions du compte concerné ; un utilisateur désactivé ne peut plus se connecter. Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé. Les mots de passe sont stockés sous forme de hash scrypt avec un sel propre à chaque mot de passe, et ne sont jamais renvoyés à l’interface.

Les comptes sont conservés dans la même base permanente que les données commerciales et inclus dans les nouvelles sauvegardes. Une sauvegarde antérieure à la création des utilisateurs ne contient pas ces comptes. Il n’y a pas encore de récupération automatique par email ; conserver au moins un accès administrateur et les sauvegardes.

## Charges et paiements

Le menu Charges permet de saisir les dépenses (libellé, catégorie, montant total, date, fournisseur facultatif, référence et notes), consulter l’historique filtré par dates, recherche et statut, puis enregistrer les paiements partiels ou complets. Les soldes sont calculés en centimes ; un paiement ne peut pas dépasser le reste dû. Les charges et paiements sont conservés dans l’historique, sans suppression ni modification dans cette première version. Le nom de l’utilisateur ayant saisi l’opération est enregistré. Les paiements décrivent des opérations déjà effectuées ; ils ne déclenchent aucun transfert bancaire. Les charges ne modifient pas le stock ni les factures commerciales.
