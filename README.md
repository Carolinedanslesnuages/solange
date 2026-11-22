# Solange

Le poids du site, vérifié à chaque pull request.

Chaque kilo-octet ajouté est téléchargé par chaque visiteuse et chaque visiteur, à chaque
visite, souvent sur un téléphone et un réseau lent. Solange pèse le site construit, le compare
à vos budgets et à la branche principale, et dit ce qu'une PR ajoute.

```text
Poids du site (compressé, comme sur le réseau)
  JavaScript    248,0 Ko  avant 214,6 Ko     +33,4 Ko  budget 200,0 Ko ✗
  CSS            12,1 Ko  avant 12,1 Ko             =
  Images        310,0 Ko  avant 0 o         +310,0 Ko
  Total         570,1 Ko  avant 226,7 Ko   +343,4 Ko  budget 1,00 Mo ✓
  Première visite 98,4 Ko  avant 64,0 Ko   +34,4 Ko  budget 150,0 Ko ✓

À revoir
  ✗ JavaScript : 248,0 Ko, au-dessus du budget de 200,0 Ko.

Images lourdes ajoutées
  ⚠ public/photo-equipe.png : 310,0 Ko

Nouvelles dépendances
  · date-fns 4.1.0 : 22,6 Mo

Ressources chargées depuis d'autres sites (non pesées)
  ⚠ fonts.googleapis.com : 1 adresse(s), dans index.html
```

## Ce qui est mesuré

- **Le site construit**, par genre : JavaScript, CSS, HTML, images, polices. Les fichiers texte
  sont mesurés compressés (gzip), comme un serveur les envoie ; les images et les polices,
  déjà compressées, telles quelles. Les cartes de source (`.map`) ne comptent pas.
- **La première visite** : ce que la page d'entrée (`index.html`) télécharge en arrivant. Solange
  suit ses scripts, ses feuilles de style et ses préchargements, puis ce que ces feuilles de style
  appellent (`@import`, polices, images). Les morceaux qu'un framework charge plus tard (une autre
  page, un panneau ouvert) n'y sont pas : c'est ce qui compte pour la première impression, quand
  le total, lui, peut grossir sans que personne ne télécharge tout.
- **Les ressources chargées depuis d'autres sites** (polices, scripts ou styles d'un CDN) :
  Solange ne peut pas les peser, alors elle les signale, regroupées par site. Chacune ajoute une
  requête, des octets, et une visite que l'autre site voit.
- **L'écart avec la branche principale**, si l'action connaît la commande de construction.
- **Les images ajoutées** au dépôt au-delà de 200 Ko (réglable) : une version WebP ou AVIF, à la
  taille affichée, pèse souvent bien moins.
- **Le poids d'installation des nouvelles dépendances**, lu dans le registre npm.

Solange donne des poids, pas d'équivalent carbone : les facteurs de conversion du poids en
CO₂ varient beaucoup d'une méthode à l'autre. Le poids, lui, se mesure.

## À quoi ça ressemble

Le site [carolinedanslesnuages.github.io](https://carolinedanslesnuages.github.io), construit :

```text
Poids du site (compressé, comme sur le réseau)
  JavaScript          72,8 Ko  budget 90,0 Ko ✓
  CSS                  4,9 Ko  budget 8,0 Ko ✓
  HTML                  756 o  budget 2,0 Ko ✓
  Total               78,4 Ko  budget 100,0 Ko ✓
  Première visite     60,2 Ko  budget 75,0 Ko ✓

Ressources chargées depuis d'autres sites (non pesées)
  ⚠ fonts.googleapis.com : 1 adresse(s), dans index.html

Fichiers les plus lourds
     54,6 Ko  assets/index-CBxH7v7D.js
      4,9 Ko  assets/index-UFvOH4aH.css
      2,4 Ko  assets/marie-Dzhhc6e5.js
      2,0 Ko  assets/simone-CbhjESDj.js
      1,8 Ko  assets/irene-B-YxZDxi.js
```

Dans une pull request, le même tableau s'affiche dans le résumé du contrôle, avec l'écart avec la branche principale.

## Les budgets : `solange.json`

```json
{
  "dossier": "dist",
  "entree": "index.html",
  "budgets": { "js": 200, "css": 50, "images": 500, "polices": 100, "total": 1000, "premiere-visite": 150 },
  "imageMax": 200,
  "hausseMax": 10
}
```

| Réglage | Rôle |
|---|---|
| `dossier` | Le site construit (défaut : `dist`). |
| `entree` | La page d'entrée, pour la première visite (défaut : `index.html`). |
| `budgets` | Kilo-octets au plus, par genre : `js`, `css`, `html`, `images`, `polices`, `total`, et `premiere-visite`. Chacun est facultatif. |
| `imageMax` | Poids au-delà duquel une image ajoutée bloque la PR (Ko, défaut : 200). |
| `hausseMax` | Hausse au plus du poids total dans une PR, en pourcentage (avec la branche principale). |

Sans `solange.json`, Solange mesure et informe, sans rien bloquer, sauf une image trop lourde.

## Dans une pull request (GitHub Actions)

```yaml
jobs:
  poids:
    name: Poids du site (Solange)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0
      - run: npm ci && npm run build
      - uses: Carolinedanslesnuages/solange@v1
        with:
          construction: npm ci && npm run build
```

Avec `construction`, Solange construit aussi la branche principale dans un dossier à part et
donne l'écart. Le tableau arrive dans le résumé du contrôle ; un budget dépassé ou une image
trop lourde le fait échouer.

## Sur votre ordinateur

```sh
npm run build
npx github:Carolinedanslesnuages/solange                    # le dossier dist
npx github:Carolinedanslesnuages/solange --base main        # + images et dépendances ajoutées
```

| Option | Rôle |
|---|---|
| `--dossier <chemin>` | Site construit (défaut : celui de `solange.json`, sinon `dist`). |
| `--base-dossier <chemin>` | Le même site construit depuis la branche principale, pour l'écart. |
| `--base <ref>` | Branche ou commit de départ : images lourdes et nouvelles dépendances. |
| `--config <fichier>` | Budgets (défaut : `./solange.json`). |
| `--markdown`, `--json` | Autre format de sortie. |

Sans dépendance. Seul le registre public npm est interrogé, et seulement pour les nouvelles
dépendances.

## Pourquoi Solange

[Solange Fernex](https://fr.wikipedia.org/wiki/Solange_Fernex), pionnière de l'écologie
politique en France, militante antinucléaire et pacifiste, députée européenne. Elle a porté
l'idée qu'on peut vivre et produire en consommant moins.

## Développer Solange

```sh
npm test
```

Les tests pèsent des sites jetables : texte compressé, images, cartes de source ignorées,
budgets, écart avec la branche principale, images lourdes ajoutées, et un faux registre npm
pour les dépendances.

## Licence

[MIT](LICENSE).
