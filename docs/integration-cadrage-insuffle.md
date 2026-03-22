# Integration DarkBoard x Cadrage Live

> Documentation technique et fonctionnelle pour l'interfacage entre
> **DarkBoard** (`darkboard.insuffle.com`) et **Cadrage Live** (`cadrage.insuffle.com`)

---

## 1. Contexte

### 1.1 Les deux outils

| | DarkBoard | Cadrage Live |
|--|-----------|-------------|
| **URL** | `darkboard.insuffle.com` | `cadrage.insuffle.com` |
| **Role** | Tableau blanc collaboratif temps reel | Outil de cadrage collaboratif pour facilitateurs |
| **Usage** | Ateliers, brainstorming, retrospectives, workshops | Cadrage de sessions, diagnostic, design d'ateliers |
| **Technologie** | Express + WebSocket + Canvas HTML5 | SPA (Progressive Web App) |
| **Editeur** | Insuffle | Insuffle |
| **Tarif** | Gratuit | Gratuit |

### 1.2 Objectif de l'integration

Permettre un flux continu entre la phase de **cadrage** (definir les objectifs, contraintes, participants, format de l'atelier) et la phase de **realisation** (travailler sur le tableau blanc collaboratif).

**Vision** : un facilitateur cadre sa session dans Cadrage Live, puis lance directement un DarkBoard pre-configure avec le bon template, les bons participants, et les informations de cadrage visibles.

---

## 2. Architecture globale

```
+--------------------+          +--------------------+
|                    |   API    |                    |
|   Cadrage Live     |<-------->|     DarkBoard      |
|                    |  REST    |                    |
| cadrage.insuffle   |          | darkboard.insuffle |
|       .com         |          |       .com         |
+--------+-----------+          +--------+-----------+
         |                               |
         |  WebSocket (temps reel)       |  WebSocket (temps reel)
         |                               |
    +----+----+                     +----+----+
    |Navigateur|                    |Navigateur|
    |Faciliteur|                    |Particip. |
    +----------+                    +----------+
```

### 2.1 Modes d'integration

L'integration se fait a trois niveaux :

1. **Deep linking** — Liens directs entre les deux outils
2. **API REST** — Echange de donnees structure entre backends
3. **Iframe / Embed** — Embarquer un DarkBoard dans Cadrage Live (optionnel)

---

## 3. API DarkBoard (existante)

DarkBoard expose deja une API REST ouverte (CRUD sans DELETE).

### 3.1 Endpoints disponibles

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/boards` | Liste tous les boards |
| `POST` | `/api/boards` | Cree un nouveau board |
| `GET` | `/api/board/:id` | Recupere l'etat complet d'un board |
| `PUT` | `/api/board/:id` | Met a jour un board (add/update uniquement) |

> **Politique de non-suppression** : aucune operation DELETE n'est exposee.
> Les elements ne peuvent etre qu'ajoutes ou modifies via l'API.

### 3.2 Lister les boards

```http
GET /api/boards
```

**Reponse** :
```json
{
  "boards": [
    {
      "id": "a1b2c3d4",
      "elementCount": 42,
      "anchorCount": 3,
      "connectedUsers": 5,
      "lastActivity": 1711100000000
    }
  ]
}
```

### 3.3 Creer un board

```http
POST /api/boards
Content-Type: application/json

{
  "id": "cadrage-session-2024-01"  // optionnel — genere automatiquement si absent
}
```

**Reponse (201)** :
```json
{
  "id": "cadrage-session-2024-01",
  "url": "/board/cadrage-session-2024-01"
}
```

**Erreur (409)** — si le board existe deja :
```json
{
  "error": "Board already exists",
  "id": "cadrage-session-2024-01"
}
```

### 3.4 Lire un board

```http
GET /api/board/a1b2c3d4
```

**Reponse** :
```json
{
  "id": "a1b2c3d4",
  "elements": [
    {
      "id": "el-001",
      "type": "sticky",
      "x": 100,
      "y": 200,
      "w": 200,
      "h": 200,
      "text": "Idee importante",
      "fill": "#ffd966",
      "fontSize": 16,
      "locked": false,
      "createdBy": "user-abc"
    }
  ],
  "anchors": [
    {
      "id": "anc-001",
      "name": "Vue d'ensemble",
      "x": 0,
      "y": 0,
      "zoom": 0.5
    }
  ],
  "connectedUsers": 3,
  "lastActivity": 1711100000000
}
```

### 3.5 Mettre a jour un board

```http
PUT /api/board/a1b2c3d4
Content-Type: application/json

{
  "elements": [
    {
      "type": "add",
      "elementId": "el-new-001",
      "element": {
        "id": "el-new-001",
        "type": "text",
        "x": 50,
        "y": 50,
        "text": "Objectif : Ameliorer la collaboration",
        "fontSize": 28,
        "fill": "transparent",
        "stroke": "#ffffff",
        "w": 400,
        "h": 40
      }
    },
    {
      "type": "update",
      "elementId": "el-001",
      "props": {
        "text": "Texte modifie",
        "fill": "#ff6b6b"
      }
    }
  ]
}
```

**Reponse** :
```json
{
  "id": "a1b2c3d4",
  "applied": 2,
  "rejected": 0,
  "elements": [...]
}
```

> **Note** : les operations de type `"delete"` envoyees via l'API sont filtrees
> et comptabilisees dans `rejected`. Seuls `"add"` et `"update"` sont appliques.

---

## 4. API Cadrage Live (existante)

Cadrage Live expose une API REST CRUD sans DELETE, organisee autour
de 6 ressources : Spaces, Cards, Comments, Axes, Votes, Phases.

### 4.1 Endpoints disponibles

#### Spaces (sessions de cadrage)

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/spaces` | Liste avec filtres + pagination |
| `POST` | `/api/spaces` | Creer un espace de cadrage |
| `GET` | `/api/spaces/:id` | Details complets d'un espace |
| `PATCH` | `/api/spaces/:id` | Mettre a jour les metadonnees |

#### Cards (cartes de contenu)

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/spaces/:id/cards` | Liste avec filtres phase/colonne/auteur |
| `GET` | `/api/cards/:cardId` | Detail d'une carte |
| `POST` | `/api/spaces/:id/cards` | Creer une carte |
| `PUT` | `/api/cards/:cardId` | Modifier une carte |

#### Comments

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/cards/:cardId/comments` | Liste des commentaires |
| `POST` | `/api/cards/:cardId/comments` | Ajouter un commentaire |

#### Axes (positionnement 4C)

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/spaces/:id/axes` | Positions + finales |
| `PUT` | `/api/spaces/:id/axes/:axisKey` | Positionner un axe (participant) |
| `PUT` | `/api/spaces/:id/axes-final/:axisKey` | Position finale (facilitateur) |

> Les `axisKey` correspondent aux axes du cadrage : cap, contraintes, capacites, cadence, etc.

#### Votes

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/spaces/:id/votes` | Comptage par carte |
| `POST` | `/api/spaces/:id/votes` | Voter (max 3 par participant) |

#### Phases

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/spaces/:id/phase-states` | Etats lock/hidden par phase |
| `PUT` | `/api/spaces/:id/phase-states/:phase` | Verrouiller/masquer une phase |

### 4.2 Modele de donnees d'un Space

```json
{
  "id": "space-uuid",
  "title": "Retrospective Sprint 42",
  "facilitator": {
    "name": "Yoan",
    "email": "yoan@insuffle.com"
  },
  "createdAt": "2026-03-22T10:00:00Z",
  "status": "draft | ready | in_progress | completed",
  "participantCount": 12,
  "format": "retrospective"
}
```

### 4.3 Modele de donnees d'une Card

```json
{
  "cardId": "card-uuid",
  "spaceId": "space-uuid",
  "phase": "AVANT | PENDANT | APRES",
  "column": "colonne-1",
  "author": "participant-name",
  "content": "Ameliorer la communication inter-equipes",
  "votes": 5,
  "comments": [],
  "createdAt": "2026-03-22T10:15:00Z"
}
```

### 4.4 Modele de donnees des Axes

```json
{
  "spaceId": "space-uuid",
  "axes": {
    "cap": {
      "positions": [
        { "participant": "Alice", "value": 7 },
        { "participant": "Bob", "value": 5 }
      ],
      "final": 6
    },
    "contraintes": { "positions": [...], "final": 8 },
    "capacites": { "positions": [...], "final": 4 },
    "cadence": { "positions": [...], "final": 7 }
  }
}
```

### 4.5 Phases du cadrage

Le cadrage se deroule en 3 phases sequentielles :

| Phase | Role | Description |
|-------|------|-------------|
| **AVANT** | Preparation | Cadrer les objectifs, contraintes, contexte avant le temps collectif |
| **PENDANT** | Facilitation | Piloter la dynamique et le contenu pendant le temps collectif |
| **APRES** | Suivi | Capitaliser, suivre les actions, mesurer les resultats |

Chaque phase peut etre **verrouilee** (plus de modifications) ou **masquee**
(invisible pour les participants) via l'endpoint `phase-states`.

### 4.6 Lancement d'un board depuis Cadrage Live

Pour lier un Space a un DarkBoard, Cadrage Live doit :

1. Lire le space : `GET /api/spaces/:id`
2. Lire les cards : `GET /api/spaces/:id/cards`
3. Lire les axes : `GET /api/spaces/:id/axes`
4. Creer le board : `POST /api/boards` sur DarkBoard
5. Pre-remplir : `PUT /api/board/:boardId` sur DarkBoard
6. Stocker le lien : `PATCH /api/spaces/:id` avec la reference du board

```http
PATCH /api/spaces/space-uuid
Content-Type: application/json

{
  "board": {
    "id": "cadrage-retro-42",
    "url": "https://darkboard.insuffle.com/board/cadrage-retro-42",
    "status": "active",
    "linkedAt": "2026-03-22T10:30:00Z"
  }
}
```

---

## 5. Scenarios d'integration

### 5.1 Scenario 1 — Lancer un DarkBoard depuis Cadrage Live

```
Facilitateur                Cadrage Live              DarkBoard
     |                           |                        |
     |-- Cree un space -------->|                        |
     |-- Ajoute cards (AVANT) ->|                        |
     |-- Positionne axes 4C --->|                        |
     |-- Clique "Lancer le      |                        |
     |   tableau" --------------->|                        |
     |                           |-- GET /api/spaces/:id  |
     |                           |-- GET .../cards        |
     |                           |-- GET .../axes         |
     |                           |                        |
     |                           |-- POST /api/boards --->|
     |                           |<-- 201 {id, url} ------|
     |                           |                        |
     |                           |-- PUT /api/board/:id ->|
     |                           |   (pre-remplir avec    |
     |                           |    cards + axes)       |
     |                           |<-- 200 OK -------------|
     |                           |                        |
     |                           |-- PATCH /api/spaces/:id|
     |                           |   (stocker lien board) |
     |                           |                        |
     |<-- Redirection board URL--|                        |
     |-- Rejoint le board -------|----------------------->|
```

### 5.2 Scenario 2 — Afficher le cadrage dans DarkBoard

Quand un board est lie a un space Cadrage Live, DarkBoard peut afficher
un panneau lateral avec les informations de cadrage.

```
Participant             DarkBoard                   Cadrage Live
     |                      |                            |
     |-- Ouvre le board ---->|                            |
     |                      |-- GET /api/spaces/:id ---->|
     |                      |<-- {space data} -----------|
     |                      |-- GET .../cards ---------->|
     |                      |<-- {cards par phase} ------|
     |                      |-- GET .../axes ----------->|
     |                      |<-- {axes 4C + finales} ----|
     |                      |                            |
     |<-- Affiche panneau   |                            |
     |   "Cadrage" :        |                            |
     |   - Cards AVANT      |                            |
     |   - Axes 4C          |                            |
     |   - Phase en cours   |                            |
```

### 5.3 Scenario 3 — Deep linking bidirectionnel

**Cadrage Live → DarkBoard** :
```
https://darkboard.insuffle.com/board/{boardId}?source=cadrage&space={spaceId}
```

**DarkBoard → Cadrage Live** :
```
https://cadrage.insuffle.com/space/{spaceId}?from=darkboard&board={boardId}
```

### 5.4 Scenario 4 — Embed DarkBoard dans Cadrage Live

DarkBoard peut etre embarque dans une iframe au sein de Cadrage Live :

```html
<iframe
  src="https://darkboard.insuffle.com/board/{boardId}?embed=true&toolbar=minimal"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-write"
></iframe>
```

**Parametres d'embed proposes** :

| Parametre | Valeurs | Description |
|-----------|---------|-------------|
| `embed` | `true` | Masque header, footer, landing elements |
| `toolbar` | `full`, `minimal`, `hidden` | Controle la barre d'outils |
| `readonly` | `true` | Mode lecture seule |
| `theme` | `dark`, `light` | Force le theme |

---

## 6. Pre-remplissage de templates

Quand Cadrage Live cree un board, il peut le pre-remplir avec un template
adapte au format de l'atelier, enrichi des donnees de cadrage.

### 6.1 Mapping format → template DarkBoard

| Format atelier (Cadrage Live) | Template DarkBoard |
|-------------------------------|-------------------|
| `brainstorming` | Brainstorming |
| `retrospective` | Retrospective |
| `priorisation` | Matrice 2x2 |
| `kanban` | Kanban |
| `exploration` | Mind Map |
| `diagnostic` | SWOT |
| `planning` | Timeline |
| `parcours` | User Journey |

### 6.2 Elements de cadrage injectes

En plus du template, DarkBoard recoit les informations de cadrage sous forme
d'elements visuels places en haut du board :

```json
[
  {
    "type": "add",
    "elementId": "cadrage-header",
    "element": {
      "id": "cadrage-header",
      "type": "text",
      "x": -400,
      "y": -500,
      "text": "Retrospective Sprint 42",
      "fontSize": 36,
      "stroke": "#ffffff",
      "w": 800,
      "h": 50,
      "locked": true
    }
  },
  {
    "type": "add",
    "elementId": "cadrage-objectif",
    "element": {
      "id": "cadrage-objectif",
      "type": "sticky",
      "x": -400,
      "y": -420,
      "w": 380,
      "h": 200,
      "text": "OBJECTIF\n\nIdentifier les points d'amelioration du sprint",
      "fill": "#4a9eff",
      "fontSize": 14,
      "locked": true
    }
  },
  {
    "type": "add",
    "elementId": "cadrage-contraintes",
    "element": {
      "id": "cadrage-contraintes",
      "type": "sticky",
      "x": 20,
      "y": -420,
      "w": 380,
      "h": 200,
      "text": "CONTRAINTES\n\n- Equipe distribuee\n- Budget limite",
      "fill": "#e94560",
      "fontSize": 14,
      "locked": true
    }
  }
]
```

---

## 7. Modele de donnees partage

### 7.1 Lien session ↔ board

Pour lier une session Cadrage Live a un board DarkBoard, on utilise
un identifiant de session stocke dans les metadonnees du board.

**Cote DarkBoard** — ajouter un champ `meta` au board :
```json
{
  "id": "cadrage-retro-42",
  "meta": {
    "source": "cadrage.insuffle.com",
    "spaceId": "space-uuid",
    "spaceUrl": "https://cadrage.insuffle.com/api/spaces/space-uuid",
    "format": "retrospective",
    "createdFrom": "cadrage-api",
    "createdAt": "2026-03-22T10:30:00Z"
  },
  "elements": [...],
  "anchors": [...]
}
```

**Cote Cadrage Live** — stocker la reference au board via `PATCH /api/spaces/:id` :
```json
{
  "board": {
    "id": "cadrage-retro-42",
    "url": "https://darkboard.insuffle.com/board/cadrage-retro-42",
    "status": "active",
    "linkedAt": "2026-03-22T10:30:00Z"
  }
}
```

### 7.2 Types d'elements DarkBoard

Reference des types d'elements manipulables via l'API :

| Type | Description | Proprietes specifiques |
|------|-------------|----------------------|
| `rect` | Rectangle | `fill`, `stroke`, `strokeWidth`, `rotation` |
| `circle` | Cercle / Ellipse | `fill`, `stroke`, `strokeWidth` |
| `line` | Ligne | `points[]`, `stroke`, `strokeWidth` |
| `arrow` | Fleche | `points[]`, `stroke`, `strokeWidth` |
| `text` | Texte libre | `text`, `fontSize`, `fontFamily` |
| `sticky` | Post-it | `text`, `fill`, `fontSize` |
| `image` | Image | `src` (base64 ou URL) |
| `drawing` | Dessin libre | `points[]`, `stroke`, `strokeWidth` |
| `connector` | Connecteur | `fromId`, `toId`, `stroke` |

**Proprietes communes a tous les elements** :

```typescript
interface Element {
  id: string;          // Identifiant unique
  type: string;        // Type (voir tableau ci-dessus)
  x: number;           // Position X
  y: number;           // Position Y
  w: number;           // Largeur
  h: number;           // Hauteur
  rotation?: number;   // Rotation en degres
  locked?: boolean;    // Verrouille (non-editable)
  createdBy?: string;  // ID de l'utilisateur createur
}
```

---

## 8. Implementation cote DarkBoard

### 8.1 Ajouts necessaires

Pour supporter pleinement l'integration, DarkBoard doit implementer :

#### A. Metadonnees de board

Ajouter un champ `meta` a la structure du board pour stocker l'origine
et le lien vers Cadrage Live.

```javascript
// lib/boards.js — dans createBoard()
createBoard(boardId, meta = {}) {
  this.boards.set(boardId, {
    elements: new Map(),
    anchors: new Map(),
    connections: new Set(),
    lastActivity: Date.now(),
    meta: meta,  // <-- nouveau
    // ...
  });
}
```

#### B. Endpoint de creation enrichi

```javascript
// server.js — modifier POST /api/boards
app.post('/api/boards', (req, res) => {
  const boardId = req.body.id || uuidv4().split('-')[0];
  const meta = req.body.meta || {};

  if (boardStore.getBoard(boardId)) {
    return res.status(409).json({ error: 'Board already exists', id: boardId });
  }

  boardStore.createBoard(boardId, meta);
  res.status(201).json({ id: boardId, url: `/board/${boardId}`, meta });
});
```

#### C. Mode embed

Ajouter la detection du parametre `?embed=true` dans board.html pour
masquer les elements de navigation superflus.

```javascript
// public/js/app.js — dans le constructeur
const params = new URLSearchParams(window.location.search);
if (params.get('embed') === 'true') {
  document.body.classList.add('embed-mode');
}
```

```css
/* public/css/style.css */
body.embed-mode .template-btn,
body.embed-mode .theme-toggle,
body.embed-mode .help-btn {
  display: none;
}
```

#### D. Panneau de cadrage

Afficher un panneau lateral quand le board est lie a un space Cadrage Live.

```javascript
// Si le board a une meta.spaceId, charger les donnees du cadrage
if (board.meta && board.meta.spaceId) {
  const cadrageUrl = 'https://cadrage.insuffle.com';
  const spaceId = board.meta.spaceId;

  Promise.all([
    fetch(`${cadrageUrl}/api/spaces/${spaceId}`).then(r => r.json()),
    fetch(`${cadrageUrl}/api/spaces/${spaceId}/cards`).then(r => r.json()),
    fetch(`${cadrageUrl}/api/spaces/${spaceId}/axes`).then(r => r.json()),
    fetch(`${cadrageUrl}/api/spaces/${spaceId}/phase-states`).then(r => r.json())
  ]).then(([space, cards, axes, phases]) => {
    showCadragePanel({ space, cards, axes, phases });
  });
}
```

### 8.2 CORS

Pour permettre les appels cross-origin entre les deux sous-domaines :

```javascript
// server.js
const ALLOWED_ORIGINS = [
  'https://cadrage.insuffle.com',
  'https://darkboard.insuffle.com',
  'https://boussole.insuffle.com'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
```

---

## 9. Implementation cote Cadrage Live

### 9.1 Service d'integration DarkBoard

```javascript
class DarkBoardService {
  constructor(darkboardUrl = 'https://darkboard.insuffle.com',
              cadrageUrl  = 'https://cadrage.insuffle.com') {
    this.darkboardUrl = darkboardUrl;
    this.cadrageUrl   = cadrageUrl;
  }

  /**
   * Flux complet : lire un Space Cadrage Live → creer + pre-remplir un DarkBoard
   */
  async launchBoard(spaceId) {
    // 1. Lire les donnees du space
    const [space, cards, axes] = await Promise.all([
      this.fetch(`${this.cadrageUrl}/api/spaces/${spaceId}`),
      this.fetch(`${this.cadrageUrl}/api/spaces/${spaceId}/cards`),
      this.fetch(`${this.cadrageUrl}/api/spaces/${spaceId}/axes`)
    ]);

    const boardId = `cadrage-${spaceId.slice(0, 8)}`;

    // 2. Creer le board DarkBoard
    const createRes = await fetch(`${this.darkboardUrl}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: boardId,
        meta: {
          source: 'cadrage.insuffle.com',
          spaceId: spaceId,
          spaceUrl: `${this.cadrageUrl}/api/spaces/${spaceId}`,
          format: space.format
        }
      })
    });

    if (!createRes.ok && createRes.status !== 409) {
      throw new Error('Impossible de creer le board');
    }

    // 3. Pre-remplir avec les cards et axes du cadrage
    const elements = this.buildElements(space, cards, axes);
    await fetch(`${this.darkboardUrl}/api/board/${boardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements })
    });

    // 4. Stocker le lien du board dans le space Cadrage Live
    await fetch(`${this.cadrageUrl}/api/spaces/${spaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: {
          id: boardId,
          url: `${this.darkboardUrl}/board/${boardId}`,
          status: 'active',
          linkedAt: new Date().toISOString()
        }
      })
    });

    return {
      boardId,
      boardUrl: `${this.darkboardUrl}/board/${boardId}`
    };
  }

  /**
   * Construire les elements DarkBoard a partir des donnees Cadrage Live
   */
  buildElements(space, cards, axes) {
    const ops = [];
    let y = -500;

    // Titre du space
    ops.push({
      type: 'add',
      elementId: `cadrage-title`,
      element: {
        id: `cadrage-title`,
        type: 'text',
        x: -400, y,
        text: space.title,
        fontSize: 32, stroke: '#ffffff',
        w: 800, h: 50, locked: true
      }
    });
    y += 80;

    // Axes 4C — post-its avec positions finales du facilitateur
    const axeConfig = [
      { key: 'cap',          color: '#4a9eff', label: 'CAP' },
      { key: 'contraintes',  color: '#e94560', label: 'CONTRAINTES' },
      { key: 'capacites',    color: '#4ecdc4', label: 'CAPACITES' },
      { key: 'cadence',      color: '#ffd966', label: 'CADENCE' }
    ];

    axeConfig.forEach((axe, i) => {
      const data = axes.axes?.[axe.key];
      if (!data) return;

      const avgPos = data.positions?.length
        ? (data.positions.reduce((s, p) => s + p.value, 0) / data.positions.length).toFixed(1)
        : '?';
      const finalPos = data.final ?? '—';
      const text = `${axe.label}\n\nMoyenne: ${avgPos}/10\nFinale: ${finalPos}/10\n(${data.positions?.length || 0} participants)`;

      ops.push({
        type: 'add',
        elementId: `cadrage-axe-${axe.key}`,
        element: {
          id: `cadrage-axe-${axe.key}`,
          type: 'sticky',
          x: -400 + (i * 210), y,
          w: 200, h: 200,
          text,
          fill: axe.color,
          fontSize: 12, locked: true
        }
      });
    });
    y += 240;

    // Cards par phase — regroupees en colonnes
    const phases = ['AVANT', 'PENDANT', 'APRES'];
    const phaseColors = {
      'AVANT': '#4a9eff',
      'PENDANT': '#ffd966',
      'APRES': '#4ecdc4'
    };

    phases.forEach((phase, pi) => {
      const phaseCards = cards.filter(c => c.phase === phase);
      if (!phaseCards.length) return;

      // Header de phase
      ops.push({
        type: 'add',
        elementId: `cadrage-phase-${phase}`,
        element: {
          id: `cadrage-phase-${phase}`,
          type: 'text',
          x: -400 + (pi * 300), y,
          text: phase,
          fontSize: 20, stroke: phaseColors[phase],
          w: 280, h: 30, locked: true
        }
      });

      // Cards de cette phase
      phaseCards.forEach((card, ci) => {
        ops.push({
          type: 'add',
          elementId: `cadrage-card-${card.cardId}`,
          element: {
            id: `cadrage-card-${card.cardId}`,
            type: 'sticky',
            x: -400 + (pi * 300),
            y: y + 40 + (ci * 130),
            w: 280, h: 120,
            text: `${card.content}\n\n— ${card.author}${card.votes ? ` (${card.votes} votes)` : ''}`,
            fill: phaseColors[phase],
            fontSize: 12, locked: true
          }
        });
      });
    });

    return ops;
  }

  async fetch(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  }
}
```

---

## 10. Securite et bonnes pratiques

### 10.1 Authentification

L'API DarkBoard est actuellement ouverte (pas d'authentification).
Pour l'integration inter-services, il est recommande d'ajouter :

- **API Key** simple pour les appels serveur-a-serveur
- Header : `X-API-Key: <cle-partagee>`
- Validation cote DarkBoard avant toute operation d'ecriture

```javascript
// server.js — middleware optionnel pour les routes API d'ecriture
function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (req.method === 'GET') return next(); // lecture libre
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'API key required for write operations' });
  }
  next();
}

app.use('/api', apiKeyAuth);
```

### 10.2 Rate limiting

Proteger l'API contre les abus :

```javascript
// 100 requetes par minute par IP
const rateLimit = require('express-rate-limit');
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' }
}));
```

### 10.3 Validation des donnees

- Valider les `id` de board (alphanumerique, max 64 caracteres)
- Limiter la taille du body JSON (ex: 5 Mo max)
- Sanitiser le contenu `text` des elements (XSS)

---

## 11. Flux utilisateur complet

### 11.1 Parcours facilitateur

```
1.  Le facilitateur ouvre cadrage.insuffle.com
2.  Il cree un Space (POST /api/spaces)
3.  Phase AVANT — il prepare le cadrage :
    - Ajoute des Cards (objectifs, contexte, contraintes)
    - Les participants positionnent les Axes 4C
    - Le facilitateur valide les positions finales (axes-final)
    - Il peut verrouiller la phase AVANT quand c'est pret
4.  Il clique "Lancer le tableau DarkBoard"
5.  → Cadrage Live lit le space + cards + axes via son API
6.  → Cadrage Live cree le board DarkBoard (POST /api/boards)
7.  → Cadrage Live pre-remplit le board (PUT /api/board/:id)
       avec les cards AVANT + axes 4C en post-its verrouilles
8.  → Le lien est stocke dans le space (PATCH /api/spaces/:id)
9.  → Le facilitateur est redirige vers DarkBoard
10. Phase PENDANT — l'atelier se deroule sur DarkBoard
    - Les infos de cadrage restent visibles (verrouilles)
    - Le facilitateur anime avec les outils DarkBoard
      (timer, vote, isoloir, suivez-moi)
11. Phase APRES — retour vers Cadrage Live
    - Le facilitateur ajoute des Cards de suivi
    - Capitalisation des resultats
```

### 11.2 Parcours participant

```
1. Le participant recoit un lien DarkBoard
2. Il ouvre le lien, choisit un pseudo, rejoint le board
3. Il voit les infos de cadrage en haut du board :
   - Titre et objectif du space
   - Cards AVANT (contexte, preparation)
   - Axes 4C avec positions moyennes et finales
4. Il travaille sur le board collaborativement
5. (Optionnel) Un lien "Voir le cadrage" renvoie vers Cadrage Live
```

---

## 12. Webhooks (evolution future)

Pour une synchronisation en temps reel entre les deux outils,
DarkBoard pourrait emettre des webhooks :

| Evenement | Payload |
|-----------|---------|
| `board.created` | `{ boardId, meta }` |
| `board.user.joined` | `{ boardId, userId, userName }` |
| `board.user.left` | `{ boardId, userId }` |
| `board.elements.changed` | `{ boardId, added, updated, count }` |
| `board.export.completed` | `{ boardId, format, url }` |

**Configuration** :
```json
{
  "webhooks": [
    {
      "url": "https://cadrage.insuffle.com/api/webhooks/darkboard",
      "events": ["board.created", "board.user.joined", "board.elements.changed"],
      "secret": "webhook-shared-secret"
    }
  ]
}
```

---

## 13. Synthese des travaux

### A implementer cote DarkBoard

| Priorite | Tache | Complexite |
|----------|-------|-----------|
| P0 | CORS pour cadrage.insuffle.com | Faible |
| P0 | Champ `meta` sur les boards | Faible |
| P1 | Mode embed (`?embed=true`) | Moyenne |
| P1 | Endpoint GET /api/board/:id/meta | Faible |
| P2 | Panneau lateral "Cadrage" | Moyenne |
| P2 | API Key pour les ecritures | Faible |
| P3 | Webhooks | Elevee |

### A implementer cote Cadrage Live

| Priorite | Tache | Complexite |
|----------|-------|-----------|
| P0 | Service `DarkBoardService` (lecture space/cards/axes → creation board) | Moyenne |
| P0 | Bouton "Lancer le tableau" dans l'interface | Faible |
| P0 | Stockage du lien board via `PATCH /api/spaces/:id` | Faible |
| P1 | CORS pour autoriser DarkBoard a lire les spaces/cards/axes | Faible |
| P2 | Receiver de webhooks DarkBoard | Moyenne |
| P3 | Embed DarkBoard en iframe | Faible |

---

## 14. URLs de reference

| Ressource | URL |
|-----------|-----|
| DarkBoard | `https://darkboard.insuffle.com` |
| Cadrage Live | `https://cadrage.insuffle.com` |
| API DarkBoard | `https://darkboard.insuffle.com/api/boards` |
| Insuffle | `https://insuffle.com` |
| Boussole 4C | `https://boussole.insuffle.com` |
