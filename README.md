# Rewinder

Une petite app pour te rappeler tout ce que tu regardes et joues : films, séries, animes et jeux.
Des notes sur 10 (les étoiles se remplissent au dixième), des commentaires, les saisons et les épisodes, et l'historique de chaque changement.

**Ouvrir l'app :** https://chaosdsamael.github.io/Rewinder/

## L'installer

1. Ouvre le lien dans Chrome, Edge ou Brave.
2. Clique sur **Install** dans l'app (ou menu du navigateur → *Installer Rewinder*).
3. Rewinder s'ouvre ensuite dans sa propre fenêtre, à partir du menu Démarrer. Il marche aussi sans internet.

À la première ouverture, un **guide de démarrage** t'amène en 4 étapes : ta couleur, ta clé TMDB, ta clé RAWG, pis par où commencer. Chaque étape se saute. Pour le revoir : **Settings → App → Open the start guide**.

Les **Guides** (en bas de chaque page, ou dans Settings) expliquent tout ça pour l'ordi, le téléphone et la tablette, pis la TV.

## Sur téléphone et tablette

- Android : ouvre le lien dans Chrome, puis **⋮ → Install app** (ou *Add to Home screen*).
- iPhone et iPad : ouvre le lien dans Safari, puis **Partager → Sur l'écran d'accueil**. Fais-le en premier, puis ouvre toujours Rewinder par cette icône : elle garde sa propre liste, à part de Safari, et Safari peut effacer les données d'un site après 7 jours sans visite.
- Chaque appareil garde sa propre liste. Pour amener la tienne : **Download backup** sur l'ordi, envoie-toi le fichier, pis **Restore a backup** sur le téléphone.
- La barre du bas : **Home**, **All**, **Scan**, **List** et **Friends**. La recherche et les Settings sont en haut.

## Sur la TV

Rien à installer sur la TV, pas d'inscription : tu montres ton écran dessus, pis tu ouvres le **TV mode**.

- Android + Chromecast ou Google TV : app Google Home → ta TV → **Cast my screen**. Tourne le téléphone de côté.
- iPhone ou iPad + Apple TV ou TV AirPlay : Centre de contrôle → **Recopie de l'écran**.
- Ordi : dans Chrome, **⋮ → Cast, save and share → Cast…**, ou un câble HDMI.
- **TV mode** (en bas de page ou dans Settings) : plein écran, grosses affiches. Ton **Top**, l'accueil en grand (**Home**), pis **Tonight** qui pige un titre dans ta watchlist. Les flèches (ou la télécommande) se promènent, Enter ouvre, Back ou Escape revient.
- Pour un bouton TV en haut de chaque page : **Settings → TV → Show the TV button at the top**. Caché par défaut.

## Tes données

- Ta liste reste dans ton navigateur, sur ton ordi. Rien n'est envoyé ailleurs.
- De temps en temps : **Settings → Backup → Download backup**. Le fichier sert aussi à amener ta liste sur un autre ordi (**Restore a backup**).
- Si tu effaces les données du site dans ton navigateur, la liste part avec. D'où les backups.
- **Backup automatique** (Chrome et Edge) : **Settings → Backup → Choose a folder**. Une fois par jour, s'il y a eu des changements, Rewinder écrit une copie dans ce dossier (un dossier OneDrive ou Google Drive, c'est encore mieux). Les 10 copies les plus récentes restent. Après un redémarrage, le navigateur peut redemander ta permission : un clic sur **Allow**.
- Brave garde cette option fermée : cherche « File System Access » dans `brave://flags` pour l'ouvrir, puis redémarre Brave. Sinon, **Download backup** fait la job.

## Le Scan

