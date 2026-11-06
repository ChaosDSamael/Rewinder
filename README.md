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

- Le bouton **Scan** cherche sur TMDB : affiche, saisons, noms d'épisodes, dates de sortie, acteurs, titre québécois, où regarder au Canada.
- Chaque personne met sa propre clé gratuite dans **Settings** : [TMDB](https://www.themoviedb.org/settings/api) pour les films, séries et animes. La clé reste dans ton navigateur et ne va jamais dans les backups. Le formulaire de TMDB demande une adresse et un numéro de téléphone.
- Sur une fiche faite à la main, **Scan** la relie à TMDB. Ensuite, **Rescan** la met à jour (nouveaux épisodes, dates, plateformes). Tes notes, tes épisodes cochés et tes commentaires restent.
- Les jeux ([RAWG](https://rawg.io/apidocs)) arrivent à la prochaine mise à jour. Sans clé, tout marche à la main.

## Crédits

- This product uses the TMDB API but is not endorsed or certified by TMDB.
- Données de jeux : [RAWG](https://rawg.io). Où regarder : JustWatch, par TMDB.
- Polices : Chakra Petch, Inter et JetBrains Mono, sous licence SIL Open Font License (voir `fonts/`).

## Technique

Aucune étape de compilation : du HTML, du CSS et du JavaScript (modules ES) servis tels quels par GitHub Pages.
À chaque publication, change `VERSION` dans `sw.js` pour que les navigateurs prennent les nouveaux fichiers.
