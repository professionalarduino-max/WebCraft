# ⛏ WebCraft — Minecraft in your browser

**▶ Play online:** https://professionalarduino-max.github.io/WebCraft/ &nbsp;·&nbsp; **Multiplayer server:** _paste your server link here_ (see [Deploy the multiplayer server](#deploy-the-multiplayer-server))

A 3D Minecraft clone that runs entirely in the browser. No build step, no dependencies to install — just static HTML/JS (Three.js loaded from a CDN), so it works out of the box on GitHub Pages.

## Features

- **Infinite procedural terrain** — seeded Perlin-noise world with rolling plains, forests (oak & birch), spruce-dotted cold biomes, deserts with cacti, beaches, oceans, and snow-capped mountains; flowers, pumpkins, and melons dot the grass
- **Caves & ores** — winding tunnel systems with coal, iron, gold, redstone, lapis, emerald, and diamond ore, plus gravel pockets and clay under lakes
- **Building blocks galore** — bricks (smelt clay), sandstone, smooth stone, mossy cobblestone, bookshelves, quartz, nether bricks, glowstone, hay bales, 16 wool colors, and mineral storage blocks (iron/gold/diamond/redstone/lapis/emerald)
- **Slabs, stairs & more** — real half-slabs (6 kinds) you step onto smoothly, stairs (4 kinds) that auto-face as you place them, connecting oak fences and glass panes, and **torches** that glow in the dark
- **Ladders & doors** — ladders (7 sticks) mount on walls and climb at authentic Minecraft speed (sneak to hang on, no fall damage); oak doors (6 planks) fill two blocks, face you when placed, and open/close with a right-click
- **TNT** — craft it (coal + sand), light it with flint and steel, and run; blasts chain nearby TNT (bedrock and obsidian shrug it off)
- **Survival mining** — blocks take time to break (with crack animation); stone and ores require a pickaxe of the right tier to drop anything
- **Minecraft-style inventory** — 36 slots (27 + 9 hotbar) with 64-stack limits, a mouse cursor stack, drag-to-distribute, right-click splitting, shift-click quick-move, double-click collect, tooltips, and Q to drop; craft in the 2×2 grid or build a **crafting table** for the 3×3 grid and advanced recipes
- **Tools** — pickaxes, axes, and shovels mine their blocks much faster; swords hit harder
- **Mobs & drops** — pigs, sheep, and cows wander the world and drop food and wool; zombies spawn at night, chase you, and burn at dawn
- **Hunger** — a Minecraft-style hunger/saturation system: sprinting, jumping, and fighting make you hungry; keep the bar high to regenerate health, let it empty and you'll starve
- **Food & cooking** — mobs drop raw meat; cook it in a furnace for much better food (plus apples and questionable rotten flesh)
- **Furnaces & smelting** — craft a furnace (8 cobblestone), fuel it with coal/charcoal/wood, and smelt raw iron & gold → ingots, sand → glass, cobblestone → stone → smooth stone, clay → bricks, netherrack → nether bricks, logs → charcoal; furnaces keep burning while you play
- **Buckets** — scoop and pour water and lava (lava lakes lurk in the deepest caves — it burns, but it's also a 100-smelt fuel)
- **Armor** — craft iron and diamond armor sets; equip them in dedicated slots to reduce combat and burn damage
- **Obsidian & nether portals** — pour water on lava to make obsidian (diamond pickaxe to mine), build a portal frame, light it with flint and steel (iron + coal), and step through
- **The Nether** — a cavernous netherrack dimension with a lava ocean, quartz ore, glowstone clusters on the ceiling, and **blazes** that hover and hurl fireballs; distance scales 1:8, and blaze rods make great furnace fuel
- **Ender pearls & endermen** — tall, night-spawning endermen drop pearls and teleport away when struck; throw pearls (right-click) to teleport yourself
- **Villages** — plank cabins with doors and torch-lit interiors generate on the plains, holding **loot chests** (tools, food, materials, the occasional ender pearl); chests are also craftable (8 planks) for storage
- **Beds** — craft one from 3 wool + 3 planks; right-click to set your spawn point, and sleep through the night
- **The stronghold & the End** — a hidden underground chamber holds the dormant End portal; throw **Eyes of Ender** (right-click) and follow their flight to find it, then socket 12 eyes into the frame ring (blaze rod → blaze powder; powder + pearl → eye); drop through to a floating end-stone island where the **Ender Dragon** circles the obsidian pillars and swoops at you; slay it to open the exit portal and claim the dragon egg
- **Critical hits** — attack while falling for 1.5× damage with a spark burst, just like Minecraft (jump, then swing on the way down)
- **Day/night cycle** — moving sun and moon, stars, sunsets, and fog that matches the sky
- **Survival elements** — health, fall damage, zombie attacks with knockback, death & respawn
- **Creative mode** — switch modes from the pause menu: fly (F or double-tap Space), invulnerability, no hunger, instant block breaking (even bedrock), infinite placement, and an all-blocks-and-items palette in the inventory; hostile mobs ignore you. Survival has no flying.
- **Minecraft Java physics** — fixed 20-tick simulation with authentic per-tick gravity/friction formulas, 1.25-block floaty jumps, sprinting (double-tap W), sneaking with edge protection, slippery ice, view bobbing, and Minecraft's mouse sensitivity curve (adjustable on the pause screen)
- **World persistence** — your edits, inventory, position, and time of day auto-save to `localStorage`
- **Juice** — block-break particles, procedural sound effects, ambient-occlusion shading, held-item viewmodel, damage vignette

- **Multiplayer** — run `node server/mp-server.js` (zero dependencies), press ⛁ Multiplayer, join with friends: shared blocks and thrown items, live player avatars (walk/sneak/sprint/swim/fly poses, held item, nameplates tinted per player), world chat with `/tell` and `/me`, a **Tab player list** (health, dimension, ping bars, operator stars), operator `/kick` and `/op`, synced time & weather, death and dimension-change announcements, and a world that persists in `server/db.json`
- **Multiplayer that recovers** — automatic reconnection with backoff if the server or Wi‑Fi blinks (you keep playing and get re-synced), a live connection status + ping readout (`/ping`, F3, Tab), and an **edit outbox**: blocks you place while offline are remembered and pushed the moment the connection is back, so builds are never lost
- **World stays in sync** — edits made anywhere on the map (even far outside your render distance) are stored and replayed when you get there, so a friend's far-away base is never "missing"; the whole world is also re-sent when you rejoin
- **Multiplayer details** — nicknames in any language (Cyrillic too), the MP screen shows a live server card (name, players online, seed, edit count) via `/status`, the server prints `/status` JSON and serves the game itself on one port, and `--db file.json` lets one machine host several worlds
- **Chat & cheat commands (NEW)** — T to chat, / for 20+ commands: /gamemode, /give, /tp, /spawn, /time, /weather, /kill, /heal, /clear, /fly, /summon, /setblock, /locate, /rd, /seed, /me, /list, /tell, /op, /kick (Tab-completion, ↑↓ history)
- **Tool & armor durability (NEW)** — Minecraft values (gold is fast but fragile), damage bars, items break
- **Drowning, clouds & rain (NEW)** — air bubbles, drifting blocky clouds, /weather rain with sound and dark skies
- **More settings (NEW)** — volume and render-distance sliders
- **Camera modes (V / F5)** — first person, third-person back and front views with an animated player character
- **Inventory player preview** — a 3D Steve in the inventory that mirrors your equipped armor (drag to rotate)
- **More blocks & gear** — coal blocks, jack o'lanterns, mossy stone bricks, spruce/sandstone stairs, spruce/birch slabs, blue orchids, alliums, cobwebs (they slow you down!), enchanting tables, jukeboxes (they play music!), note blocks (click to change pitch), plus golden tools and armor
- **Minecraft-style sound** — material-based digging/breaking/placing, footsteps, UI clicks, splash, jukebox tunes, calm generative music (♫/🔊 toggles in the menu), and a dirt-background menu with splash text
- **Creative palette tabs** — filter all blocks & items by Blocks / Deco / Gear / Food / Items, middle-click to pick any block

**Getting started:** punch a tree (hold left-click on the trunk) for logs → press **E** → craft planks (2×2 grid) → craft a crafting table → place it and right-click it → craft sticks and a wooden pickaxe (3×3 grid) → mine stone → stone tools → iron → diamond. The recipe list below the grid auto-fills patterns for you.

## Controls

| Input | Action |
| --- | --- |
| **W A S D** | Move |
| **Mouse** | Look |
| **Space** | Jump / swim up |
| **Shift** | Sneak — slower, lower camera, won't fall off edges (descend while flying) |
| **Ctrl / double-tap W** | Sprint (on Windows, use fullscreen or double-tap W — windowed Ctrl+W closes the tab) |
| **⛶ Fullscreen button** | Fullscreen + keyboard lock — captures most browser shortcuts while playing |
| **Hold left click** | Mine block / attack mob |
| **Right click** | Place block / eat food / use crafting table |
| **E** | Open inventory & 2×2 crafting |
| **Q / Ctrl+Q** | Drop one / whole stack (held or hovered item) |
| **Middle click** | Pick targeted block |

In the inventory (Minecraft-style): **left-click** picks up / places / swaps stacks, **right-click** picks up half / places one, **drag** distributes a stack across slots (right-drag places one per slot), **shift-click** quick-moves between hotbar and inventory, **double-click** collects all matching items, **hover + 1–9** swaps with a hotbar slot, and clicking outside the panel throws the held stack. The game pauses while the inventory is open.
| **1–9 / scroll** | Select hotbar slot |
| **F / double-tap Space** | Toggle flight (creative mode only) |
| **F3** | Debug overlay |
| **V / F5** | Switch camera (1st person / 3rd person back / front) |
| **T / /** | Chat / cheat commands |
| **Tab** | Player list — names, hearts, ping, dimension (multiplayer) |
| **Esc** | Pause / release mouse |

## Multiplayer

```sh
node server/mp-server.js                       # serves the game AND the server on :8080
node server/mp-server.js --port 9000 --name "My World" --op Steve --seed 12345
```

Open `http://<your-ip>:8080` in a browser (friends on the same network use your LAN IP; for the internet, forward the port or run it behind a reverse proxy with WebSocket support). Everything is on **one port**: the game files, the WebSocket endpoint `/ws`, and an info endpoint `/status`.

| Flag | Meaning |
| --- | --- |
| `--port 8080` | listen port (default 8080) |
| `--name "Text"` | server name shown in chat/`/status` |
| `--seed 12345` | world seed (default: saved in db.json, then random) |
| `--op Steve` | grant operator to a nickname (comma-separated for several) |
| `--db file.json` | which world file to use (default `server/db.json`) |
| `--max-deltas N` | how many block edits to keep (default 20000, oldest dropped) |

The **first player to join an operator-less server becomes operator**; operators can `/kick` and `/op` others. Players near the spawn plaza are invulnerable and cannot build there unless they are operators or in creative mode.

Multiplayer tips: `/list` shows who is online, `/ping` shows your latency, `/tp <player>` teleports to a friend, `/me waves` emotes, and the server console prints every join/leave/chat.

## Deploy the multiplayer server

The server is a single dependency-free Node file. It serves the game, the WebSocket endpoint (`/ws`), `/status`, `/export` and `/import` on **one port**, so friends only need one link. Always put the game and the server on the *same* origin — an `https://` page cannot talk to a plain `ws://` server (browsers block mixed content).

| Host | How | Notes |
| --- | --- | --- |
| **Render** (free) | `New → Blueprint → pick this repo` (`render.yaml` is included) | HTTPS/wss out of the box, no card required. Sleeps after 15 idle minutes (~1 min wake), ephemeral disk — the world backup workflow handles that |
| **Railway / Koyeb / Fly.io** | Start command `node server/mp-server.js --port $PORT` (`Procfile` and `Dockerfile` included) | Same idea, different dashboard |
| **Your own PC** | `node server/mp-server.js --port 8080 --name "My Server"` + `cloudflared tunnel --url http://localhost:8080` | Free permanent link without hosting accounts; your PC must stay on |
| **VPS** | systemd unit, see below | Full control, world file on disk forever |

```ini
# /etc/systemd/system/webcraft.service
[Unit]
Description=WebCraft server
After=network.target
[Service]
WorkingDirectory=/path/to/WebCraft
ExecStart=/usr/bin/node server/mp-server.js --port 8080 --name "WebCraft" --op YourNick
Restart=always
[Install]
WantedBy=multi-user.target
```

Behind Nginx/Caddy always forward the WebSocket upgrade headers, otherwise the connection drops instantly:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

### The world on a free host (never lose your builds)

Free plans wipe their disk on every restart, so the server can save and reload its world through HTTP:

* `GET /export` — the whole world as JSON (seed, block edits, ops, time, weather).
* `POST /import` with header `x-mp-token: <secret>` — replaces the world (needs `--token <secret>` or `MP_TOKEN`).
* `--db-url <snapshot.json>` (or `MP_DB_URL`) — the server pulls that snapshot **at boot**, so a restart restores the world automatically.

The bundled workflow `.github/workflows/world-backup.yml` does this for you: every 20 minutes it downloads `/export` and commits it to the `world` branch, and `render.yaml` already points `MP_DB_URL` at that file. Set the repository **variable** `APP_URL` (Settings → Secrets and variables → Actions → Variables) to your server address to switch it on.

## Play locally

Because the game uses ES modules, it needs to be served over HTTP (opening `index.html` directly from disk won't work):

```sh
ruby -run -e httpd . -p 8123     # or: python3 -m http.server 8123
```

Then open <http://localhost:8123>.

## Deploy the game (GitHub Pages)

1. Push this repository to GitHub.
2. Enable Pages once: **Settings → Pages → Source: GitHub Actions** (the included workflow `.github/workflows/pages.yml` then redeploys on every push).
3. Your world is live at `https://<username>.github.io/<repo>/`.

Only add a `CNAME` file (or type a custom domain in Settings → Pages) when that domain really points at GitHub Pages — a domain pointing elsewhere hides the site behind a `404`/redirect.

## URL parameters

- `?seed=12345` — play a specific world seed (ignores the local save)
- `?rd=6` — render distance in chunks (2–8, default 4)

## How it works

| File | Purpose |
| --- | --- |
| `js/noise.js` | Seeded Perlin noise + fBm |
| `js/blocks.js` | Block definitions and a 16px texture atlas painted procedurally on a canvas |
| `js/world.js` | Chunk storage, terrain/biome/cave/tree generation, chunk meshing with baked ambient occlusion |
| `js/physics.js` | Swept AABB vs. voxel collision shared by player and mobs |
| `js/player.js` | First-person controller (walk/sprint/jump/swim/fly, health, fall damage) |
| `js/mobs.js` | Mob models, wander/chase AI, spawning, drop tables |
| `js/items.js` | Item/tool definitions, mining rules (hardness, tool tiers, drops), recipes, pixel-art icons |
| `js/inventory.js` | Item counts + hotbar slot assignment |
| `js/drops.js` | Dropped-item entities with magnet pickup |
| `js/sound.js` | Procedural WebAudio sound effects |
| `js/main.js` | Renderer, input, timed mining, inventory/crafting UI, HUD, day/night cycle, save/load |
| `js/net.js` | Multiplayer client: reconnection, ping, acknowledged block-edit outbox, remote-player state |
| `server/mp-server.js` | Zero-dependency server: static files + `/ws` + `/status`, shared world in `db.json` |

The world is generated in 16×16×80 chunks. Each chunk is meshed into a single geometry containing only the exposed block faces, with per-vertex ambient occlusion, and re-meshed on edit. Block edits are stored as per-chunk diffs so worlds regenerate deterministically from the seed plus your changes.
