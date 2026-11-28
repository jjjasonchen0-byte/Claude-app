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

## 3. Storyboard (as built; 30fps, 1758 frames = 58.6 s; music: Cat Walk, its drop at frame 443; cuts on the beat)

| # | Frames | Shot | Picture | Main move | Caption | Sound |
|---|---|---|---|---|---|---|
| 1 | 0–443 | Opening | The group chat ("Chats", our own app) on a titanium iPhone: typing dots, Sam "Wassup yall", Priya "Yoooooo", Leo "let's catch up!", Priya "But where?" (crash zoom; the frame tilts −9°). The right thumb taps the field, the keyboard slides up, both thumbs type "I've got just the thing" (~7.5 keys a second) and the right thumb sends (the frame rolls level). Swipe up: the chat shrinks into its icon; swipe to page 2; the finger taps Meet ("m•", the newest app); its icon grows into Meet's start screen as the camera dives into the wordmark's dot. | crash zoom, dutch roll to level, shared-element morph, dive | — | pops, crash impact, a real tap per touch and key, swooshes, vacuum zoom |
| 2 | 443–540 | Headline | On the music's drop: "Meet" huge, then "Meet in the middle." assembles; "The fairest place for everyone." | lead-word zoom-assemble | Meet in the *middle.* | cinematic impact on the drop |
| 3 | 540–679 | Crew | Close on the map: the hand taps Leo's corner of Hoboken, his address card opens, "Use this address"; cut wide: Leo is in the list (4 of 4) and on the map, a slow orbit. | close → wide orbit | Add your *crew.* | taps, soft transition |
| 4 | 679–762 | Modes | A hard cut into a macro on the rows: Sam's mode tapped, the menu, Bike. | macro, depth of field | — | taps, switch |
| 5 | 762–1053 | Race | The sheet dragged down, the glass play button; the press (punch-in); everyone's area floods out (fast); "Longest trip: 32 min" (a slower stare); the routes with everyone's time (Sam 31, Priya 32, Leo 30, You 27 min; fast); crash zoom onto the spot, held while everyone gathers there (every time sharp); back out as the app zooms out to its result: Mama Fina's House of Filipino Sisig, 167 Avenue A, in the East Village. | punch-in, speed ramp, crash zoom (impact) | Everyone's route, *racing.* · Fair for *everyone.* | tap, riser → impact |
| 6 | 1053–1191 | Tabs | The results sheet pulled up (everyone's time); macro on the tabs: Drinks, then Food, the highlight sliding. | follow, macro, depth of field | — | taps, switch clicks |
| 7 | 1191–1302 | Glide | Four real screens on real phones (the Food list, restaurants, the place page, the invite page) gliding past at −60°. | steep-tilt glide | Then pick a *place.* | swirl whoosh |
| 8 | 1302–1510 | Invite | "Share invite…" tapped; a paper plane flies past out-of-focus lights to the group chat; the invite card ("Let's meet at Mama Fina's House of Filipino Sisig · 167 Avenue A, Manhattan · Fri, Dec 4, 8:00 PM") lands; "omw 🔥", "perfect 🙌", "see you there!". | paper-plane messenger | — | tap, throw, whoosh, pops |
| 9 | 1510–1602 | Live | Real life: a bar in Manhattan on a December night, a yellow cab outside; the end of a hug, everyone's drink up; cut as the glasses meet, on the clink. | live action (1.25×) | — | bar crowd, a cheer, the clink |
| 10 | 1602–1758 | Brand | The glass play button flips into the blue dot; "meet" lands beside it; "Plan your next catch-up." and the address. | icon-flip bloom | meet• · Plan your next catch-up. · meet-hhdt.onrender.com | shimmer, soft impact |

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

## 8. New York, an iPhone, two thumbs (after: "a real-life application in America", "a modern iPhone", "softer sound effects", "no one types with just their index finger", icon option 4)

Where this differs from §7 (the phone, the capture's city and locale, the live clip, the sound), this wins.

| Decision | What | Why |
|---|---|---|
| A real New York evening | The group moves to New York: You at Domino Park (Williamsburg), Sam at Lincoln Center, Priya at MoMA PS1 (Long Island City), Leo added from the map in Hoboken. You, Priya and Leo take the subway or PATH, Sam switches from walking to his bike on camera. Filmed as a US phone (`en-US`, Eastern time, dates as 12/04/2026, distances in miles) on Friday 4 December at 6:30 pm, and the routing asked for that evening too (the capture adds the filmed time to the live site's routing requests: "leave now" would otherwise mean whatever time it is where the capture runs, and the first take showed trains at 12:55 AM). The live site finds Mama Fina's House of Filipino Sisig, 167 Avenue A (Sam 31 · Priya 32 · Leo 30 · You 27 min); the invite is for tonight, 8 pm | A real use in America, with real transit times |
| Miles in the app | The app itself now shows feet and miles on US phones (`public/js/units.js`, tested), metres and kilometres elsewhere | So the footage is the real app, not a dressed-up one |
| A modern iPhone | `public/phone/frame.png` is now a photographed natural-titanium iPhone (Higgsfield GPT Image 2.6, upscaled, background removed; display keyed by `assets-src/frame.py`). Its Dynamic Island is drawn over the display (122 × 36 app px, 11 from the top) so it stays sharp at any zoom; the edge layers are warm titanium | The user asked for a modern iPhone (this replaces §7's generic-phone rule for the device) |
| iOS around the app | An iPhone status bar (time in the left ear; signal, wifi and battery in the right); an iPhone-style keyboard (predictive bar with the half-typed word in quotes, capitals while shift is on, the key's balloon, 123 · space · return, emoji and dictation keys, home indicator); a home screen of rounded-square icons with a New York weather widget, page dots and a frosted dock. The chat app stays our own | It has to read as that phone in the hand |
| Meet's icon | Option 4 of the five shown: a black lowercase "m" (Inter 800) and the blue dot on white, the wordmark's own letters. It sits at the end of page two, where a newly installed app lands | The user's choice |
| Two thumbs | The message is typed with both thumbs (`public/phone/thumb.png`, Higgsfield, keyed by `assets-src/thumb.py`; the left is the same thumb mirrored): each thumb swings from its root at the phone's lower corner so its pad lands on the key, the left thumb on the left half of the keyboard, the right on the right, the space bar to whichever didn't type the letter before; the right thumb taps the field and sends. The camera is closer while typing (1.62×) so the hands holding the phone stay just out of frame. The swipes and the tap on Meet are still the index finger (the right hand lets go of the phone) | The user: "no one types with just their index finger" |
| Softer sound | Every effect at a little over half its level; hits, whooshes and the riser at about a third; the music unchanged, so after mastering it carries more of the film | The user: "less jarring" |
| Real life, in New York | `public/live/bar.mp4` (Higgsfield: a GPT Image 2.6 start frame (the hug) and end frame (the toast) of the same four people, Kling 3.0 pro between them): a warm Manhattan bar on a December night, a yellow cab outside. Played from the end of the hug to the glasses meeting (92 frames at 1.25×) | The beer garden was Sydney; a first take without an end frame never got to the toast |
| Licensed sounds, fetched again | The Epidemic Sound tracks (screen taps, the clink, the cheer, now an indoor bar crowd in place of the beer garden) were downloaded afresh for this version, as their licence asks for each new version of a video; `assets-src/taps.py` cuts the eight taps from the taps track | Licence terms |
| A dark-mode version | The same cut with the phone in dark mode: a second capture of the same session (`node capture/scenes.mjs --dark` → `public/captures-dark/`: the app's dark theme and Google's dark map; the same taps, timings and result), and the drawn screens in their dark colours (`DARK` in `src/theme.ts`, from the `dark` input prop: the chat app, an iPhone dark keyboard, white status bar and home indicator, Meet's icon white on black). `./render.sh dark` → `out/meet-ad-dark.mp4` and `out/meet-ad-dark-nobgm.mp4` | The user asked for one |
| One clean render | `render.sh` bundles once, then renders every chunk afresh; `render-patch.sh` is gone (it re-encoded a middle chunk with another time base, and the join froze the picture from 0:15 to 0:27) | The user saw the freeze |

### The review of the New York cut, and what was done

| Finding | Done |
|---|---|
| S-1 the thumbs crossed in the middle of the keyboard | A thumb waits through a longer gap at its own resting place (raised, on its own half), on a smooth curve; each thumb hits the space bar towards its own end |
| S-2 the race close-up cut off Leo's time and the place's name | The crash lands wider (1.54×, then 1.58×) and centred on all four times and the name |
| S-3 the date fields looked like a desktop browser's | The capture draws them as an iPhone does: "Dec 4, 2026 at 8:00 PM" |
| S-4 the clink came after the glasses met, on black | Pinned to the touch (frame 88 of the shot); the fade to black is 2 frames |
| S-5 the headline and crew shots stopped a few frames before their cuts | Their moves now run to the cut |
| S-6 the invite's tap and the answers were lost under the music | The music dips 3.5 dB under each |
| N-1 the apostrophe appeared with no key pressed | "Ive" is typed; the space autocorrects it to "I've" (the predictive bar offers it) |
| N-3 the launch looked like a double exposure | The icon hands over to the app's screen within its first frames, centred in the growing window |
| N-6 the last chat framing cut the status bar in half | The whole screen is in |
| Kept | N-4 (leave now at 6:32 for an 8 pm invite: true to the app), N-5 (beer at a Filipino restaurant: plausible), N-2 (one thumb, mirrored), N-8 (same gain in both mixes, by design), N-10 (length) |

### The bar, and the phone's own apps (after: "make the fairest journey end in a bar", "make the iPhone apps genuine iPhone apps and icons")

| Decision | What |
|---|---|
| The night ends in a bar | The places step goes Fun → Drinks (the highlight out and back), Bars, sorted by Fairest (the bar whose trips are most even comes first), and the invite is for that bar. The live-action ending was already a bar |
| The phone's own apps | The home screen shows the iPhone's built-in apps by their names: Phone, Safari, Messages and Music in the dock; FaceTime, Calendar (Friday 4), Photos, Camera, Mail, Clock (at 6:31), Maps, Reminders, Notes, Stocks, Books, Health, Home, Wallet, Files and Settings on page one beside the weather widget; Calculator, Contacts, Voice Memos, Translate, Shortcuts, Compass, Measure, Tips, Podcasts, then Meet, on page two. Each icon is our own drawing of that app's usual symbol (a handset, a compass, a speech bubble, a note…), not a copy of Apple's icon artwork |
| Messages | The group chat is laid out like the phone's messaging app (our drawing of its familiar layout): grey bubbles with tails from the others, each sender's name above and face beside, your blue bubble and "Delivered", the group's faces and name centred at the top, a round + and a rounded "Text Message" field whose microphone becomes a blue send arrow. Swiping up closes it into Messages in the dock. The invite arrives as a link preview |

### Handcraft, new names, thumbs apart, a smooth hand-over (after: "the circles for the pfp are being clipped", "make sure the thumbs never overlap", "change the place to meet… change the people's positions", "white American names", "at 0:43 it cuts right into the app")

| Decision | What |
|---|---|
| Where they meet | New start points (You by McCarren Park, Jake at Broadway & 86th, Emily in Greenpoint, Ryan in Hoboken): on a Friday evening the live site's fairest spot is Handcraft, a cocktail bar and kitchen at 367 3rd Avenue (You 30 · Jake 29 · Emily 34 · Ryan 31 min). Meet names its meeting point after the liveliest place right by the fairest spot, whatever it is; about thirty live tries never put a bar there, and the user said any place will do. The invite goes to that same place (Food → Restaurants, nearest first: Handcraft) |
| The ending fits it | A new live-action clip: the four friends meeting at a brick-walled cocktail kitchen on 3rd Avenue, cocktails and small plates on the table, the hug then the toast (GPT Image start and end frames, Kling 3.0 between them) |
| Names | Sam, Priya and Leo become Jake, Emily and Ryan (in the chat, on the app's footage: Ryan is typed in when he's added) |
| The faces in the chat | The bubbles' tails are one drawn shape in the bubble's colour (nothing laid over the face beside it); the group's faces in the header sit side by side |
| Thumbs never overlap | Both thumbs are planned together, frame by frame: each presses its own keys, waits on its own side, and their pads are never nearer each other than 125 app px across the keyboard (the one further from its next key gives way, sideways) |
| 0:43 | The glide's last 30 frames: the strip turns square to the camera and the last screen (the invite page) lands exactly where the invite shot opens, so the cut is invisible; the caption leaves before the turn |

