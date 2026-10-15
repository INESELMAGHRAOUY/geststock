# GestStock

Application web de gestion commerciale, en français. Node.js >= 22.13. Dépendances installées par npm.

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

Trois profils : administrateur (accès complet), utilisateur (gestion commerciale sans gestion des comptes ni paramètres) et délégué Jumia (accès limité à ses boutiques). Authentification par session, HTTPS requis sur un hébergement. La limitation des tentatives repose sur l’adresse du pair réseau ; derrière un proxy, cette limite peut être partagée. Pas encore de paiements, avoirs, retours, comptabilité ou garantie de conformité fiscale. Ajuster le modèle de chèque au formulaire bancaire avant utilisation ; le montant en lettres est calculé automatiquement. L’impression utilise la boîte de dialogue du navigateur et nécessite une imprimante compatible.

## Hostinger et sauvegardes

- Node.js 24, entrée `server.js`, aucune compilation, npm, racine `./`.
- Définir `HOST=0.0.0.0`, `ADMIN_USER`, `ADMIN_PASSWORD`, et `DB_PATH` vers un fichier dans un dossier privé permanent hors des versions de déploiement. Hostinger fournit `PORT`.
- Ne jamais placer la base ou ses sauvegardes dans `public_html`, ni les ajouter à Git.
- Au démarrage puis chaque heure, le serveur crée une sauvegarde SQLite cohérente si aucune n’existe pour la date UTC courante. Conservation : les 30 derniers fichiers journaliers. Par défaut : dossier `backups` à côté de la base ; `BACKUP_DIR` peut modifier ce chemin.
- Ces copies sur le même serveur ne remplacent pas une sauvegarde externe. Télécharger régulièrement une copie journalière et vérifier la restauration sur une base de test.
- Vérifier que les données restent visibles après redémarrage et après un déploiement. Une migration depuis la base initiale nécessite de ne pas saisir de nouvelles données entre sauvegarde et bascule.
- Restauration : arrêter les écritures et le serveur via une procédure prise en charge par l’hébergeur, préserver la base actuelle, restaurer la copie sélectionnée au chemin `DB_PATH`, puis redémarrer et contrôler les données. Ne jamais remplacer une base utilisée par un processus actif.

## Gestion des utilisateurs

Le profil **Délégué Jumia** utilise les mêmes interfaces Jumia pour ses boutiques : commandes et statuts, suivi et bénéfices, clients, import CSV des commandes, catalogue Excel, relevés financiers, virements, hubs, catégories, brands et analyse gasoil. Les commandes en attente sont importables ; un même numéro dans une boutique non affectée ne bloque pas son import. Les retours livrés sont confirmés par le délégué avec état utilisable / endommagé et indemnisation réelle. Seuls les retours utilisables restaurent son stock personnel. Les frais aller/retour, ticket et emballage suivent les calculs habituels. Les SKU absents créent des listings uniquement. Les catégories, hubs et brands partagés sont consultables ; il peut créer et modifier ses propres entrées sans modifier celles des autres comptes. Ses pleins, paiements gasoil, comptes bancaires et confirmations de virements sont stockés séparément de la trésorerie principale, y compris les débits pour remboursements. Le serveur vérifie la boutique, le propriétaire et la version de chaque élément. Les autres modules commerciaux restent bloqués. Le catalogue principal expose uniquement Disponible / Rupture et les informations de vente ; les coûts d’achat et quantités du fournisseur principal ne sont jamais transmis. Les coûts visibles dans ses commandes sont ses propres achats reçus.

**Produits en rupture** affiche d’abord les listings actifs du délégué sans stock personnel, notamment lorsque le fournisseur principal est également indisponible. Le tableau expose les SKU vendeur/Jumia, la disponibilité du fournisseur (sans quantité) et le stock personnel. Un produit encore disponible dans le stock personnel reste vendable même si le fournisseur est en rupture. Les autres articles du catalogue principal en rupture sont affichés séparément. La disponibilité est actualisée avec le compteur de notifications toutes les 60 secondes sans vider les formulaires. Le délégué doit mettre le SKU à zéro ou le suspendre dans Jumia : cette application ne modifie pas automatiquement Vendor/Seller Center.

