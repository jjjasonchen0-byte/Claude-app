# Meet advert: design spec

Mode: **autonomous free creation** (the user chose "you direct it"). Format: **vertical 9:16, 1080×1920 @ 30fps**.

## 0. Product brief

- **Product.** Meet finds the fairest place for a group to meet: everyone's starting point and way of
  travelling go in; Meet races everyone's routes across the real street map and picks the spot where
  everyone's trip is about as long; then it lists places nearby and sends the plan to the group.
  A phone-first web app with a full-bleed map, a draggable glass sheet and smooth animations.
- **Purpose.** A short social advert (TikTok / Reels / Shorts), ~40s.
- **Audience.** Friend groups, 16–35, on phones; the moment of "let's catch up… but where?".
- **One message.** *Can't decide where to meet? Meet finds the fairest spot.*
- **User's fixed requirements.**
  1. Style like a phone-maker's launch film: exaggerated camera moves and zooms.
  2. Opens on a messaging app: Friend1 "Wassup yall" · Friend2 "Yoooooo" · Friend3 "let's catch up!" ·
     Friend2 "But where?" · You "I've got just the thing".
  3. The user closes the messaging app, swipes the home screen, taps the Meet app.
  4. Then a showcase of most of the interesting parts of the app, its animations especially.
- **Data.** The app footage is filmed on the live site (its real map, routing and places): fictional
  people (Sam, Priya, Leo, You) at public street addresses; the venues are real businesses as the app
  lists them. Nothing personal.
  The three friends in the chat are those same people, so the story carries through.
