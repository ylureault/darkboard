# Contribuer à DarkBoard

Merci d'être ici. Ce projet avance grâce aux gens qui l'utilisent en atelier et qui remarquent ce qui coince.

**Vous n'avez besoin de l'accord de personne pour commencer.** Prenez une issue, ouvrez-en une, ou proposez directement une pull request.

## Démarrer en trois minutes

```bash
git clone https://github.com/ylureault/darkboard.git
cd darkboard
npm install
npm start          # → http://localhost:3000
```

Aucune base de données, aucune variable d'environnement, aucune étape de build. Les tableaux sont écrits en JSON dans `data/`.

Pour tester la collaboration, ouvrez le même lien dans deux fenêtres — une normale, une privée. Vous verrez les deux curseurs et les deux sélections.

## Lancer les tests

```bash
npm test          # 112 tests client + 67 tests serveur
npm run test:e2e  # 51 vérifications dans un vrai navigateur
```

Les tests de bout en bout pilotent Chromium et **échouent sur la moindre erreur console**. Ils demandent :

```bash
npm install --no-save playwright-core
# et un Chromium :
CHROMIUM_PATH=/chemin/vers/chromium npm run test:e2e
```

Sans eux, la commande se saute proprement — elle ne bloquera pas votre travail.

## Par où commencer

| Envie | Regardez |
|---|---|
| Corriger un bug | Les issues `bug`, ou reproduisez et décrivez-en un nouveau |
| Première contribution | Le label [`good first issue`](https://github.com/ylureault/darkboard/labels/good%20first%20issue) |
| Un nouvel outil de dessin | `public/js/tools.js` et `public/js/objects.js` |
| Un format d'import/export | `public/js/ui.js` |
| Une mécanique d'animation | `public/js/workshop.js` |
| Traduire l'interface | Les chaînes sont en français dans les fichiers `public/` |

## Comment le code est organisé

Pas de framework, pas de build : on ouvre un fichier et on le lit.

```
server.js            Express + WebSocket
lib/ws-handler.js    routage et validation des messages temps réel
lib/boards.js        état des tableaux et persistance disque
public/js/app.js     orchestration, historique, presse-papiers
public/js/canvas.js  rendu, caméra, vue d'ensemble
public/js/objects.js dessin et collision par type d'élément
public/js/tools.js   comportement de chaque outil
public/js/sync.js    client WebSocket, file hors-ligne
```

Deux principes structurent le reste :

**Tout changement d'état passe par une opération** — `add`, `update` ou `delete`. Elle est appliquée localement, poussée dans l'historique avec son inverse, puis diffusée. Temps réel et annulation partagent le même chemin : si vous ajoutez une fonctionnalité qui modifie le tableau, émettez des opérations et elle sera annulable et synchronisée sans effort supplémentaire.

**Une action utilisateur = une entrée d'historique.** Si votre action en déclenche plusieurs (déplacer un cadre bouge aussi ses enfants et ses connecteurs), encadrez-les :

```js
app.history.beginBatch();
// ... plusieurs push()
app.history.endBatch();
```

## Conventions

Le style suit le code existant plutôt qu'un linter :

- **2 espaces**, point-virgules, `const`/`let`.
- **Les commentaires expliquent pourquoi, pas quoi.** Un commentaire qui paraphrase la ligne suivante est du bruit ; un commentaire qui explique pourquoi le cas limite existe vaut de l'or.
- **L'interface est en français**, le code et les commentaires aussi.
- **Validez toute entrée réseau côté serveur.** Chaque type de message a une entrée dans `MESSAGE_VALIDATORS` (`lib/ws-handler.js`). Pas de validateur, pas de message.
- **Échappez tout texte utilisateur** inséré en HTML — `_escapeHtml()` ou `_sanitizeRichText()`.

## Ouvrir une pull request

1. Une branche par sujet.
2. `npm test` et, si possible, `npm run test:e2e` passent.
3. Ajoutez un test quand vous corrigez un bug — c'est ce qui l'empêche de revenir.
4. Décrivez **ce qui ne marchait pas** et **comment vous l'avez vérifié**. Une capture ou un court enregistrement aide énormément pour un changement visuel.

Les petites PR sont relues vite. Une PR de 2 000 lignes peut attendre longtemps : si votre changement est gros, ouvrez d'abord une issue pour en discuter.

## Signaler un bug

Ce qui rend un rapport utile :

- Ce que vous attendiez, ce qui s'est passé.
- Les étapes pour le reproduire — même approximatives.
- Navigateur et système.
- **Les erreurs de la console** (F12 → Console), si elles existent.
- Le cas échéant : est-ce arrivé à plusieurs personnes en même temps sur le même tableau ?

## Sécurité

Si vous trouvez une faille, **n'ouvrez pas d'issue publique.** Écrivez à l'équipe via [insuffle.com](https://insuffle.com) et laissez un délai raisonnable avant publication.

## Code de conduite

En participant, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md). En résumé : soyez correct, supposez la bonne foi, critiquez le code et pas les personnes.