**Nouveaux produits** notifie chaque délégué des nouveaux articles actifs ajoutés au catalogue principal après son point de départ. Le compteur et le bandeau sont actualisés toutes les 60 secondes, sans réinitialiser les formulaires. Le délégué peut choisir sa boutique et créer un listing avec ses SKU vendeur/Jumia ; rien n’est ajouté automatiquement et aucun stock ne change. Marquer les notifications comme vues ne concerne que son compte et persiste après reconnexion. La migration établit une base sur le catalogue existant pour éviter de présenter tout l’historique comme nouveau. Aucune quantité de stock principal ni prix d’achat n’est exposé dans les notifications.

Les délégués disposent de **Mes achats** et de fournisseurs personnels. Le fournisseur principal est disponible automatiquement. Une demande au fournisseur principal reste en attente, sans effet sur le stock principal ou personnel. L’administrateur confirme la livraison dans **Clients → Commandes des délégués**, en vérifiant quantité et prix de vente au délégué : le stock principal diminue une seule fois, et le stock personnel augmente. Les achats externes reçus alimentent uniquement le stock personnel. **Mes produits** permet de créer et modifier des produits personnels (désignation, référence, code-barres, prix de vente, commission et image PNG/JPEG/WebP de 2 Mo maximum), sans ajouter d’article au catalogue principal. Ces produits sont accessibles uniquement à leur délégué et à l’administrateur. Les achats externes peuvent les alimenter avant la création d’un listing. Plusieurs listings/SKU vendeur peuvent être liés au même produit personnel, dans une ou plusieurs boutiques. Les listings héritent de son image, protégée par les droits du compte ; ses ventes consomment le stock personnel correspondant, partagé entre les listings de ce produit. Le délégué voit les quantités de son propre stock, jamais celles du fournisseur principal.

Les nouvelles commandes Jumia des boutiques déléguées, et les commandes existantes non encore expédiées, consomment le stock personnel à l’expédition ; elles ne diminuent pas une seconde fois le stock principal. Les livraisons échouées et retours récupérés restaurent ce stock personnel. Les prix d’achat de ces commandes proviennent des achats personnels reçus. Les commandes déjà expédiées avant ce fonctionnement conservent leur historique et leur source de stock. Les imports historiques peuvent laisser le stock personnel négatif en attendant la saisie des achats, comme les imports habituels ; l’expédition manuelle exige un stock personnel suffisant. Confirmer la livraison ne crée aucun paiement bancaire ni facture.

Pour Marwane : dans **Utilisateurs**, cliquer **Préparer le compte Marwane**, définir un mot de passe d’au moins 16 caractères, puis enregistrer. Laisser les boutiques vides pour qu’il crée les siennes. Partager le lien de connexion affiché sur sa ligne et ses identifiants. Les créations de boutiques sont liées atomiquement au compte ; les modifications utilisent un jeton de version pour éviter d’écraser une mise à jour concurrente. Les changements de permissions déconnectent immédiatement les sessions du compte. Les comptes existants conservent leurs droits après la migration SQLite additive.

Au premier démarrage sur une base sans comptes, `ADMIN_USER` et `ADMIN_PASSWORD` initialisent le premier administrateur. Sur une base contenant déjà des comptes, ces variables ne réinitialisent aucun mot de passe. Le menu Utilisateurs, accessible aux administrateurs, permet de créer des comptes, modifier le nom et le rôle, réinitialiser le mot de passe et désactiver un compte. Une modification révoque les sessions du compte concerné ; un utilisateur désactivé ne peut plus se connecter. Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé. Les mots de passe sont stockés sous forme de hash scrypt avec un sel propre à chaque mot de passe, et ne sont jamais renvoyés à l’interface.

