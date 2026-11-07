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
- iPhone et iPad : ouvre le lien dans Safari, puis **Partager → Sur l'écran d'accueil**. Ouvre toujours Rewinder par cette icône : Safari peut effacer les données d'un site après 7 jours sans visite, l'app de l'écran d'accueil les garde.
- Chaque appareil garde sa propre liste. Pour amener la tienne : **Download backup** sur l'ordi, envoie-toi le fichier, pis **Restore a backup** sur le téléphone.
- La barre du bas : **Home**, **All**, **Scan**, **List** et **Friends**. La recherche et les Settings sont en haut.

## Sur la TV

Rien à installer sur la TV, pas d'inscription : tu montres ton écran dessus, pis tu ouvres le **TV mode**.

- Android + Chromecast ou Google TV : app Google Home → ta TV → **Cast my screen**. Tourne le téléphone de côté.
- iPhone ou iPad + Apple TV ou TV AirPlay : Centre de contrôle → **Recopie de l'écran**.
- Ordi : dans Chrome, **⋮ → Cast, save and share → Cast…**, ou un câble HDMI.
- **TV mode** (en bas de page ou dans Settings) : plein écran, grosses affiches. Ton **Top**, l'accueil en grand (**Home**), pis **Tonight** qui pige un titre dans ta watchlist. Les flèches (ou la télécommande) se promènent, Enter ouvre, Back ou Escape revient.

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

## Parcourir

- **All** montre toutes tes affiches ensemble : films, séries, animes et jeux. Trie par **Best score** pour voir ton top, avec le rang (#1, #2…) sous chaque affiche. Pratique pour ajuster une note qui te semble trop haute ou trop basse.
- Sur une fiche, **Directed by** (films), **Created by** (séries, animes) ou **Studio** (jeux). Un clic sur le nom montre tout ce que tu as de cette personne dans la **Full List**. La recherche trouve aussi les réalisateurs. Pour les titres déjà dans ta liste, Rewinder va chercher les noms une fois, tout seul (il faut ta clé TMDB, ou RAWG pour les jeux).

## Les dates

- Une série mise **Completed** te demande si tu veux cocher les épisodes déjà sortis : à la date que tu choisis (aujourd'hui par défaut), avec la date inconnue, ou juste le statut.
- Les dates se changent après : un clic sur la date d'un visionnement (Watch count), d'une saison (sous la saison ouverte) ou d'un épisode. **Unknown** remet la date inconnue.

## Cartes d'amis

- L'icône du petit bonhomme, à gauche de la recherche. Écris ton nom, puis **Share my card** : un fichier `rewinder-card-ton-nom.json` à envoyer à tes amis (Discord, courriel…).
- Ta carte contient tes notes, tes statuts, tes favoris et tes tags. Jamais tes commentaires, tes dates ni tes clés.
- Pour ajouter la carte d'un ami : **Add a friend's card**, ou glisse le fichier n'importe où dans Rewinder. Une carte plus récente du même ami remplace l'ancienne.
- L'écran de l'ami : le % d'accord (la part de vos titres en commun où vous êtes à 1 point ou moins), **In common**, ce qu'il a vu et pas toi (**+ Watchlist** l'ajoute avec « Recommended by »), pis vos plus gros désaccords.
- Les cartes restent sur ton ordi. Elles ne se mettent pas à jour toutes seules : ton ami t'en renvoie une quand sa liste change.

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

## Technique

Aucune étape de compilation : du HTML, du CSS et du JavaScript (modules ES) servis tels quels par GitHub Pages.
À chaque publication, change `VERSION` dans `sw.js` pour que les navigateurs prennent les nouveaux fichiers.
