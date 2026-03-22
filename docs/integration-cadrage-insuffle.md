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

## 4. API proposee pour Cadrage Live

Pour que DarkBoard puisse interroger Cadrage Live, voici le contrat d'API propose.

### 4.1 Endpoints a implementer cote Cadrage Live

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/sessions` | Liste les sessions de cadrage |
| `GET` | `/api/session/:id` | Detail d'une session de cadrage |
| `POST` | `/api/session/:id/launch-board` | Demande la creation d'un DarkBoard lie |

### 4.2 Modele de donnees d'une session de cadrage

```json
{
  "id": "session-uuid",
  "title": "Retrospective Sprint 42",
  "facilitator": {
    "name": "Yoan",
    "email": "yoan@insuffle.com"
  },
  "createdAt": "2026-03-22T10:00:00Z",
  "status": "draft | ready | in_progress | completed",

  "cadrage": {
    "objectif": "Identifier les points d'amelioration du sprint",
    "participants": {
      "count": 12,
      "profils": ["developpeurs", "product owner", "scrum master"]
    },
    "duree": "90min",
    "format": "retrospective",

    "cap": {
      "description": "Ameliorer la velocity de 20% au prochain sprint",
      "indicateurs": ["velocity", "satisfaction equipe"]
    },
    "contraintes": [
      "Equipe distribuee (3 fuseaux horaires)",
      "Budget formation limite"
    ],
    "capacites": [
      "Equipe motivee",
      "Outils collaboratifs en place"
    ],
    "cadence": {
      "frequence": "bi-mensuel",
      "prochaine_session": "2026-04-05"
    }
  },

  "board": {
    "id": null,
    "url": null,
    "template": "retrospective",
    "status": "not_created"
  }
}
```

### 4.3 Lancement d'un board depuis Cadrage Live

```http
POST /api/session/session-uuid/launch-board
Content-Type: application/json

{
  "darkboard_url": "https://darkboard.insuffle.com",
  "template": "retrospective",
  "prefill": true
}
```

Ce endpoint doit :
1. Appeler `POST /api/boards` sur DarkBoard pour creer le board
2. Appeler `PUT /api/board/:id` pour pre-remplir le template
3. Stocker le lien du board dans la session
4. Retourner l'URL du board

**Reponse** :
```json
{
  "session_id": "session-uuid",
  "board_id": "cadrage-retro-42",
  "board_url": "https://darkboard.insuffle.com/board/cadrage-retro-42",
  "template_applied": "retrospective",
  "elements_created": 15
}
```

---

## 5. Scenarios d'integration

### 5.1 Scenario 1 — Lancer un DarkBoard depuis Cadrage Live

```
Facilitateur                Cadrage Live              DarkBoard
     |                           |                        |
     |-- Cree session cadrage -->|                        |
     |-- Remplit objectif, 4C -->|                        |
     |-- Clique "Lancer le      |                        |
     |   tableau" --------------->|                        |
     |                           |-- POST /api/boards --->|
     |                           |<-- 201 {id, url} ------|
     |                           |                        |
     |                           |-- PUT /api/board/:id ->|
     |                           |   (pre-remplir         |
     |                           |    template + infos    |
     |                           |    de cadrage)         |
     |                           |<-- 200 OK -------------|
     |                           |                        |
     |<-- Redirection board URL--|                        |
     |-- Rejoint le board -------|----------------------->|
```

### 5.2 Scenario 2 — Afficher le cadrage dans DarkBoard

Quand un board est lie a une session de cadrage, DarkBoard peut afficher
un panneau lateral avec les informations de cadrage.

```
Participant             DarkBoard                   Cadrage Live
     |                      |                            |
     |-- Ouvre le board ---->|                            |
     |                      |-- GET /api/session/:id --->|
     |                      |<-- {cadrage data} ---------|
     |                      |                            |
     |<-- Affiche panneau   |                            |
     |   "Cadrage" avec     |                            |
     |   objectif, 4C, etc  |                            |