Les comptes sont conservés dans la même base permanente que les données commerciales et inclus dans les nouvelles sauvegardes. Une sauvegarde antérieure à la création des utilisateurs ne contient pas ces comptes. La récupération par email est disponible après configuration SMTP ; conserver au moins un accès administrateur et les sauvegardes.

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

Le menu du délégué regroupe Jumia, Stock (stock personnel et inventaires), Fournisseurs (achats et règlements) et Trésorerie (banques et espèces). Les inventaires ajustent uniquement le stock personnel. Les règlements sont enregistrés sur les achats reçus et débitent uniquement les mouvements personnels ; ils ne confirment pas un encaissement dans la trésorerie du fournisseur principal. La page Espèces affiche les mouvements saisis, sans inventer de solde initial.

Demandes de dépôt Jumia : le délégué sélectionne des commandes de sa boutique et transmet leurs étiquettes PDF. L’administrateur accepte, prépare les colis puis enregistre le dépôt au hub avec date, hub, référence et preuve facultative. Chaque étape reste historisée ; les documents sont accessibles uniquement au délégué propriétaire et à l’administrateur. Cette prestation ne crée pas d’achat, ne change pas le stock et ne marque pas les commandes comme livrées aux clients. Les commandes doivent être saisies / importées avant de demander leur dépôt.

Tarifs du dépôt : Administration → Utilisateurs → Tarifs livraison / emballage. L’administrateur définit les lots de commandes, leur prix de livraison et le prix d’emballage par commande, pour le délégué globalement ou boutique par boutique. Un lot commencé est facturé intégralement. Aucun prix n’est appliqué avant paramétrage. Les nouvelles demandes conservent leur tarif ; dans Dépôts des délégués, sélectionner les dépôts achevés d’un même délégué permet de calculer puis valider un relevé de frais avec les lots regroupés selon le mode retenu. Les relevés validés sont immuables face aux changements de tarifs et ne créent pas d’encaissement.

Calcul provisoire Jumia (administrateur et délégués) : lecture locale d’un export commandes et de relevés transactions CSV. Les résultats séparent PAID annoncé, non PAID, montant bancaire saisi, remboursements et ventes non retrouvées dans les relevés. Le net hors relevés est estimé uniquement si commission et shipping sont saisis ; un relevé incomplet ne prouve pas une dette totale. Les fichiers et calculs ne sont ni envoyés au serveur ni enregistrés dans un stockage du navigateur, et sont effacés en quittant la page.

## Inscription et récupération du mot de passe

La page de connexion propose **Créer un compte** et **Mot de passe oublié**. Téléphone et numéro WhatsApp sont obligatoires lors de l’inscription (8 à 15 chiffres, préfixe international + accepté ; le même numéro peut servir aux deux). Ils sont conservés dans le compte et visibles/modifiables dans Utilisateurs. Les anciens comptes ne sont pas bloqués par cette nouvelle exigence. Une inscription crée exclusivement un **Délégué Jumia**, inactif et sans boutiques affectées. Dans **Administration → Utilisateurs**, l’administrateur choisit **Accepter** ou **Refuser**. Modifier un compte en attente ne permet pas de l’activer sans cette décision. Les comptes existants restent approuvés lors de la migration. Le champ Email peut être renseigné pour les comptes existants depuis Utilisateurs ; une adresse ne peut être partagée entre plusieurs comptes.

Pour envoyer les liens, définir dans Hostinger les variables suivantes, puis redémarrer le serveur :

