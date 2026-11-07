# Rewinder

Une petite app pour te rappeler tout ce que tu regardes et joues : films, séries, animes et jeux.
Des notes sur 10 (les étoiles se remplissent au dixième), des commentaires, les saisons et les épisodes, et l'historique de chaque changement.

**Ouvrir l'app :** https://chaosdsamael.github.io/Rewinder/

## L'installer

1. Ouvre le lien dans Chrome, Edge ou Brave.
2. Clique sur **Install** dans l'app (ou menu du navigateur → *Installer Rewinder*).
3. Rewinder s'ouvre ensuite dans sa propre fenêtre, à partir du menu Démarrer. Il marche aussi sans internet.

## Tes données

- Ta liste reste dans ton navigateur, sur ton ordi. Rien n'est envoyé ailleurs.
- De temps en temps : **Settings → Backup → Download backup**. Le fichier sert aussi à amener ta liste sur un autre ordi (**Restore a backup**).
- Si tu effaces les données du site dans ton navigateur, la liste part avec. D'où les backups.

## Le Scan

- Le bouton **Scan** cherche les films, séries et animes sur TMDB, pis les jeux sur RAWG. Il remplit l'affiche, les saisons, les noms d'épisodes, les dates de sortie, les acteurs, le titre québécois, où regarder au Canada, pis où acheter les jeux.
- Les genres des animes viennent d'AniList (pas de clé à avoir).
- Chaque personne met ses propres clés gratuites dans **Settings** : [TMDB](https://www.themoviedb.org/settings/api) pour les films, séries et animes, [RAWG](https://rawg.io/apidocs) pour les jeux. Les clés restent dans ton navigateur et ne vont jamais dans les backups. Le formulaire de TMDB demande une adresse et un numéro de téléphone.
- Sur une fiche faite à la main, **Scan** la relie à TMDB ou RAWG. Ensuite, **Rescan** la met à jour. Tes notes, tes épisodes cochés et tes commentaires restent.
- Sans clé, tout marche à la main.

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