- Le bouton **Scan** cherche les films, séries et animes sur TMDB, pis les jeux sur RAWG. Il remplit l'affiche, les saisons, les noms d'épisodes, les dates de sortie, les acteurs, le titre québécois, où regarder au Canada, pis où acheter les jeux.
- Les genres des animes viennent d'AniList (pas de clé à avoir).
- Chaque personne met ses propres clés gratuites dans **Settings** : [TMDB](https://www.themoviedb.org/settings/api) pour les films, séries et animes, [RAWG](https://rawg.io/apidocs) pour les jeux. Les clés restent dans ton navigateur et ne vont jamais dans les backups. Le formulaire de TMDB demande une adresse et un numéro de téléphone.
- Sur une fiche faite à la main, **Scan** la relie à TMDB ou RAWG. Ensuite, **Rescan** la met à jour. Tes notes, tes épisodes cochés et tes commentaires restent.
- Sans clé, tout marche à la main.
- **Nouvelles saisons** : à l'ouverture, une fois par jour, Rewinder regarde sur TMDB les séries et les animes que tu suis (In Progress, Completed ou On Hold). Une nouvelle saison apparaît dans **New Seasons** sur l'accueil. Quand tu coches un de ses épisodes, une série Completed repasse In Progress.

## Ajouter plusieurs titres

- Dans **Scan**, active **Add several**. Chaque titre que tu choisis est ajouté tout de suite, pis la recherche se vide pour le prochain. Le statut choisi reste pour les suivants.
- **Done · review** ouvre la page **Just added** : une ligne par titre, pour le noter, changer son statut ou l'enlever. Tout s'enregistre au fur et à mesure.
- Ajoutés de mémoire : **Completed** compte comme vu, date inconnue (les épisodes déjà sortis sont cochés). La date se change sur la page du titre.
- **Add it by hand** marche aussi : tu reviens dans Scan après.
- Les jeux (RAWG) pis le reste (TMDB) avancent dans deux files séparées : un RAWG lent ne bloque jamais tes films. Un serveur qui ne répond pas abandonne après 20 secondes (10 pour une recherche) : le titre passe en rouge avec **Try again**, pis la file continue.
- Tu fermes Rewinder avant la fin ? Les titres encore en route s'ajoutent tout seuls à la prochaine ouverture.

## Parcourir

- Le mur d'affiches prend toute la largeur. Trois boutons : **petites affiches**, **grosses affiches** ou **liste**, sur All comme sur les autres pages.
- Sous le titre, les filtres : **statut** (Watchlist, Dropped…), **genre** (Horror, Comedy…) pis **Favorites**. Ils se combinent avec le tri : « Movies · Horror · Completed · Best score ». **Clear** remet tout. Sur Home, les **See all** ouvrent le mur déjà filtré. Full List a aussi son filtre de statut.
- Le 4e bouton (les couches) montre tes **groupes**, côte à côte comme des coffrets sur une tablette ; un gros groupe prend la ligne au complet. Chaque groupe garde l'ordre de sortie, pis les groupes se classent par ton score moyen, par nombre de titres ou de A à Z.
  - **Franchises** : Alien, Scream, Jurassic Park… avec le rang (#1, #2…). Surtout des films (TMDB).
  - **Directors** : le réalisateur d'un film, les créateurs d'une série (Taylor Sheridan, Christopher Nolan…), à partir de deux titres. Deux noms crédités sur exactement les mêmes titres font un seul groupe (« With Joe Russo »).
  - **Studios** : Marvel Studios, A24… à partir de deux titres. Les compagnies créditées sur exactement les mêmes titres font un seul groupe (« Also credited: … »). Pour les jeux, les studios viennent de RAWG.
  - **Keywords** : tape un mot (« vamp » propose « vampire »), pis tout ce qui l'a se ramasse dans un groupe : les mots-clés de TMDB (RAWG pour les jeux), tes propres tags, les genres pis le nom du titre. Ajoutes-en jusqu'à 30 ; le × en enlève un. Entrée garde le mot tapé, sauf s'il ne trouve rien : là, il prend la première suggestion. Les mots-clés sont en anglais : « gladiator », pas « gladiateurs ». Sans rien taper, Rewinder propose les mots-clés les plus courants de ta liste.
- Les titres ajoutés avant la 1.8 (franchises, studios) ou la 1.9 (mots-clés) vont chercher ce qui leur manque tout seuls, en arrière-plan, la première fois : quelques minutes pour 500 titres.
- La recherche trouve aussi les studios pis les franchises.
- **All** montre toutes tes affiches ensemble : films, séries, animes et jeux. Trie par **Best score** pour voir ton top, avec le rang (#1, #2…) sous chaque affiche. Pratique pour ajuster une note qui te semble trop haute ou trop basse.
- Sur une fiche, **Directed by** (films), **Created by** (séries, animes) ou **Studio** (jeux). Un clic sur le nom montre tout ce que tu as de cette personne dans la **Full List**. La recherche trouve aussi les réalisateurs. Pour les titres déjà dans ta liste, Rewinder va chercher les noms une fois, tout seul (il faut ta clé TMDB, ou RAWG pour les jeux).

## Les dates

- Une série mise **Completed** te demande si tu veux cocher les épisodes déjà sortis : à la date que tu choisis (aujourd'hui par défaut), avec la date inconnue, ou juste le statut.
- Les dates se changent après : un clic sur la date d'un visionnement (Watch count), d'une saison (sous la saison ouverte) ou d'un épisode. **Unknown** remet la date inconnue.

## Cartes d'amis

- L'icône du petit bonhomme, à gauche de la recherche (sur cell : **Friends**, en bas). Écris ton nom, puis **Share my card**. Sur un cell, ça ouvre le menu de partage (Messenger, Discord, textos) avec un fichier `rewinder-card-ton-nom.txt`. Sur l'ordi, ça enregistre `rewinder-card-ton-nom.json` à envoyer (Discord, courriel…).
- Rewinder ne peut pas envoyer ta carte tout seul : c'est toi qui choisis l'ami pis qui envoies. Par contre, une fois ta carte partagée, un point apparaît sur **Friends** quand ta liste change, pis un rappel au plus une fois par jour avec un bouton **Share**. Ça se ferme dans **Settings → Friends**.
- Ta carte contient tes notes, tes statuts, tes favoris et tes tags. Jamais tes commentaires, tes dates ni tes clés.
- Pour ajouter la carte d'un ami (.json ou .txt) : **Add a friend's card**, ou glisse le fichier n'importe où dans Rewinder. Une carte plus récente du même ami remplace l'ancienne.
- L'écran de l'ami : le % d'accord (la part de vos titres en commun où vous êtes à 1 point ou moins), **In common**, ce qu'il a vu et pas toi (**+ Watchlist** l'ajoute avec « Recommended by »), pis vos plus gros désaccords.
- Les cartes en fichier restent sur ton ordi. Elles ne se mettent pas à jour toutes seules : ton ami t'en renvoie une quand sa liste change. Pour que ça se fasse tout seul, voir **Amis par nom** juste en dessous.

## Amis par nom

- **Settings → Friends** : choisis ton nom Rewinder (3 à 24 lettres ou chiffres, `. _ -` permis au milieu) avec le code d'invitation que Sonny t'a donné. Premier arrivé, premier servi.
- **Friends → Add a friend by name** : ton ami reçoit une demande (un point sur **Friends**). Quand il dit **Accept**, vous voyez vos cartes l'un l'autre, pis elles se mettent à jour toutes seules : ta carte part environ 20 secondes après ton dernier changement, pis celle de tes amis arrive quand tu ouvres Rewinder ou **Friends**.
- Sur le serveur : ton nom pis ta carte (titres, scores, statuts, favoris, tags). Jamais tes notes, tes dates ou tes clés. Seulement les amis que tu as acceptés voient ta carte. Une carte pas mise à jour depuis 5 mois est effacée (règle de TMDB : rien de gardé plus de 6 mois).
- Ton nom vit sur un appareil à la fois (chaque appareil a sa propre liste). **Move my name to another device** donne un code à coller sur l'autre appareil (**Move my name here**) : le code marche une seule fois, pendant 15 minutes, pis l'ancien appareil arrête de partager.
- **Remove** sur la page d'un ami : vous arrêtez de voir vos cartes. **Remove my name and card** efface tout sur le serveur.
- Les cartes en fichier marchent encore : **Send my card as a file** pis **Add a card file**.

### Le serveur (une fois, pour Sonny)

Un Cloudflare Worker gratuit (`server/worker.js`) avec une base de données D1. Gratuit jusqu'à 5 millions de lectures pis 100 000 écritures par jour, en masse pour une gang d'amis.

1. Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Workers & Pages → Create → Start with Hello World** : nomme-le `rewinder`, puis **Deploy**.
3. **Edit code** : remplace tout par le contenu de `server/worker.js`, puis **Deploy**.
4. **Storage & Databases → D1 SQL Database → Create Database** : nomme-la `rewinder`.
5. Ton worker → **Bindings → Add binding → D1 database** : nom de variable `DB`, base `rewinder`.
6. Ton worker → **Settings → Variables and Secrets → Add** : type **Secret**, nom `INVITE`, valeur = ton code d'invitation, **16 caractères ou plus**, au hasard (ex. `renard-orage-42-popcorn-lune`). En bas de 16, le serveur refuse de créer des noms. **Deploy**.
7. L'adresse `https://rewinder.<ton-sous-domaine>.workers.dev` va dans `DEFAULT_SERVER` (`js/server.js`) pis dans `connect-src` (`index.html`) : après ça, personne n'a d'adresse à taper, pis Rewinder ne peut parler à aucun autre serveur. Pour essayer avant : **Settings → Friends → Server address**.

Déjà fait avec KV (1.10.0) ? Remplace le code du worker (étape 3), fais les étapes 4 pis 5, change le code d'invitation pour 16 caractères ou plus. L'espace KV peut être effacé.

## Sécurité

Ce qui protège Rewinder pis tes amis :

- Tout ce qui vient de l'extérieur (TMDB, RAWG, AniList, une carte d'ami, une copie de sauvegarde, le serveur) est affiché comme du texte, jamais exécuté. Un test bourre chaque champ de pièges à chaque version.
- Une règle de sécurité (Content-Security-Policy) empêche tout script qui ne vient pas de Rewinder, pis les images d'ailleurs que TMDB ou RAWG. Rewinder refuse de s'ouvrir à l'intérieur d'une autre page.
- Tes clés TMDB pis RAWG vont seulement chez TMDB pis RAWG. Elles ne vont jamais dans une copie de sauvegarde ni dans une carte. Une copie de sauvegarde ne peut pas changer tes clés, ton serveur ou tes couleurs.
- Les liens vers les magasins (Steam, PlayStation, Xbox, Nintendo…) s'ouvrent seulement vers les vrais magasins. Un lien vers ailleurs est enlevé.
- Ton nom Rewinder : ton appareil a un secret que le serveur ne garde jamais (juste son empreinte). Ce secret part seulement vers le serveur où ton nom a été créé : changer l'adresse du serveur ne l'envoie nulle part ailleurs.
- Le code pour changer d'appareil ne contient jamais le secret, marche une fois, pis expire après 15 minutes. Rewinder montre le nom pis demande de confirmer avant de l'utiliser. Un code pour un autre serveur, ou un code qui ment sur le nom, est refusé.
- Le serveur : il faut le code d'invitation pour se créer un nom. Une adresse qui se trompe de code 10 fois attend une heure, pis une adresse crée 5 noms par jour au maximum. Chaque changement est fait d'un coup (une transaction) : deux personnes sont amies des deux bords, ou pas pantoute. Une carte s'ouvre seulement si les deux ont dit oui. Une carte au plus aux 10 secondes, 1 Mo au maximum, 200 amis. Un nom effacé reste bloqué 7 jours, pour que personne le prenne tout de suite pis reçoive les demandes de quelqu'un d'autre.
- Un ami « live » s'affiche sous son nom Rewinder, pas sous le nom libre de sa carte : personne ne peut se faire passer pour quelqu'un d'autre en écrivant « Sonny » sur sa carte. Sa carte ne peut pas non plus prendre la place de la carte d'un autre ami.

Ce que toi tu dois faire (Sonny) :

- Active la double authentification (2FA) sur **GitHub** pis sur **Cloudflare**. Quelqu'un qui prend ton GitHub peut changer le code que tous tes amis reçoivent à la prochaine mise à jour.
- Garde le code d'invitation long pis au hasard, entre amis. S'il fuit, change le secret `INVITE` dans Cloudflare : les noms déjà créés continuent de marcher.
- Ne publie pas d'autre site GitHub Pages sur le compte ChaosDSamael : tous les sites `chaosdsamael.github.io` partagent le même stockage dans le navigateur, donc un autre site pourrait lire les clés de Rewinder. Si un jour tu veux d'autres sites, déménage Rewinder sur son propre domaine.
- Si tu changes l'adresse du serveur, change aussi `connect-src` dans `index.html`.

Ce qui reste (connu, accepté) :

- Quelqu'un de méchant peut inonder le serveur gratuit de requêtes. Cloudflare coupe à 100 000 requêtes par jour, pis ça repart le lendemain. Rien n'est perdu, les amis par fichier marchent encore.
- Quelqu'un qui a le code d'invitation peut réserver des noms (5 par jour par adresse).
- Toi (ou quelqu'un qui prend ton compte Cloudflare) peux lire les cartes sur le serveur. Jamais les notes, les dates ou les clés : elles n'y sont pas.

## Importer une liste

**Settings → Import a list** (ou le bouton sur l'écran d'accueil). Tu choisis ce qu'il y a dans la liste (films, séries, animes, jeux), tu colles ton texte ou tu ouvres un fichier .txt, pis Rewinder te montre tout avant d'ajouter quoi que ce soit.

- Une ligne par titre. Notes comme `8.5` ou `8.5/10`, par saison comme `S1 7.9/10 — S2 7.7/10`, ou `S1-2-3-4 9.2/10`.
- Une ligne seule au-dessus d'un groupe (`Shonen:`) devient un tag sur chaque titre du groupe (optionnel).
- `(FM)` ou `(FromMemory)` donne le tag « from memory »; `To note` donne « to rate ».
- Un titre sans note va dans la Watchlist. Une saison nommée sans note (`— S3`) = pas encore vue : la série passe In Progress.
- Ce que tu as vu est coché avec la date « inconnue ». Un titre déjà dans ta liste garde tes affaires : seulement ses notes vides et ses tags sont ajoutés.

## Crédits

- This product uses the TMDB API but is not endorsed or certified by TMDB.
- Données de jeux : [RAWG](https://rawg.io). Genres d'anime : [AniList](https://anilist.co). Où regarder : JustWatch, par TMDB.
- Polices : Chakra Petch, Inter et JetBrains Mono, sous licence SIL Open Font License (voir `fonts/`).

© 2026 Sonny Lavallée · Myckealson. Tous droits réservés : l'app, son design pis son logo ne sont pas offerts sous licence libre.

## Technique

Aucune étape de compilation : du HTML, du CSS et du JavaScript (modules ES) servis tels quels par GitHub Pages.
À chaque publication, change `VERSION` dans `sw.js` pour que les navigateurs prennent les nouveaux fichiers.