| Variable | Valeur |
| --- | --- |
| `APP_PUBLIC_URL` | URL HTTPS publique du site, sans chemin, ex. `https://gestion.votre-domaine.ma` |
| `SMTP_HOST` | Serveur SMTP fourni par votre messagerie Hostinger |
| `SMTP_PORT` | `465` (TLS direct) ou `587` (STARTTLS obligatoire) |
| `SMTP_USER` | Adresse / identifiant SMTP de la boîte expéditrice |
| `SMTP_PASS` | Mot de passe SMTP, uniquement dans les secrets d’hébergement |
| `SMTP_FROM` | Adresse email expéditrice autorisée par cette boîte |

Ne pas mettre ces secrets dans GitHub. Sans configuration complète, la connexion et les inscriptions fonctionnent, mais Mot de passe oublié indique que le service email est indisponible. Le statut de configuration est visible dans Utilisateurs. Les liens ne sont envoyés qu’aux comptes actifs et approuvés, à leur email enregistré. La réponse ne confirme pas l’existence d’une adresse.

Le lien expire après 30 minutes, contient un jeton aléatoire dans le fragment de l’URL et ne peut être utilisé qu’une fois. Seul le hash du jeton est conservé dans SQLite ; ni le lien ni le jeton ne sont renvoyés par l’API. Changer le mot de passe ou l’email rend les anciens liens invalides. Une réinitialisation révoque toutes les sessions du compte et ne modifie jamais son approbation ni ses droits. Les endpoints publics limitent les tentatives par adresse réseau ; derrière un proxy partagé, cette limite peut concerner plusieurs personnes. Les tests simulent l’envoi SMTP sans envoyer d’email réel.

## Confirmation email et connexion Google

Les nouvelles inscriptions par mot de passe doivent confirmer leur email (lien à usage unique, valable 24 heures) **et** être acceptées par l’administrateur avant de se connecter. L’administrateur peut accepter la demande avant la confirmation, mais cette acceptation ne permet pas de contourner la vérification. Le bouton **Renvoyer le lien de vérification** permet de redemander un email. Les anciens comptes conservent leur accès lors de la migration ; ils ne sont pas bloqués rétroactivement. La liste Utilisateurs affiche la confirmation de l’email.

Pour activer **Continuer avec Google**, créer un client OAuth de type **Application Web** dans Google Cloud et définir dans Hostinger `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Conserver `APP_PUBLIC_URL=https://inom.inombeauty.com`. URI de redirection autorisée à déclarer dans Google :

```text
https://inom.inombeauty.com/api/google/callback
```

Si le site change de domaine, l’URI doit correspondre exactement à `APP_PUBLIC_URL` suivi de `/api/google/callback`. Ne jamais mettre le secret OAuth dans GitHub. Configurer le consentement OAuth et les utilisateurs test autorisés si le projet Google est en mode test. Sans les deux variables, le bouton Google reste masqué et l’inscription par email fonctionne.

Google utilise OAuth avec état lié au navigateur, PKCE et nonce ; l’ID token est vérifié par google-auth-library (signature, audience et expiration) et son email doit être confirmé par Google. Les nouveaux utilisateurs complètent un nom d’utilisateur, un téléphone et WhatsApp ; ils deviennent uniquement des délégués en attente d’acceptation. Le nom et l’email sont repris du profil vérifié, sans accepter de remplacement depuis le formulaire. Les comptes existants peuvent utiliser Google avec leur email enregistré, sans créer de doublon ni changer leurs permissions. Un compte désactivé ou refusé reste bloqué. Pour un compte existant dont l’email n’était pas confirmé, l’ancien mot de passe est invalidé lors de la liaison Google pour éviter de conserver un accès créé par un tiers ; Mot de passe oublié permet de définir ensuite son propre mot de passe. Les jetons d’accès Google ne sont pas conservés.

Après une connexion Google approuvée, la réponse OAuth affiche une courte page du site avant d’ouvrir l’espace utilisateur. Cette navigation depuis le domaine du site permet au cookie de session SameSite=Strict d’accompagner la requête suivante ; aucun assouplissement du cookie de session n’est nécessaire. Les paramètres OAuth sont retirés de l’URL avant cette navigation.

