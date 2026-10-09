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

Deux rôles : administrateur (accès complet) et utilisateur (gestion commerciale sans gestion des comptes ni paramètres). Authentification par session, HTTPS requis sur un hébergement. La limitation des tentatives repose sur l’adresse du pair réseau ; derrière un proxy, cette limite peut être partagée. Pas encore de paiements, avoirs, retours, comptabilité ou garantie de conformité fiscale. Ajuster le modèle de chèque au formulaire bancaire avant utilisation ; le montant en lettres est calculé automatiquement. L’impression utilise la boîte de dialogue du navigateur et nécessite une imprimante compatible.

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

Le menu Charges permet de saisir les dépenses (libellé, catégorie, montant total, date, fournisseur facultatif, référence et notes), consulter l’historique filtré par dates, recherche et statut, puis enregistrer les paiements partiels ou complets. Les soldes sont calculés en centimes ; un paiement ne peut pas dépasser le reste dû. Les charges et paiements sont conservés dans l’historique. Les administrateurs peuvent corriger les paiements avec conservation des versions antérieures. Le nom de l’utilisateur ayant saisi l’opération est enregistré. Les paiements décrivent des opérations déjà effectuées ; ils ne déclenchent aucun transfert bancaire. Les charges ne modifient pas le stock ni les factures commerciales.

## Charges périodiques

Dans Charges → Charges périodiques : création, modification et Pause / Activer des échéances mensuelles. Quatre modèles sont initialisés une seule fois : WIFI 149, LKRA 1250, TISALAT LMAGHRIB 59 et LA CRECHE DYAL OMAR 500, dans la devise de l’entreprise (MAD par défaut). Leur première échéance correspond au premier jour du mois de l’installation de cette fonction ; aucun mois antérieur n’est ajouté. Les charges déjà saisies manuellement ne sont pas fusionnées automatiquement avec ces échéances.

Le serveur vérifie les échéances chaque minute, au démarrage et au chargement des données. Une occurrence unique par modèle et mois empêche les doublons. Si le serveur était arrêté, les mois actifs manquants sont rattrapés à son retour. Le calendrier utilise UTC. Les modifications de montant et de libellé ne concernent que les prochaines charges ; les dépenses et paiements déjà créés sont conservés. Les mois en pause sont ignorés et ne sont pas rattrapés à la reprise ; une reprise pendant un mois déjà ignoré prend effet au mois suivant. Pause n’annule pas une charge du mois déjà créée. Le règlement reste manuel dans Paiements des charges.

## Fournisseurs et justificatifs des charges

Les charges périodiques peuvent être associées à un fournisseur ; il est repris sur les prochaines échéances. Le paiement propose le fournisseur de la charge et permet de choisir un autre fournisseur. Le mode App banque sert à enregistrer un paiement effectué via une application bancaire, sans connexion bancaire automatique.

Un justificatif facultatif par paiement peut être ajouté : PDF, PNG ou JPEG, maximum 5 Mo. Le serveur vérifie le format et la taille, conserve le contenu dans SQLite et propose un téléchargement authentifié depuis l’historique. Les nouvelles sauvegardes de la base incluent ces fichiers. Ils sont servis en téléchargement et ne sont pas exposés dans un dossier public. Les historiques antérieurs et les anciennes charges déjà générées restent inchangés.

## Banques et chèques des paiements

Le menu Banques, réservé aux administrateurs, permet d’ajouter, modifier et activer/désactiver les banques et comptes (titulaire, RIB et agence facultatifs). CDM, ATTIJARIWAFA BANK et BMCE sont initialisées une seule fois ; les modifications sont conservées. Les banques actives sont proposées à tous les utilisateurs dans les paiements.

Pour le mode Chèque, banque, numéro du chèque et date d’échéance sont obligatoires. La date du paiement reste distincte de cette échéance. L’historique conserve une copie du nom de la banque et du compte lors de la saisie. Le chèque est En instance à la saisie. Son montant est réservé pour éviter un double paiement, mais seul un encaissement validé compte dans le montant payé. Un administrateur valide la date réelle d’encaissement, ajoute un justificatif signé après impression, ou modifie le paiement depuis l’historique. Un changement du montant, de la banque, du numéro ou de l’échéance remet le chèque en instance. Les versions antérieures, auteurs et dates sont conservés. L’échéance ne déclenche ni encaissement automatique ni vérification bancaire. Pas encore de rapprochement bancaire ni gestion des rejets.


L’historique offre Imprimer pour chaque chèque : bénéficiaire, montant en lettres automatique et ville fixée à Rabat, puis impression du modèle générique. Vérifier le placement sur papier pour chaque banque. La fenêtre Joindre signé accepte un justificatif après impression et signature, même si le chèque n’a pas encore été encaissé. Les chèques créés avant la mise à jour, sans statut explicite, apparaissent En instance et doivent être validés manuellement s’ils ont déjà été encaissés.

## Désactivation des charges et journal

Dans Historique des charges, un administrateur peut Désactiver ou Réactiver une charge avec un motif obligatoire. Aucune charge ni aucun paiement n’est supprimé de SQLite. Le filtre Actives / Non actives / Toutes permet de retrouver les éléments archivés. L’onglet Historique des suppressions présente chaque changement d’état, son motif, l’utilisateur, la date UTC et les informations de la charge avant le changement.

Une charge non active et ses paiements sont exclus des totaux actifs. Les paiements, chèques et justificatifs restent dans l’historique ; on peut toujours consulter et télécharger les pièces. Il faut réactiver la charge pour modifier ou valider ses paiements. Désactiver une échéance générée ne met pas en pause son modèle mensuel : utiliser Pause dans Charges périodiques pour arrêter les prochaines échéances. Le journal est conservé dans la base et ses nouvelles sauvegardes.

La conversion française des montants inclut les centimes et les règles de pluriel (cent, quatre-vingts, mille, millions). Elle est utilisée pour les chèques des paiements et dans le menu Chèques. La ville est toujours Rabat.


## Modèle de chèque CDM provenant du Word

Le formulaire Imprimer d’un paiement CDM sélectionne le modèle Word : page personnalisée 220 × 110 mm, paysage, police Sakkal Majalla 14 pt gras, marge haute 20 mm et marges latérales 25 mm. Le montant numérique est entouré de #, le montant en lettres est converti en arabe, la ville est الرباط et la date est au format jj/mm/aaaa. Seuls les textes sont imprimés, sans image du chèque ni coordonnées bancaires de l’exemple fourni. Les décalages horizontal et vertical en mm déplacent l’ensemble du texte pour corriger l’alignement de la machine. Les autres banques conservent le modèle générique, avec possibilité de sélectionner CDM dans le formulaire.

Dans la fenêtre d’impression, sélectionner le papier personnalisé 22 × 11 cm, échelle 100 %, marges nulles, sans en-têtes/pieds de page. Utiliser Sakkal Majalla installé sur le poste Windows ; à défaut, le navigateur utilise une police de remplacement et la disposition peut changer. Les paramètres du Word sont reproduits ; l’alignement physique doit être validé sur une feuille de même taille avant de charger un chèque. Le module Chèques utilise également le modèle CDM.