- **Brand safety.** The look is *inspired by* phone launch films; nothing of a real brand is copied:
  a generic phone (no maker's shapes or marks), an original chat app and home screen in Meet's own
  design language, original icons, no real company names, Inter type (not a maker's system font).

## Requirements → decisions

| Requirement | Decision |
|---|---|
| Launch-film style, exaggerated camera | Black stage; the phone is the hero; big white type; crash zooms, 3D orbits, a dive into the app icon, speed ramps. Camera eases with a long settle. |
| Vertical | 1080×1920 @ 30fps, ~40s. Text sized for a phone screen (headlines ≥ 96px, captions ≥ 56px). |
| Chat opening | Original chat UI built in Meet's design language (a non-replica scene, Q1). Messages arrive one by one with typing dots; the camera pushes in. |
| Close app → swipe → tap Meet | Original home screen (two pages of generic icons, Meet's real icon on page two). Chat shrinks into its icon; swipe; tap; Meet's icon zooms open into the app. |
| Showcase | Real footage of Meet's live site, captured at 3× with a controlled clock (slow motion, then re-timed) so every animation is smooth and sharp. |
| Audio | Strong-beat electronic bed + film-style SFX; two renders: with and without music. |

### Feature checklist (each gets one shot, one main move)

1. Who's meeting: people as rows and coloured pins (the people list, travel-mode pills).
2. A way of travelling per person: walk / bike / transit / drive (the mode menu, sliding highlights).
3. **Let's meet**: everyone's routes race out over the streets (the flood animation), the hero.
4. The fairest spot: the meeting point, equal travel times ("27 min · 27 min · 28 min").
5. Places nearby: tabs Food / Drinks / Fun with sliding highlight, place list with icons, a place page.
6. The glass sheet and the play button above it (drag, fade).
7. Send invite: the plan goes back to the group chat (closes the story loop).
8. Brand: "meet•" wordmark, the line, the address.

## 1. Visual direction

Three directions considered:

| # | Direction | Notes |
|---|---|---|
| A | Glass on white | Keynote-light: off-white stage, black type. Calm, matches the app's light glass. Less drama for zooms. |
| **B** | **Black stage, glowing glass (chosen)** | Black stage with faint wallpaper glows in Meet's colours; the phone's bright light-mode screen glows against it; white display type, the key word in Meet blue. The most contrast for crash zooms and orbits, closest to the brief. |
| C | Colour pop | A saturated solid colour per scene (each person's colour). Playful, but busy next to the map's own colours. |

Why B: the brief asks for launch-film drama; the app's best moments (coloured routes racing, the
blue meeting point) read strongest as a bright screen in a dark room; Meet's own tokens carry over
exactly (the app's light theme on screen, its accent and person colours for the glows and type).

### Tokens (from `public/css/styles.css`)

- **Type:** Inter (the app's fallback for the system font): display 800/700, tight tracking −0.035em
  (as the app's wordmark); body 600. Wordmark: "meet" + a blue dot (`.wordmark i`, 0.34em).
- **Stage:** `#000`, with soft glows from the app wallpaper: blue `rgba(0,122,255,.24)`,
  purple `rgba(175,82,222,.20)`, teal `rgba(48,176,199,.20)`, orange `rgba(255,149,0,.14)`.
- **Accent:** `#007aff` (light) / `#0a84ff` on black for type. Person colours `#007aff #ff9500 #34c759 #af52de`.
- **Glass:** material `rgba(248,248,252,.52)`, blur 26px, rim `inset 0 1px 0 rgba(255,255,255,.85)`, edge
  gradient 150°; capsules (radius 999px); cards 24px; sheet 34px.
- **Phone:** generic slab, 1080-frame rest width 760px (screen 390×844pt at 1.95×), bezel 14px near-black
  with a cool metal edge; a small round front camera. Shadow: long soft drop + a faint blue rim light.

### Motion tokens (energy: mid-high, tone: playful-premium)

- **Camera:** `bezier(0.16,1,0.3,1)` (fast in, long settle), 24–36f per move; crash zoom 6f ease-in
  (≤2 in the film); one dutch roll; orbits ≤ 30° so the screen stays readable.
- **UI arrivals:** the app's own spring `bezier(0.3,1.22,0.45,1)` ~14f (≈ its 440ms highlight slide);
  overshoot ≤ 1.05; no squash.
- **Type:** blur-slide words (y 40→0, blur 10→0, 3.5f stagger); lead-word zoom for the headline.
- **Holds:** every headline ≥ 30f readable hold; the wordmark hold ≥ 30f (R1); batch motion rests 15f.
- **Three words for the motion:** *bold, smooth, warm*.

Styleframe: `styleframe/styleframe.html` → `styleframe/styleframe.png` (chat close-up · headline card ·
phone over the real map). It confirmed B. Fixes carried into the build: proper status-bar icons; captions
never overlap the phone (top band 120–460px is for type, the phone sits below).

## 2. Feature → shot mapping

Gallery cards (checked in `gallery/api/library.json`; each card read in full; its demo TSX read at build time):

| # | Feature / beat | Card · style | Demo source | Why |
|---|---|---|---|---|
| 1 | Chat: "But where?" | `crash-zoom-punch` (rebound) | camera/crash-zoom-punch/CrashZoomReal.tsx | The comic "look at this!" beat. Crash zoom 1 of 2. |
| 2 | Chat: problem → "I've got just the thing" | `tension-camera-moves` · `dutch-roll-to-level` | camera/tension-camera-moves/DutchRollToLevel.tsx | Problem held at a tilt, the answer rolls it level. |
| 3 | Close the chat app; open Meet | `transition-travel` · `shared-element-morph` | transition/transition-travel/SharedElementMorph.tsx | The app shrinks into its icon; Meet's icon grows into the app (the same morph, both ways). |
| 4 | Headline | `lead-word-zoom-assemble` | typography/lead-word-zoom-assemble/LeadWordZoomAssemble.tsx | "Meet" huge, then "Meet in the middle." assembles round it. |
| 5 | Travel modes | — (a macro on the mode menu; the card's sliding highlight lives in the tabs shot) | — | A hard cut into a macro on Sam's row: tap, the menu, Bike. |
| 5b | Tabs | `segmented-thumb-hero` | interaction/segmented-thumb-hero/SegmentedThumbHero.tsx | Macro on the tabs: the highlight slides Drinks → Food. |
| 6 | Tap the play button | `input-trigger-moves` · `cursor-performance` | interaction/input-trigger-moves/CursorPerformancePunchIn.tsx | A finger (touch dot) presses; the camera punches in 1.4× and eases back. |
| 7 | Routes racing (hero) | `speed-ramp-freeze` · `speed-ramp` | rhythm/speed-ramp-freeze/SpeedRampReal.tsx | Fast → 0.2× stare as routes meet → fast. |
| 8 | The meeting point | `crash-zoom-punch` (impact) | camera/crash-zoom-punch/CrashImpactReal.tsx | "That's the spot." Crash zoom 2 of 2. |
| 9 | Places nearby | `steep-tilt-glide` | camera/steep-tilt-glide/SteepTiltGlide.tsx | The screen stood at a steep angle, the place list gliding past. |
| 10 | Send invite → back to the chat | `paper-plane-messenger` | transition/paper-plane-messenger/PaperPlaneMessenger.tsx | Meet's own send icon is a paper plane: it carries the invite into the chat. |
| 11 | Brand | `ui-to-brand-morph` · `icon-flip-bloom` | outro/ui-to-brand-morph/IconFlipBloomLogo.tsx | The play button flips and becomes the wordmark's blue dot; "meet" lands. |
| — | Seams | hard cuts on the beat (the `shot-transitions` card is not used) | — | Every cut lands on a beat of the music (timeline.ts snaps each one); a launch film's cutting. Two fades to black: into the headline, out of real life. |

People list, results and the glass sheet need no card: they are real footage, carried by one camera
move each (slow orbit, macro push), with a caption.

Deliberate departures (aesthetic rules): **Q8** (outro as a group photo at peak energy) is replaced by
`ui-to-brand-morph`: a clean launch-film ending reads better here, and the card says the two are
alternatives. **R3** chat timing follows a real conversation, slightly quicker than reading every
bubble twice: each bubble holds ≥ 18f before the next arrives.

## 3. Storyboard (as built; 30fps, 1719 frames = 57.3 s; music: Cat Walk, its drop at frame 443; cuts on the beat)

| # | Frames | Shot | Picture | Main move | Caption | Sound |
|---|---|---|---|---|---|---|
| 1 | 0–443 | Opening | The group chat ("Chats", our own app) on the photographed phone: typing dots, Sam "Wassup yall", Priya "Yoooooo", Leo "let's catch up!", Priya "But where?" (crash zoom; the frame tilts −9°). The hand taps the field, the keyboard slides up, it types "I've got just the thing" key by key (~7.5 a second) and sends (the frame rolls level). Swipe up: the chat shrinks into its round icon; swipe to page 2; the hand taps Meet; its icon grows into Meet's start screen as the camera dives into the wordmark's dot. | crash zoom, dutch roll to level, shared-element morph, dive | — | pops, crash impact, a real tap per touch and key, swooshes, vacuum zoom |
| 2 | 443–540 | Headline | On the music's drop: "Meet" huge, then "Meet in the middle." assembles; "The fairest place for everyone." | lead-word zoom-assemble | Meet in the *middle.* | cinematic impact on the drop |
| 3 | 540–679 | Crew | Close on the map: the hand taps Leo's corner of North Sydney, his address card opens, "Use this address"; cut wide: Leo is in the list (4 of 4) and on the map, a slow orbit. | close → wide orbit | Add your *crew.* | taps, soft transition |
| 4 | 679–762 | Modes | A hard cut into a macro on the rows: Sam's mode tapped, the menu, Bike. | macro, depth of field | — | taps, switch |
| 5 | 762–1053 | Race | The sheet dragged down, the glass play button; the press (punch-in); everyone's area floods out (fast); "Longest trip: 19 min" (a slower stare); the routes with everyone's time (fast); crash zoom onto the spot, held while everyone gathers there (every time sharp); back out as the app zooms out to its result: Charles Thai, 45 King Street, Newtown. | punch-in, speed ramp, crash zoom (impact) | Everyone's route, *racing.* · Fair for *everyone.* | tap, riser → impact |
| 6 | 1053–1191 | Tabs | The results sheet pulled up (everyone's time); macro on the tabs: Drinks, then Food, the highlight sliding. | follow, macro, depth of field | — | taps, switch clicks |
| 7 | 1191–1302 | Glide | Four real screens on real phones (the Food list, restaurants, the place page, the invite page) gliding past at −60°. | steep-tilt glide | Then pick a *place.* | swirl whoosh |
| 8 | 1302–1510 | Invite | "Share invite…" tapped; a paper plane flies past out-of-focus lights to the group chat; the invite card ("Let's meet at Charles Thai · 45 King Street, Newtown · Fri, 27 Nov, 6:30 pm") lands; "omw 🔥", "perfect 🙌", "see you there!". | paper-plane messenger | — | tap, throw, whoosh, pops |
| 9 | 1510–1563 | Live | Real life: the four friends at the pub, the hug turning into raised glasses; cut as they meet, on the clink. | live action (1.25×) | — | beer-garden crowd, a cheer, the clink |
| 10 | 1563–1719 | Brand | The glass play button flips into the blue dot; "meet" lands beside it; "Plan your next catch-up." and the address. | icon-flip bloom | meet• · Plan your next catch-up. · meet-hhdt.onrender.com | shimmer, soft impact |

## 7. The ultra-realistic pass (after the brief: "I want the entire thing to be ultra realistic")

| Decision | What | Why |
|---|---|---|
| Real phone body | `public/phone/frame.png`: a photographed, unbranded glossy-black phone (Higgsfield, GPT Image 2.6, green screen keyed by `assets-src/frame.py`), the display cut out and scaled so it is exactly 760 × 1645 world px; its thickness drawn as stepped layers that shift with the camera's tilt; a softbox reflection sliding over the glass | A drawn slab reads as a diagram; a photographed body with depth and glass reads as a product shot. One side's buttons only, punch-hole camera: no real brand's look |
| Real hand | `public/phone/hand.png` (Higgsfield), graded under the same light, reaching in along its arm for every tap, swipe and drag, its shadow falling on the screen (nearer and sharper as it touches), smeared like a 180° shutter when fast | Touch dots are a screen-recording convention; a hand is what a camera would see |
| Real keyboard | A plain keyboard slides up when the field is tapped; each key pops as it is typed (~12 a second), suggestions change | Text appearing in a field by itself is the least real moment in a chat |
| Lens and sensor | Charcoal studio sweep instead of black; vignette and per-frame grain on every graphic shot | Clean black and perfect pixels read as CG |
| Real life | `public/live/pub.mp4` (Higgsfield, Kling 3.0 pro): the four friends meeting at the pub, the clink. 2.3 s after "see you there!" | The product's promise, shown, not said |
| Real sound | Epidemic Sound (via Higgsfield): taps on a phone screen (one per touch and keystroke), a beer-garden crowd, glasses clinking, a cheer; film whooshes/impacts from the skill's library on the camera moves | Synthetic UI tones break the illusion (rule S1) |
| Capture | The live site (meet-hhdt.onrender.com): its real map (Google's, through the site), real routing and real places, filmed frame by frame on a held clock. A fictional group at real Sydney addresses; Australian locale (dates as 27/11/2026), the invite time set (Fri 27 Nov, 6:30 pm); every map tile drawn before a clip starts | The user asked for the real map, not the offline test build's simplified one |
| Brand rule | The chat app, its keyboard and the home screen are our own designs: a left-aligned chat header with one "more" icon, white/violet bubbles with coloured names, a bordered box to write in with a plain + and a square send button, a plain keyboard (123 · space · . · return; three suggestions of equal weight; no apostrophe on the letters, so autocorrect writes "I've"); round icons for invented apps and a search bar on the home screen. The share page's "Apple Maps" button is hidden in the capture | No phone maker's look or name on screen (the independent review's B-1, B-2) |
| A phone's safe areas | The capture tells the browser about a status bar (50 px) and a home indicator (34 px), as a phone does; the app lays itself out around them and the advert draws the status bar and indicator on top | The app's top line was under the camera hole; and footage without a status bar never looks like a phone |
| Pace | The opening is 34 frames longer: the message is typed by the hand at ~7.5 keys a second; "Meet" lands on the music's drop (frame 443); every later cut is on a beat; mastered to −14 LUFS | The review's B-4, S-9, S-10, S-11 |