## Historique des connexions

Administration → Connexions affiche les connexions réussies par mot de passe ou Google, avec utilisateur, date UTC, méthode, IP réseau et navigateur/système déclaré. L’historique commence à l’installation de cette mise à jour ; les connexions antérieures ne peuvent pas être reconstituées. Les filtres par dates, utilisateur/IP et méthode ainsi que la pagination permettent de consulter toutes les lignes. Seuls les administrateurs ont accès à cette API. Les données sont conservées dans SQLite et incluses dans les sauvegardes, sans mot de passe, cookie, jeton OAuth ou lien de réinitialisation. Derrière un proxy Hostinger, l’IP réseau peut être celle de l’hébergeur ; les IP issues de X-Forwarded-For sont affichées séparément comme non vérifiées et ne servent pas à autoriser l’accès. L’estimation ville/pays décrite ci-dessous est locale et n’est pas une adresse précise.

L’historique inclut les ouvertures de /login et de l’interface / ; API, assets et redirections ne sont pas comptés. Les visiteurs non connectés restent anonymes. Un cookie HttpOnly indicatif distingue les navigateurs pendant 30 jours ; changer de navigateur ou supprimer les cookies change cet identifiant. Ville/pays sont estimés avec la base locale geoip-lite, sans envoyer d’IP à un service externe. L’IP réseau est privilégiée ; une IP transmise peut servir si nécessaire, avec une indication explicite de source non vérifiée. Un VPN, proxy, réseau mobile ou une base GeoIP ancienne peut fausser l’estimation. Aucune adresse précise ni GPS n’est collecté. Les visites et localisations commencent à cette mise à jour.

## Historique des ventes clients

Clients → Historique des ventes est réservé à l’administrateur. Il présente les factures clients de l’entreprise, avec client, articles, montant TTC, règlements validés et solde à recevoir, filtres par client/recherche/dates/état, pagination, détail des lignes et impression A4/ticket. Devis, commandes Jumia, achats personnels et commandes des délégués ne sont pas inclus. Il utilise les factures existantes, y compris celles saisies par les employés autorisés de l’entreprise ; il ne constitue pas un filtre par auteur. Les factures inactives sont consultables mais exclues des totaux. Les chèques en instance ne sont pas comptés comme encaissés. Aucun stock, document ni paiement n’est créé ou modifié par cette consultation.

Disponibilité fournisseur BeautyMarket : ajoutez un lien HTTPS `/products/...` dans la fiche article (paramètre `variant` conservé). Le tableau Articles affiche la disponibilité publique et l’heure du dernier contrôle, avec vérification manuelle. Le serveur vérifie au démarrage puis chaque heure les liens jamais vérifiés ou dont le contrôle date de 24 heures ; les produits inactifs sont ignorés. Le processus doit rester actif pour la vérification quotidienne. Les résultats sont stockés séparément dans `supplier_stock` et ne modifient jamais les quantités GestStock. Sans variante dans le lien, une disponibilité positive signifie qu’au moins une variante est disponible. Les erreurs, liens supprimés et réponses non reconnues restent « Vérification impossible », jamais « Rupture ». Seul le domaine BeautyMarket est autorisé, sans redirections réseau.

Deux fournisseurs par article : le champ `supplierUrl` conserve le lien BeautyMarket existant ; `parabudgetUrl` ajoute le lien HTTPS ParaBudget `/product/...`. Les deux sites sont autorisés uniquement sur leur propre domaine, sans redirections. Le tableau affiche une ligne par article et fournisseur. Les résultats ParaBudget sont isolés dans `supplier_stock_parabudget` : l’historique BeautyMarket reste conservé dans `supplier_stock`. La disponibilité ParaBudget est lue dans le Product JSON-LD correspondant à l’URL demandée, pas dans les suggestions de produits voisins ; les données absentes ou ambiguës restent inconnues. Le contrôle quotidien traite séparément les deux liens.