```

### 5.3 Scenario 3 — Deep linking bidirectionnel

**Cadrage Live → DarkBoard** :
```
https://darkboard.insuffle.com/board/{boardId}?source=cadrage&session={sessionId}
```

**DarkBoard → Cadrage Live** :
```
https://cadrage.insuffle.com/session/{sessionId}?from=darkboard&board={boardId}
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
    "sessionId": "session-uuid",
    "sessionUrl": "https://cadrage.insuffle.com/session/session-uuid",
    "template": "retrospective",
    "createdFrom": "cadrage-api",
    "createdAt": "2026-03-22T10:30:00Z"
  },
  "elements": [...],
  "anchors": [...]
}
```

**Cote Cadrage Live** — stocker la reference au board :
```json
{
  "id": "session-uuid",
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

Afficher un panneau lateral quand le board est lie a une session de cadrage.

```javascript
// Si le board a une meta.sessionId, afficher le cadrage
if (board.meta && board.meta.sessionId) {
  fetch(board.meta.sessionUrl)
    .then(res => res.json())
    .then(session => showCadragePanel(session));
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
  constructor(baseUrl = 'https://darkboard.insuffle.com') {
    this.baseUrl = baseUrl;
  }

  // Creer un board lie a une session
  async createBoard(session) {
    const boardId = `cadrage-${session.id.slice(0, 8)}`;

    // 1. Creer le board
    const createRes = await fetch(`${this.baseUrl}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: boardId,
        meta: {
          source: 'cadrage.insuffle.com',
          sessionId: session.id,
          sessionUrl: `https://cadrage.insuffle.com/api/session/${session.id}`,
          template: session.cadrage.format
        }
      })
    });

    if (!createRes.ok && createRes.status !== 409) {
      throw new Error('Impossible de creer le board');
    }

    // 2. Pre-remplir avec le template et les donnees de cadrage
    const elements = this.buildCadrageElements(session);
    await fetch(`${this.baseUrl}/api/board/${boardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements })
    });

    return {
      boardId,
      boardUrl: `${this.baseUrl}/board/${boardId}`
    };
  }

  // Construire les elements visuels a partir du cadrage
  buildCadrageElements(session) {
    const ops = [];
    const c = session.cadrage;
    let y = -500;

    // Titre
    ops.push({
      type: 'add',
      elementId: `cadrage-title-${session.id}`,
      element: {
        id: `cadrage-title-${session.id}`,
        type: 'text',
        x: -400, y: y,
        text: c.objectif || session.title,
        fontSize: 32, stroke: '#ffffff',
        w: 800, h: 50, locked: true
      }
    });
    y += 80;

    // Post-its 4C
    const axes = [
      { key: 'cap',          color: '#4a9eff', label: 'CAP' },
      { key: 'contraintes',  color: '#e94560', label: 'CONTRAINTES' },
      { key: 'capacites',    color: '#4ecdc4', label: 'CAPACITES' },
      { key: 'cadence',      color: '#ffd966', label: 'CADENCE' }
    ];

    axes.forEach((axe, i) => {
      const data = c[axe.key];
      if (!data) return;
      const content = Array.isArray(data)
        ? data.map(d => `- ${d}`).join('\n')
        : typeof data === 'object'
          ? Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n')
          : String(data);

      ops.push({
        type: 'add',
        elementId: `cadrage-${axe.key}-${session.id}`,
        element: {
          id: `cadrage-${axe.key}-${session.id}`,
          type: 'sticky',
          x: -400 + (i * 210), y: y,
          w: 200, h: 200,
          text: `${axe.label}\n\n${content}`,
          fill: axe.color,
          fontSize: 12, locked: true
        }
      });
    });

    return ops;
  }

  // Recuperer l'etat d'un board
  async getBoardState(boardId) {
    const res = await fetch(`${this.baseUrl}/api/board/${boardId}`);
    if (!res.ok) return null;
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
1. Le facilitateur ouvre cadrage.insuffle.com
2. Il cree une nouvelle session de cadrage
3. Il remplit :
   - Objectif de l'atelier
   - Nombre et profils des participants
   - Duree prevue
   - Format (brainstorming, retro, etc.)
   - Axes 4C (Cap, Contraintes, Capacites, Cadence)
4. Il clique "Lancer le tableau DarkBoard"
5. → Cadrage Live cree le board via API
6. → Cadrage Live pre-remplit le template + infos de cadrage
7. → Le facilitateur est redirige vers DarkBoard
8. Il partage le lien DarkBoard aux participants
9. L'atelier se deroule sur DarkBoard
10. Les infos de cadrage restent visibles (post-its verrouilles)
11. Apres l'atelier, retour vers Cadrage Live pour le debrief
```

### 11.2 Parcours participant

```
1. Le participant recoit un lien DarkBoard
2. Il ouvre le lien, choisit un pseudo, rejoint le board
3. Il voit les infos de cadrage (objectif, contraintes) en haut du board
4. Il travaille sur le board collaborativement
5. (Optionnel) Un lien "Voir le cadrage complet" renvoie vers Cadrage Live
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
| P0 | Service `DarkBoardService` (creation + pre-remplissage) | Moyenne |
| P0 | Bouton "Lancer le tableau" dans l'interface | Faible |
| P1 | Stockage du lien board dans la session | Faible |
| P1 | Endpoint `/api/session/:id` pour DarkBoard | Moyenne |
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
