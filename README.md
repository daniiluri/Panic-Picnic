# Panic Picnic

A cartoon party arcade for 2–6 friends on the same Wi-Fi. Players can mix laptops, desktops, tablets, and phones in one room. One computer runs the React app and FastAPI room server.

## Play locally

Install Node.js 24, uv, and mkcert on the host computer. Build the app from the project root.

```sh
uv sync --locked
npm --prefix frontend-react ci
npm --prefix frontend-react run build
```

Find the computer’s Wi-Fi IPv4 address. On Linux, `hostname -I` lists the addresses. Start the server with that address, as shown below.

```sh
uv run python -m backend.serve 192.168.1.24
```

The launcher prints the HTTPS party URL and the path to the public trust certificate. Use the printed address on the host and every player’s device so copied invite links point to the host’s Wi-Fi address. Keep the server running during play. Rooms and scores live in memory and expire after everyone leaves.

### Trust HTTPS on each device

The camera and microphone need a trusted HTTPS origin. The launcher creates a project-specific local certificate authority under `.certs/ca`. Transfer **only the public `rootCA.pem`** to the devices that will play. The private keys stay on the host. Copying the public certificate as `Panic-Picnic.crt` makes it easier for mobile systems to recognize the file.

- **iPhone or iPad** — Open the certificate on the device, install the downloaded profile in Settings, then enable full trust for it under **General → About → Certificate Trust Settings**.
- **Android** — Open **Settings → Security & privacy → More security settings → Install a certificate → CA certificate** and select the public certificate. Settings labels vary by device.
- **Host computer** — To trust this project’s public CA locally with mkcert on Linux or macOS, run `CAROOT="$PWD/.certs/ca" mkcert -install` from the project root.

