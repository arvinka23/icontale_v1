# IconTale

A real-time multiplayer storytelling game built with Node.js, Express, and Socket.io. Players receive random emoji combinations, write creative stories inspired by them, then try to guess which emojis inspired each other's stories.

## Table of Contents

- [Overview](#overview)
- [Game Modes](#game-modes)
- [Configurable Settings](#configurable-settings)
- [How to Play](#how-to-play)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Known Limitations](#known-limitations)
- [License](#license)

## Overview

IconTale is a browser-based party game designed for 3–20 players. Each round follows three phases:

1. **Writing Phase** — Every player receives random emojis and writes a short story inspired by them.
2. **Guessing Phase** — Each player reads another player's story and guesses the emoji combination and/or the author.
3. **Results Phase** — Stories are revealed one by one in a chat-style discussion, followed by a leaderboard.

Games can run as single rounds or as multi-round matches (Best of 3 / Best of 5).

### Scoring

| Action | Points |
|---|---|
| Nobody guessed your emoji combination | +1 |
| Nobody guessed you as the author | +1 |
| Per player who guessed your emoji correctly | +2 |
| Per player who guessed you as the author | +2 |
| You correctly guessed someone's emoji | +0.5 |
| You correctly guessed the author | +0.5 |

Blind mode uses a separate scoring system focused only on author guessing.

## Game Modes

| Mode | Description |
|---|---|
| **Classic** | Write stories, guess both emoji combination and author. |
| **Speed** | 60-second timer, max 100 words — fast and intense. |
| **Blind** | No emoji options when guessing — only guess the author. |
| **Team** | Players are randomly split into two teams. Team scores are combined. |

## Configurable Settings

The lobby host can configure the following before starting:

| Setting | Options | Default |
|---|---|---|
| Game Mode | Classic, Speed, Blind, Team | Classic |
| Timer | 1 min, 2 min, 3 min, 5 min | 3 min |
| Word Limit | 100, 250, 500 | 500 |
| Emoji Count | 1–5 | 3 |
| Rounds | 1, Best of 3, Best of 5 | 1 |
| Emoji Packs | All, Faces, Animals, Food, Sports, Nature, Objects | All |

Non-host players see the current settings as read-only chips.

## How to Play

1. Open the app in your browser.
2. Enter a nickname and choose an emoji avatar.
3. **Create a lobby** to get a 6-character room code, or **join a lobby** by entering an existing code. You can also join as a **spectator**.
4. The host configures game settings and starts the game once at least 3 players have joined.
5. Write a story based on your assigned emojis within the timer.
6. Read another player's story and guess the emoji combination + author (or just the author in Blind mode).
7. Review results together and check the leaderboard.
8. In multi-round games, the host starts the next round until all rounds are complete, then the final scores are shown.

A built-in **tutorial** is shown on first visit and can be reopened via the **?** button at any time.

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Real-time Communication:** WebSockets via Socket.io
- **State Management:** In-memory (server-side)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v14 or higher
- npm (included with Node.js)

### Installation

```bash
git clone https://github.com/arvinka23/icontale.git
cd icontale
npm install
```

### Run in Development

```bash
npm run dev
```

Uses [nodemon](https://nodemon.io/) for automatic restarts on file changes.

### Run in Production

```bash
npm start
```

The server starts on `http://localhost:3000` by default. Set the `PORT` environment variable to use a different port:

```bash
PORT=8080 npm start
```

## Project Structure

```
icontale/
├── server.js              # Express + Socket.io server, game logic
├── package.json           # Dependencies and scripts
├── Procfile               # Heroku deployment config
├── railway.json           # Railway deployment config
├── render.yaml            # Render deployment config
├── .gitignore
└── public/
    ├── index.html         # Game UI (single-page application)
    ├── script.js          # Client-side game logic and Socket.io client
    ├── styles.css         # Styling, animations, responsive design
    ├── favicon.ico        # Browser tab icon
    ├── manifest.json      # PWA manifest
    ├── robots.txt         # Search engine crawling rules
    └── sitemap.xml        # XML sitemap
```

## Deployment

Deployment configurations are included for three platforms:

### Heroku

```bash
heroku create
git push heroku main
```

### Railway

Connect the GitHub repository on [Railway](https://railway.app/). The `railway.json` config handles the rest.

### Render

Connect the GitHub repository on [Render](https://render.com/). The `render.yaml` defines the web service.

## Known Limitations

- **No persistence:** All game state is stored in memory. Restarting the server clears all active lobbies. Abandoned lobbies are automatically cleaned up after 30 minutes.
- **No reconnection:** If a player disconnects, they cannot rejoin the same game session.
- **No input sanitization:** User-generated content (stories, usernames) is not sanitized against XSS.
- **No authentication:** There is no user account system or session management.
- **Single instance only:** The in-memory architecture does not support horizontal scaling.

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---

Built by [Arvin Ka](https://github.com/arvinka23)