Open the printed URL, usually `https://<host-wifi-ip>:8443`. Both devices must be able to reach the host on TCP port 8443. If the Wi-Fi address changes, run the launcher with the new address. It will issue the matching certificate from the same CA. [mkcert mobile instructions](https://github.com/FiloSottile/mkcert#mobile-devices)

## Start a match

The arcade follows your device’s light or dark appearance. Use the moon or sun button next to the language selector to change it. Your browser remembers the choice, including during a match.

1. Choose **EN** or **RU** in the header. Each device remembers its own language, and players in the same room can use different languages.
2. Create a room, share its code or invite link, and choose a character in the lobby. When two players are ready, the host presses **Start match**, chooses the games and their order, and presses **Launch lineup**.
3. Each game has an eight-second warm-up to learn the controls, practice, or sit out. The countdown starts the game automatically. A round needs two participants. Others can watch.
4. Round results show the scores and the upcoming game for five seconds. The last results lead to the podium, where the host can start a rematch. Each player earns a party point for each participating opponent they finish ahead of.

| Game | Round |
| --- | --- |
| 67 Frenzy | Face the camera with one hand on each side of the preview line. Turn your palms toward the ceiling. Lift one hand as the other drops, then reverse. Each switch counts, and the most switches in 20 seconds wins. |
| Mic Hop | Each distinct sound near the microphone moves your character one block, even while the previous sound fades. Finishers rank by time across twelve blocks and remaining players by distance after 30 seconds. |

Quiz and Picnic Open Mic are temporarily unavailable.

The arcade requests available devices together when the page opens and reuses them through the lineup and rematches. Only the current game’s input is active during warm-up and play. The 67 Frenzy warm-up preview is private. During play, the server relays live camera thumbnails from players to everyone in their room, including spectators. Choose **Sit out** during warm-up to watch with your camera off. Frames expire from memory as they are replaced or the round ends. Mic Hop processes audio on the player’s device. Leaving the room or closing the page releases the tracks.

Reconnecting in the same tab within 60 seconds restores the seat. A page reload opens a new capture session and browser permission settings apply. Leaving explicitly releases the seat immediately. If the host leaves or their reservation expires, the longest-connected remaining player takes over.

## Development and verification

Run these in separate terminals for frontend hot reload on the host computer.

```sh
uv run uvicorn backend.main:app --reload
npm --prefix frontend-react run dev
```

The Vite dev server proxies the room API and native WebSocket to FastAPI. For phone testing use the HTTPS launcher above. The backend uses one worker.

```sh
uv run pytest
npm --prefix frontend-react run lint
npm --prefix frontend-react run build
node --test frontend-react/e2e/detectors.test.mjs
cd frontend-react
npx playwright install chromium --only-shell
npm run test:e2e
```

Playwright starts a loopback server with independent desktop and mobile browser sessions. Its virtual camera plays fast alternating hands and its virtual microphone plays separate sound bursts. The full-lineup test checks practice and live scoring, automatic transitions, and the number of device requests. Set `PICNIC_CAMERA_FIXTURE` to test another Y4M recording, or `PICNIC_TEST_URL` to test a running HTTPS server.

For a physical-device check, practice the palms-up gesture with your fingers relaxed. Try faster switches, a held pose, and moving both hands together. For Mic Hop, take turns making short sounds with devices at normal playing distance.

## Assets

The arcade illustrations were made with the built-in image generator. The artwork briefs include a rubber-hose strawberry, pickle, and toast crew, two gloves tossing a 6 and a 7, a hopping microphone, and a question-mark flashcard for Quiz. The WebP artwork is in `frontend-react/public/art`. The selectable characters are original Three.js models.

<details>
<summary>ImageGen prompt for the Quiz card</summary>

> Use case: logo-brand. A wide horizontal illustrated game-card cover for Quiz in a retro picnic party game series. Landscape composition, approximately 2.4:1. Main emblem centered: a big cream trivia flash card tilted at a jaunty angle with a single large dark burgundy question mark '?' in the middle, with only one offset mustard-yellow card behind it for depth. Burgundy hand-inked outlines, 1950s comic silkscreen halftone dots, bright coral-pink sky with radial halftone burst, dark leaf green distant picnic park shrubs and red-and-cream gingham strip along the bottom. A few small yellow starbursts. Simple, high-contrast, charming vintage cartoon, close crop that fills the frame, strong central silhouette readable at tiny thumbnail size. Keep the central question mark and card within the middle horizontal band, leave breathing room. No lettering other than the single '?', no words, no faces, no eyes, no hands, no magnifier, no border. Full bleed.

</details>

The home page serves the picnic illustration at two sizes. [Full-size artwork](frontend-react/public/art/picnic-in-the-park.webp) and [small artwork](frontend-react/public/art/picnic-in-the-park-small.webp).

The open-mic stage uses a backdrop from the built-in image generator and front and back portraits rendered from the lobby's Three.js characters. [Stage backdrop](frontend-react/public/art/comedy.webp) and [character portraits](frontend-react/public/art/stage-cast.webp).

<details>
<summary>ImageGen prompt for the open-mic stage</summary>

> A wide 2.2:1 landscape 1950s cartoon comedy club stage SCENERY background plate for a cozy picnic game. Straight-on audience view, centered and symmetrical. Warm dark-forest-green back wall with a glowing soft buttery oval of light in the middle. Open tomato-red velvet curtains framing the left and right sides and a slightly swagged red valance, a row of small glowing gold globe bulbs. A single slender vintage silver microphone on a black stand at 62% from the left. Bare honey-colored wooden podium floor spanning left to right at 60-70% down the image, its front edge at 72%. The foreground below the stage is a plain dark teal parquet floor with room to overlay seats. Inviting hand-inked mid-century rubber-hose game-box illustration, screen print textures, bold gently irregular dark forest ink outlines and calm flat spot colors. Keep the entire center of the stage empty to composite a character there. No text, no lettering, no audience, no characters, no furniture, no tomatoes, no chair silhouettes, no logos. Full bleed.

</details>

<details>
<summary>ImageGen prompt for the picnic scene</summary>

> Draw a landscape spot illustration for Panic Picnic, a local multiplayer party game. Three vintage rubber-hose cartoon friends are sitting cross-legged on a strawberry-red and ivory gingham picnic blanket playing a little hand of plain colored cards: a rosy strawberry with leafy green hair and gloves, a tall bumpy dill pickle in a backwards orange baseball cap, and a golden slice of toast with black sunglasses. They look at one another and laugh. Place an open woven picnic basket beside the blanket; a few daisies and grass tufts frame it. Behind them make one connected little park vignette with rounded olive-and-sage treetops, a sliver of pastel blue sky and a fluffy off-white cloud. Bold confident wobbly dark forest ink outlines, midcentury children's game-box screen print illustration, warm flat spot colors, lightly grainy ink and paper, lively expressive faces, warm and inviting like a sunny afternoon. Landscape 3:2 composition, BIG characters filling the scene, blanket sweeping gently across the foreground from left to right. Transparent background around the entire irregular silhouette, like an illustration printed straight onto a picnic invitation. The whole scene fits with narrow clear margins. No white sticker outline, rectangular background, gradients, letters, captions, words, logos, numbers or watermarks.

</details>

The dark theme uses a [moonlit version of the park illustration](frontend-react/public/art/picnic-in-the-park-night.webp) with a [smaller mobile edition](frontend-react/public/art/picnic-in-the-park-night-small.webp).

<details>
<summary>ImageGen edit prompt for the moonlit picnic</summary>

> Edit the supplied transparent Panic Picnic park illustration into its moonlit companion for the game's dark theme. Keep the same three recognizable rubber-hose friends playing cards: strawberry on the left, pickle in backwards cap in the middle, toast with sunglasses on the right. Match their facial expressions, seated poses, cards, basket on the right, gingham blanket, flowers, bold hand-inked contours and midcentury screen print grain. Retain the landscape 3:2 composition and close crop. Change the time of day: muted deep-indigo sky with a small pale butter crescent in the upper right and a few discrete stars, dark teal trees, dusk-blue grass, warm ivory highlights on their faces, gloves and cards. Let the strawberry, pickle, toast and faded berry checks keep their characteristic colors. Make the three faces cheerful, warmly legible and inviting against the nighttime park. Preserve the irregular outer silhouette and real transparency all around outside the vignette so it blends into a navy #263348 web page; keep all edges and objects within the canvas. No white sticker outline, rectangular backing, frames, text, logos, new characters or signage.

</details>

67 Frenzy tracks opposite vertical strokes on either side of the preview line. It compares color patches in a small, smoothed camera frame so hands can stand out against clothing of similar brightness. Gesture scoring runs on the player’s device.
