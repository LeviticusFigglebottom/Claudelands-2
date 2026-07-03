# ROADMAP

## Pass 21 status — everybody gets a real voice

**Full recorded voice-over**: all 384 fixed character lines are now
PERFORMED by real neural TTS (ElevenLabs **eleven_v3**, the expressive
performance model — re-baked from the initial multilingual_v2 pass,
which read too clean/narratorial for the game) — quest briefings/accepts/completes for every giver,
all 64 wire-spool logs, Rita's race commentary, BIG NAZDA's entire
announcer book, and the four playable characters' combat chatter.
Fifteen cast voices, each with standing character direction baked into
every line as v3 audio tags ([gruff, gravelly old foreman],
[shouting, unhinged carnival barker], [theatrical, dramatic
fortune-teller]...) plus per-context acting notes: player combat lines
are tagged by trigger (downed = [desperate, gasping], legendary drop =
[awed, delighted], reload grumbles = [muttering, annoyed]), Rita's race
lines by outcome ([gloating] vs [grudging respect]), and yelled lines
get [shouting] heat automatically.

**How it plugs in**: `tools/collect-vo.ts` walks the data files and
emits every voiced line; `tools/bake-vo.mjs` renders them to
`public/vo/<voice>/<hash>.mp3` (64kbps mono, ~15MB total) plus a
manifest with clip durations. At runtime `voice.speak()` asks the
manifest first — recordings play through one reusable audio element —
and falls back to the procedural synth for anything unrecorded
(dynamic interpolated strings, missing manifest, future lines). The
key is a digit-stripping normalization hash, which is how "WAVE 12!"
finds the number-free "WAVE!" recording.

**Ground rules**: the API key lives ONLY in the XI_KEY env var at bake
time — never in the repo. Retakes = delete the clip file(s) and re-run
the bake (existing files are skipped). This pass deliberately relaxes
the zero-binary-assets rule for voice audio; everything else stays
procedural.

Headless suite: `verify22.mjs` — 10 checks, all passing (asset
integrity + duration sanity, manifest load, recorded-vs-synth routing,
numbered announcer lookups, per-voice fetchability).

Also fixed: new-game sky spawn (the attract-mode menu parks the player
at y=220 over its beauty shots; campaign start never reset it).

## Pass 20 status — the feel pass: drift, sentry, and hands

**Drift, retuned for sustained turns**: the boost charge builds MUCH
faster (tier 1 in ~half a second, tier 3 inside ~1.3s held), and the
arc got the opposite treatment — the bare slide runs a gentle sustained
curve (about half the old rate), HOLDING into the slide is what
tightens it (~2.5x), and countersteering opens it all the way out to a
near-straight power slide. No more 90° snaps: the stick shapes the
turn the whole way through.

**The Sentry Rig aims like it means it**: the turret head's barrels and
eye were modeled on the trailing face — lookAt() pointed the empty
side at the target and the muzzle flash floated off the head's centre.
The head is now built forward-facing and every shot leaves from an
actual barrel tip, alternating left/right. Damage became a live thunk
re-read on every shot: the base scales with the player's CURRENT level
(1.11^level, same curve as gear) and skill %s (Bigger Bolts, class
mods) multiply on top — levelling up mid-fight makes the standing
turret hit harder immediately. Iron Hound got the same treatment.

**Reloads you can actually watch**: removable magazines are now NAMED
meshes on the gun, and the reload rig drives the REAL mag — it slides
out of the well, kicks nose-first with daylight between mag and
receiver, drops (physical debris), and the fresh one rises from below
and rocks in heel-first. The whole exchange happens ON SCREEN: the gun
tilts muzzle-DOWN and lifts so the well rolls up into view (the old
pose hid the mag under the frame — the "mag is only partially visible
for a second" bug). Shotguns thumb a physical shell (red hull, brass
head) up the left of the receiver into the loading gate every beat;
snipers do the full mag exchange inside the bolt cycle. Mags are
palette-dark now so they read against any receiver panel. Launchers
keep the heavy tip-back.

Headless suite: `verify21.mjs` — 26 checks, all passing (drift charge
rate/base arc/hold-to-sharpen/countersteer measured live, turret barrel
placement + level-1 vs level-25 damage ratio on one standing turret,
and NDC-projected on-screen asserts for the AR mag exchange and the
shotgun shell, plus swap-mid-reload restore safety).

## Pass 19 status — thrones, cargo, and things in their places

**Bosses hold court**: bosses now spawn dead-center in their arena
district (the marker point is snapped to the district centre at spawn),
and they spawn NON-aggro — no phases, no specials, no patrol wander —
until the player actually walks into aggro range. This kills both
reported bugs at the root: "spawned on the side of the mountain"
(marker sat off-centre on a slope) and "the cave boss spawned 2 rooms
early" (burrower/charger bosses were aggro from birth and migrated
toward the distant player).

**Quieter enemies**: ambient bark timers stretched (15–33s, lower
chance), aggro barks down to 30%, and the "disengagement" line when the
player leaves the leash radius is gone — they just heal and walk home.

**The Wet Manifest is a real fetch quest** (`q22`): five HELIX-9
expedition crates are physical props scattered across the Hullgrave and
Brine Pans — strapped crates with blinking drop beacons, colliders, and
an interact prompt. Picking up the fifth far from Peg fires CARGO
SECURED and flips the compass to "Return to Quartermistress Peg"; the
quest only completes standing at her desk, in person — no holocall
turn-in, and the next job waits as AVAILABLE instead of auto-chaining.
Hauled crates stay gone across map revisits.

**Gates face their direction**: zone-exit gates (arch/cave/thicket/
beach styles) now rotate so the portal plane faces the map centre —
walking toward the exit means walking THROUGH the gate, not past its
side profile next to the mountains.

**Collision/clipping audit**: enemy spawns reject collider-blocked
positions (12-try re-roll), and all ground enemy movement now resolves
against static colliders — no more walking through rocks and buildings.
Two buried POIs found and moved (a chest and a wire spool inside the
Pelican's hull colliders). Automated audits now sweep every map: every
interactable reachable on foot, no NPC clipped into a building box, no
live enemy inside a collider.

Headless suite: `verify20.mjs` — 27 checks, all passing (source-level
bark/leash/gate checks, boss data + spawn-centre + hold-court + wake-up
for three bosses, the full cargo fetch loop end-to-end incl. refusal
and revisit persistence, spawn clearance across three maps, and the
93-interactable reachability sweep).

## Pass 18 status — race weekend

**Controls, settled**: SPACE is the jump, full stop. Holding **E**
drifts — no hop on engage, the slide just leans in (F climbs out now).
The drift itself is deliberately SLOW and controllable: the slide
bleeds toward ~60% of top speed while you shape the arc, and the
RELEASE is the reward — an instant directional burst along the nose
(+6.5/+10/+14 by tier) plus a short turbo to carry it. Control now,
speed after.

**RACE on the main menu**: a third mode next to Campaign and Endless.
Pick a circuit, pick a grid — solo PRACTICE (pure time trial, personal
bests) or a duel against any AI tier (Rookie/Courier/Redline). Boots
straight onto the starting grid, never touches campaign saves.

**THE CANOPY RUN** (`veldt_gp`): a brand-new circuit-only map themed
after Veldt Minor — one big jungle loop with a lagoon beach straight,
two forked sections (shore sweep vs plateau cut with a launch ramp;
south rim vs the gap jump), a central jungle plateau walling the
infield, palms everywhere, a paddock with the full pit-row treatment,
and a Verdant drum camp watching from the inside of turn three. The
race system is track-agnostic now (`TrackDef`: checkpoints, start grid,
AI lines with fork choices, laps) — Redline's Run and the Canopy Run
are both data.

**Three laps, everywhere**: every race is 3 full laps — lap-aware
checkpoints for player AND rival, LAP x/3 on the race HUD, gates
persist across laps, per-track/per-tier records (old gulch bests carry
over). Rita's briefing was updated; she was never going to let one lap
count anyway.

Headless suite: `verify19.mjs` — 13 checks, all passing (menu → grid
boot, E/SPACE/F scheme, slow-slide + burst numbers, three-lap loop
finishing only after lap 3, AI completing a canopy lap, redline
regression).

## Pass 17 status — the sound pass

**Gunshots are layered instruments now**: every shot = transient snap +
midrange body + sub thump + a tiny action-cycling tick, where the WEAPON
TYPE shapes the body (pistol crack, SMG snap, shotgun boom with pellet
spray, sniper crack with a rolling canyon tail and distant slap-back,
launcher tube-whump with rocket hiss) and the MANUFACTURER voices the
character on top (Vulkram chest, Lumen zap edge, Ratworks loose-parts
rattle, Aetheric harmonic bloom, Cordwood black-powder + smoke hiss,
Briskco springy pop). Enemies are finally AUDIBLE: their fire plays a
distance-attenuated report (hollow TOONK for lobbers), rate-limited so a
firing line doesn't turn to mud.

**Hits/kills**: flesh thock under the confirm tick, crits ring a bright
ping over it, kills land a body-drop whump + a little soul-leaves-body
chime.

**Characteristic reloads**: the weapon type choreographs the hands, with
staged foley keyed to the animation phases — mag-fed guns EJECT (roll to
the side, mag physically drops), SEAT (fresh mag up, palm slap), RACK
(charging handle back-forward); shotguns cradle and thumb shells in one
at a time (each with its own press-click) then PUMP; snipers lift the
bolt, draw, feed, and drive it home. Launchers keep the simple tip-back,
as specified. Aetheric keeps its phial-recharge identity, Briskco still
throws the whole gun, Ratworks rattles through everything, Vulkram seats
HARD at the end.

**Player characters have voices**: Harlan (dry workshop baritone), Sable
(cool charged alto), Kez (quick bright), and Tovah (gravel avalanche)
speak short class-written lines on kills, multikills, crits, skill
casts, big hurts, downs, second winds, level-ups, and legendary drops
(~26 lines each, all original) — rationed by per-trigger chances,
cooldowns, and a global gap so it reads as personality, not noise, and
never talks over story dialogue. Wire logs are READ by a ruined voice
now instead of radio garble (the garble stays as the voices-off
fallback).

**The voice engine got a mouth**: syllables now use the word's REAL
vowels for formant selection and the REAL leading consonant for onset
transients (sibilant hiss, plosive pop, nasal hum), plus a fixed third
"presence" formant — words carry their own shape instead of dissolving
into beeps.

**Element procs read like events**: fresh statuses bang a per-element
earcon (fire FWOOSH-crackle, acid hiss-bubble, arc-weld zap-buzz, rime
crystal ring), pop an element-colored burst at chest height, and float a
big IGNITED!/MELTING!/SHOCKED!/CHILLED! label; the DoT flames now ride
the torso at ~2x the density instead of dribbling at the boots.
Refreshing a status stays quiet so sustained elemental fire doesn't
scream. (Statuses always worked — now you can tell.)

**Music grew arrangement**: bar-aware harmony (i–VI–III–VII loop), a
breathing detuned-saw pad under combat, a wiry pentatonic lead riff that
phrases every other bar, drum fills on the turnaround, and boss risers
sweeping into each phrase.

Headless suite: `verify18.mjs` — 15 checks, all passing.

## Pass 16 status — second QoL sweep

**Shipbreak, actually moved this time**: the wreck field now sits in the
circuit's north INFIELD pocket (30,90) — 90+ units from every map edge,
40+ from every road, well clear of the rim mesas. Wrecks, chest, log,
sign, q14 marker, and the salvage billboard all moved with it.

**The buggy climbs like a vehicle**: grounded pitch/roll now samples the
actual axle heights, so uphill reads as CLIMBING — nose up, tires on the
slope — and the body seats on the axle midpoint over crests. Fixed the
real bug behind "floats up hills flat": the pass-13 crest launch fired on
mid-slope grid noise (peak-held ground-rise stayed hot the whole climb);
launches now require the ground AHEAD to actually fall. A 150-frame mesa
climb is now 150/150 grounded frames with the nose pitched 0.6 rad up.

**Drift moved to C, kart pacing**: SPACE is a clean jump; holding C
drifts (with its own little hop on press). The slide arcs gentler
(yaw command 0.52+0.34·trim, was 0.72+0.5), charges slower (tier 1 at
~1.2s of slide, tiers at 0.8/1.7/2.8s of charge) — gradual and shapeable
like the kart games it's stealing from. All control hints updated.

**Quest context lives on the quest screen now**: the contract ledger (J)
expands the active and next-available contract with FROM (giver + where)
/ WHERE (map) / REWARD, plus the giver's full briefing — where you're
going, what you're doing, and why, readable any time. The dialogue panel
shows the WHOLE briefing instantly (the voice still performs it line by
line, highlighting as it goes) instead of racing a typewriter to the
accept button.

**Crucible knows the new factions**: the Drowned and the Undergrown
join the wave pool (the window widens with wave count, so they appear
from ~wave 11), and the boss cycle now runs all SEVEN bosses including
the Bloom Mother, Admiral Anchorhead, and the Mother Lode.

**Gear legendaries exist**: legendary-rarity shields, grenade mods,
class mods, and relics now roll named, red-texted uniques — The
Admiral's Other Lantern, Barnacle Opinion, Gloomgrove Umbrella, Depth
Charge, Seam Song, Peg's Chowder, Quartermistress's Ledger, Night Shift
Charter, Crown Shard, Peg's Dry Boot — with fixed specials/deliveries
and boosted stats, flavored from the new territories.

Headless suite: `verify17.mjs` — 21 checks, all passing.

## Pass 15 status — quality of life sweep

**Arrivals face the place**: walking a zone exit, fast-travelling, or
landing the ship now turns you toward the nearest landmark (people
first, then vendors/pads, then stations and signage) instead of leaving
you staring back the way you came (`faceArrival()` in main.ts).

**Fast travel is walk-first**: a Re-Constructor answers only after
you've stood at it once. Story beats no longer auto-bind stations —
they just report the node ("visit it on foot to bind it"). The network
panel keeps unvisited nodes visibly locked.

**Quest markers show the walking route**: when the objective lives on
another map, the compass/map diamond points at the first hop of the
actual walking route — the right zone exit, or the ship pad for
off-world jobs — via BFS over the map graph (exits + ship pads), not at
the nearest teleporter.

**Bullets respect collision now**: `raycastStatics` slab-tests every
collider box in addition to the visual meshes, so whatever blocks your
feet blocks hitscan, enemy sightlines, and the AI's cover logic —
consistently. Colliders gained real vertical extents: buildings carry
their full height, crates stay crate-height (arcs and shots clear low
props, projectiles no longer clip invisible ceilings above them).
Brasshaven houses snap to quarter-turn rotations with footprint-true
colliders (they used to rotate freely inside a fixed axis-aligned box —
corners poked out, air blocked).

**In-person quests are in person**: accepting at the giver's desk no
longer plays a holocall bust — the giver says the send-off to your
face (voiced, toast-captioned). Holocalls remain for what they're for:
remote updates on a chain you're already out working.

**Dialog clarity**: the Mayor now plainly asks you to help ONE citizen
(purple marks, in the city) instead of gesturing at "reputation"; the
q14 objective reads "Drive plates for the scrapship's hull".

**Alignment fixes**: signposts hold their boards by the ENDS (the old
center post sat exactly over the text); the Gutterlight station can't
be buried by junk piles anymore (junk keeps 5m clear of every POI);
fast-travel pillars are solid.

Headless suite: `verify16.mjs` — 13 checks, all passing.

## Pass 14 status — the lagoon and the cave

Veldt Minor's two sealed exits are OPEN. Both zones are fully dressed:
new factions, new bosses, new arcs, new uniques.

**SHIPWRECK SHALLOWS** (`veldt_shallows`, open coastal map): a turquoise
lagoon hangs off the east edge — sea-sized water you WADE into, with the
Anchorage boss arena standing ankle-deep in it. The hauler PELICAN lies
broken in two across the Hullgrave, barnacled, one porthole still lit,
her anchor chain paying out link-by-link toward the water. Districts:
Driftwood Rest (Quartermistress Peg's castaway camp — shack, signal
fire, fish racks, a rowboat with a furniture career), the Hullgrave, the
Brine Pans (tide pools, salt crusts, drowned tide-totems), the
Anchorage (hull-rib arena + anchor monument + lantern buoys). Shoreline
scatter: shells, starfish, kelp, driftwood, decorative crabs; gulls
circle the wreck fields. THE DROWNED (faction `brine`): the crew never
stopped working — brine husks, harpooneers, tidecallers, snapjaws,
gullwings, anchor hulks.

**THE HOLLOWDEEP** (`veldt_caves`, corridor map like the Tangle): a
bioluminescent cave — near-black sky, glowworm aurora veins overhead,
drifting spore motes (new ambient particle), glowing crack veins in the
rock, and a new biome flora: giant glow-mushrooms + stalagmites (70
grown along the corridor). Districts: the Mouth (mine head-frame, rail
stub, lanterns), the Gloomgrove (elder mushrooms, spore-light), the
Cryptworks (timber braces, rail + ore carts, cold-fire camp, ore-heap
cover), the Lode Court (giant crystal ring + the dead company drill).
THE UNDERGROWN (faction `hollow`): the dig crew that never clocked out —
gloomstalkers, shardcasters, spitgrubs, gravemites, lantern wisps, deep
rollers.

**Bosses** (game/boss.ts): ADMIRAL ANCHORHEAD — the PELICAN's captain,
promoted by the sea: keelhaul anchor-charge, fanned harpoon volleys,
rime anchor-slams, boarding-party summons; his still-lit ship lantern is
the crit. THE MOTHER LODE — the thing on level nine: burrows UNDER the
floor and erupts beneath you, volt shard volleys, quake novas, gravemite
tribute; the resonant crystal crown is the crit. Both have dedicated
legendaries (Broadside pistol / Pay Dirt launcher), first-kill
guaranteed, excluded from the world pool.

**Quests q20–q26**: the lagoon arc (Juno's lost resupply → meet Peg →
retire the drowned crew → recover the manifest crates → strike the
Admiral) and the cave arc (the hum below → break the night shift → close
out the Mother Lode). Chain rules exercise the pass-13 holocall
geography on purpose: q21→q22→q23 and q24→q25→q26 auto-chain by
holocall; giver/map changes are desk visits. Two new side jobs with
quest-only uniques: Mirelle's "What the Sea Owes Me" (The Undertow) and
Okto's "An Ossuary Complaint" (Lodestone). Old saves that finished q19
unlock the new frontier on load.

**New NPC**: Quartermistress Peg — world rig (hair-bun look), gravelly
saw-wave voice profile, holocall bust, intro cinematic, greetings.

Headless suite: `verify15.mjs` — 21 checks, all passing (travel,
corridor walls, flora counts, faction waves, both bosses + dedicated
drops, world-pool exclusion, the full q19→q26 chain including holocall
vs desk-visit boundaries, boss re-arm on map entry, side jobs, the
save-frontier fixup).

## Pass 13 status — the gulch playtest fixes

Direct response to gulch playtest feedback, plus a full Mario-Kart-style
rework of the buggy's handling.

**Rita unboxed** (`game/world.ts`): the Gulch Gate garage used one huge
AABB collider that fenced Rita in — replaced with wall-hugging colliders
(back wall, one side wall, workbench) transformed through the garage's
rotation, so the open bay is genuinely walkable. Rita stepped out front
(`npc_rita` moved), her interact range grew to 5m, and the garage got a
toolbox, a hanging work lamp, and a questionable pinup ("11:40 FLAT").

**Holocall chaining is location-aware** (`game/quests.ts`): remote
turn-in + auto-accept now happens ONLY when the next quest has the same
giver AND lives on the same map — the "you're already out here" arcs
(reach the Throat → cull twelve → rake out the Saint). Anything that
moves the story to a new map completes over holocall but waits at the
giver's desk ("Come see me in Gutterlight — the next one's bigger"), and
new-giver handoffs still point you at the meet.

**Vehicle 2.0** (`game/vehicle.ts`): the Junkstallion drives like a kart
now. SPACE is a real jump (hop off the ground anytime, grounded) and the
drift trigger: hop + hold + steer locks a slide direction, sparks tick
through tiers (blue → orange → violet), and RELEASING pays a mini-turbo
that ignores the boost meter and raises the speed cap. Steering has
inertia (eased input, body roll follows), engine-braking is off-throttle
only, drifts redirect momentum instead of burning it (kart rules — a held
slide stays fast). Hills genuinely throw you: crests inherit the slope's
vertical momentum with peak-hold (so smooth bump tops still launch),
gravity relaxes to 0.72× while rising, and airtime is steerable (yaw +
throttle nudge). Boost finally LOOKS like boost — flame cones + cyan
cores flicker at the exhausts, drift sparks color by tier, hop/landing
squash-and-stretch. Fixed two real physics bugs along the way: the ground
snap tolerance was eating the hop on frame one (now only applies while
descending), and the crest launch read the ground's rise at the exact top
of the bump, where the slope is zero (now peak-held with decay).

**Shipbreak Fields moved off the wall** (`data/world.ts`): the wreck
district sat against the map-edge clamp and a mesa — pulled inward to
(112,156) r36, all four quest wrecks + chest/log/sign repositioned, q14
marker updated. Verified: every wreck reachable, no mesa burial, ~32m
clear of the racing line.

**Gulch livelihood** (`game/world.ts` buildGulchTrackDecor): four lit
billboards ("EAT MY DUST — R. (ret.)", "BOOST RESPONSIBLY", "SHIPBREAK
SALVAGE CO.", "LAST DRINK BEFORE THE JUMP"), pennant bunting strung over
two gates (pole colliders only — the line itself is flyover), a swaying
windsock, a scrapped kart husk ("4 SALE RAN WNCE"), and pit-row oil
stains. Verified track-safe: the race AI still clears all seven gates.

Headless suite: `verify14.mjs` — 26 checks, all passing (Rita approach
from 8 angles + panel open, wreck placement, hop/drift/turbo/launch/FX
physics, AI lap regression, chain rules q10→q11 vs q11→q12 vs q13→q14).

## Pass 12 status — enemies got smart, loot got personal

**AI overhaul** (`game/enemies.ts`): ranged humanoids run a tactical brain.
They hold a fighting band and STRAFE while shooting instead of statue-
standing; ranged attacks are gated behind a real line-of-sight raycast (no
more firing through walls); hurt gunners break for cover — real prop-based
hide spots computed on the far side of colliders from the threat — crouch
to catch their breath, then PEEK out in bursts to fire, duck back, and
re-engage after a few cycles (flanking them works: cover only counts if
it's between you and them). Grenadier archetypes (Shieldhead, Snowmad,
Ashwalker, Lattice Warden) cook and lob real arcing frags — especially
when YOU hide. Rushers serpentine instead of beelining; lobbers still arc
over cover, because that's their whole job.

**Encounters, not faucets**: districts no longer trickle-respawn behind
your back. Each hostile POI stages a Borderlands-style fight — a full wave
on arrival, then one or two REINFORCEMENT waves as you thin them (the
final wave brings a guaranteed badass) — and once cleared it STAYS cleared
until you genuinely leave (out of range ~25s, or a map change) and come
back. And nobody chases you to the ends of the earth: enemies leash at
their district's edge, shrug, heal to full, and walk home.

**Dedicated drops**: every boss owns a signature legendary — His
Trashjesty (Gutterball), Site Policy (Warden Prime), The Avalanche (Old
Man Avalanche), The Litany (Saint Furnace), Pruning Song (Bloom Mother).
First kill guarantees the signature; repeat kills roll elevated odds
(38%), with a strong epic as the consolation ceremony. Signatures never
roll from the world pool — world legendaries still happen, rarely, as
before. The Crucible's boss waves use the same dedicated system, so the
pit is a legitimate farm.

**Save slots**: three campaign slots with a slot-picker ledger in the menu
(per-slot continue/new/veteran, summary line, two-click delete), the old
single save migrates into slot 1, and every slot can EXPORT to a portable
save string / IMPORT one back. Endless still never touches saves.

**NPCs are alive now**: every named giver breathes (idle bob + sway),
head-tracks you when you're close, and fidgets — Quibb taps the clipboard,
Rita checks the stopwatch, Zaza's orb floats on its own. Town NPCs grew
arms, belts, and boots in the process.

**ADS finished**: reticles are per-weapon — arms tighten to a dot for
pistols/SMGs/ARs, shotguns and launchers get a spread ring, and true
scopes (zoom ≥ 2.5) go full tube: vignette mask, mil dots, holstered
viewmodel, and mouse sensitivity scaled to the magnification.

## Pass 10 status — wheels, voices, and no more walking back

**THE RUST GULCH** — the fourth Claudelands-edge zone (east, past the
Slagflats; the last unclaimed map edge): a huge open canyon (size 400,
biggest map yet) where the old haulers came down. Two wreck fields — THE
SHIPBREAK on the north-east rim and THE SUMP in the racing infield — carry
scavvers, chests, and salvageable hull wrecks. **q14 (The Signal) moved
here**: the Mayor's five scrapship plates are now pried off the wrecks by
hand instead of farmed from Helix drops.

**A real vehicle engine** (`game/vehicle.ts`): the JUNKSTALLION dune buggy
— weighted arcade physics with forward/lateral grip separation (steer
first, so swinging the nose creates true slip that grip then damps),
speed-scaled steering authority, handbrake drifts that FEED the boost
meter, boost with flames and FOV pull, ballistic launches off crests
(terrain `bumps` are analytic jump ramps applied after road flattening),
AABB collision bounce with clank + trauma, ram damage, suspension/lean
visuals, a procedural engine loop (saw+sub through a throttle-opened
lowpass), and a damped chase camera.

**REDLINE'S RUN** — a replayable race side-activity from REDLINE RITA
(retired courier, one rule: the buggy stays in the gulch). One lap, seven
gates, two forked sections (safe outer sweeps vs jump-heavy inner cuts),
rendered as pylon-and-halo gates with sky beams. The rival is a second
Vehicle on the same physics driven by a waypoint AI with
difficulty-scaled speed/skill/boost use and gentle rubber-banding. Three
tiers (ROOKIE RUN / COURIER CLASS / REDLINE) pay cash + XP every run,
drop epic/legendary gear on first wins, and persist best times. Enemies
are suppressed for the duration.

**The Crucible moved downtown**: a pit door inside Brasshaven runs the
full endless-wave arena with your campaign character — same waves,
purses, shops — and dying spits you back onto the street outside via the
house Re-Constructor (saves taken inside resume outside). A walk-out door
works between waves. Menu Endless mode is unchanged.

**BL2-style death**: bleeding out no longer teleports you — the screen
whites out (“SIGNAL LOST”), the camera holds on the Re-Constructor while
a digistruct column prints a flickering hologram of you (rising rings,
scanline flicker, sparks), then swoops into the new you's eyes as control
returns. Works everywhere, including the pit's death-exit.

## Pass 11 status — everybody talks

**Character voices, zero assets**: `audio/voice.ts` — not TTS (the Web
Speech API is exactly the robotic monotone nobody wants, and neural TTS
means megabytes or a cloud bill), but expressive procedural speech in the
Animal Crossing tradition, tuned for personality: each syllable is an
oscillator through two vowel-formant filters, and the character comes
from prosody — statements fall, questions rise, exclamations hit high and
loud, CAPS words spike, commas breathe, word-initial stress, per-syllable
jitter, per-character pitch/timbre/rate/vibrato/drawl (Quibb grumbles at
92 Hz, Juno motor-mouths at 255 Hz, Okto chants on quantized steps).
Questgivers perform their dialogue-panel lines and holocalls; a settings
toggle (“Character Voices”) turns it all off.

**BIG NAZDA, the Crucible announcer**: an echo-slathered ring-announcer
voice with wave-start/clear/boss lines, down/second-wind commentary, and
kill-streak callouts — live in both the pit and menu Endless. Enemies
still don't talk; the HOUSE does.

**Holocalls + auto-progressing chains**: quests that complete remotely
now TURN IN remotely, BL2 style — a flickering hologram bust of the giver
slides in by the tracker, speaks the completion line in their voice, and
when the next contract is from the same giver it AUTO-ACCEPTS and briefs
you over the same call (no more cross-map walk-backs mid-chain). When the
next giver is a new face, the old giver signs off remotely and the
tracker points you at the introduction — first-meeting cinematics stay
intact. The long-orphaned `acceptLine`s finally play, side jobs call in
their completions, and mid-call map switches just drop the signal.

## Pass 9 status — THE TANGLE, running water, and three overdue fixes

**THE TANGLE — the first corridor map**: behind the Veldt's thicket (now
unsealed) lies the deep jungle: a serpentine, ridge-walled gauntlet under a
green canopy sky, mostly linear but widening into four arenas — THE TANGLE
MOUTH (safe entry), DRUM HOLLOW (a Verdant war-camp), THE ROOTWORKS, and
THE BLOOM COURT at the end of the line. Corridor terrain is a new terrain
mode (`terrain.corridor`: path points + width + arenas + wall height) the
next linear map gets for free. Two new Verdant archetypes stalk it —
armored VINE STRANGLERS that sprint, and THORN HURLERS lobbing arcing bile
pods — and the questline extends there: q17 "Follow the Drums", q18 "The
Names of Plants" (collect expedition tags), and q19 "Deadhead the Garden",
which ends at **BLOOM MOTHER**, a petal-crowned garden god with a glowing
seed-heart crit zone, sporeling summons, SEED RAIN, and a SPORE NOVA.

**Water that moves**: a `water()` builder (toon pool disc, drifting glint
layer, reed-and-lily dressing) and a `waterfall()` builder (mossy cliff
shelf, scrolling fall sheet, splash pool, foam ring, mist) — the Mangrove
lagoon now reads as water, a fall feeds it by the boardwalk, and ponds sit
in Idol Hollow and the Overgrowth.

**Planet-aware flight**: the scrapship's space phase now renders the actual
origin planet shrinking behind and the actual destination swelling ahead
(`PLANET_LOOKS` per planet: body color + atmosphere shells), so the
Brasshaven→Veldt hop shows rust-and-smog falling away and jungle-and-sea
ahead — and the return trip shows the reverse.

**Dialogue is giver-aware** (bugfix): while carrying a quest, every OTHER
NPC used to parrot the quest-giver's nag line verbatim. Now only the
quest's own giver nags; everyone else points you at whoever actually holds
your work ("Not my department — the Mayor is holding work for you"), offers
their own queued job, or makes small talk when the ledger is clean.

**Difficulty dampened** (bugfix): district `levelOffset` is relative to
player level, and the late maps stacked it too high — the Cinder Throat ran
+7..+10 and Veldt +11..+12 over the player. Both are pulled down to +3..+5
(Tangle runs +5..+7 as the current endgame).

## Pass 8 status — VELDT MINOR: a second planet, and the ship that gets you there

**THE PAPERWEIGHT flies.** Boarding the scrapship (unlocked once q14's
salvage is done, pads in Brasshaven and at Mangrove Landing) plays a full
Going Commando-style travel cinematic in three phases: LAUNCH — the ship
shakes, flares, and roars off the pad in the live world; SPACE — a starfield
rig with the home planet falling away behind and the destination swelling
ahead, cut across three camera angles (side flyby, chase cam, nose-on); and
LANDING — the map has already switched, and the ship drops onto the
destination pad in the new world, flaring dust as she settles. Skippable
after a grace window; the arrival replaces the biome-entry cine.

**VELDT MINOR — the Mangrove Shelf**: the opposite of the Claudelands in
every register — bright tropical sky, lush green terrain with mossy mesas,
palms and flowering ferns everywhere (district groves plus a map-wide wild
scatter), a lagoon, and sandy paths. Same hub anatomy as planet one: a safe
landing town (MANGROVE LANDING — stilt huts, boardwalk, string lights,
vendors, the landing pad, and Dr. Juno Calla, the distress signal's sender)
surrounded by hostile POIs: THE CHATTERFRONDS (tribal camp: totems, bone
arch, drums, thatch huts), IDOL HOLLOW (a mossy stone god with glowing eyes
and its offering ring), and THE OVERGROWTH wilds.

**THE VERDANT** — crazed tribals and shamans, six archetypes on the shared
enemy chassis: Frond Stalkers, blowdart-spitting Dart Lurkers, bile-lobbing
Grove Shamans, armored Totem Haulers (back weak point), giggling Sporeling
bombs, and Razorbeak flyers. Quests: q15 "Wheels Up" (board the ship, meet
Juno) and q16 "The Loudest Garden" (thin the war parties).

**Room to grow, dressed not gated**: three stylized entries for the next
three maps — a boulder-jawed CAVE MOUTH (the Hollowdeep), a DENSE THICKET
with a vine lintel (the Tangle), and a shell-lined SANDY PATH (Shipwreck
Shallows). Each is built in the world now and politely sealed with flavor
until its map ships.

## Pass 7 status — the front end, the Crucible, and the boss that lives

**Saint Furnace fixed** (and every boss with him): boss spawns were one-shot
bookkeeping, so leaving a boss map mid-quest (now trivially easy with zone
edges) wiped the boss forever. `ensureBosses()` re-arms the arena on every
entry to the boss's map while its quest is active.

**Cinematic title screen**: the controls overlay is gone; behind the menu
the camera now tours the live world — slow orbits over Gutterlight, the
Gully fort, the Boneyard, the crash site, and Trash Mountain, with enemies
wandering their districts (the invisible "player" is parked sky-high so
spawners run but nothing aggros, and the population is pre-warmed).

**A real main menu**: PRESS ANY KEY → CAMPAIGN (Continue / New Contract /
Veteran Start) · ENDLESS MODE · SETTINGS. Settings is a persisted panel of
graphics/feel options: ink outlines, cross-hatching, bloom, FXAA, film
grain, vignette, color saturation, screen shake, damage numbers, and FOV —
all applied live and stored in localStorage. Character select got the full
treatment: playstyle summary, action-skill detail with cooldown, and a
three-tree preview with capstones for each Vault-Rat.

**ENDLESS MODE — THE CRUCIBLE**: a purpose-built fighting-pit arena map
(scrap bleachers, floodlights, pit vendors, scorched center ring). Waves
scale in level and spawn tempo with rising badass odds; every 5th wave is a
boss from the campaign roster (cycling all four) with its guaranteed
legendary; 12s intermissions heal you up, pay a purse, and leave time to
shop. Best wave persists; endless runs NEVER touch the campaign autosave.

**Veteran Start (skip the tutorial)**: begin in Brasshaven at level 10 with
9 skill points, $2500, and a random common-through-epic loadout — the city
open, all four Re-Constructor nodes known, side jobs unlocked, and the
Mayor waiting. The starter chain (q1–q11) stays fully playable in parallel;
the quest system now supports multiple available mainline quests and the
tracker points at the chain frontier.

## Pass 6 status — side jobs, the Mayor, zone edges, four Vault-Rats

**All four classes playable.** THE HOUNDMASTER (Kez Okafor) summons RIVET,
a bounding scrap-hound that runs enemies down and mauls on a cadence —
augments for igniting bites, health-leech "fetch", and a two-hound capstone,
across Pack Instinct / Run With It / Junkyard Rules. THE RAVAGER (Tovah
Grimm) pops RED MIST: 40% incoming damage shed and rolling ground-slam
shockwaves, with a long-reach slam augment, slam lifesteal, kill-extension,
and a damage-reflection capstone across Slaughterhouse / Adrenaline / Scar
Tissue. Both use the shared kill-skill/augment/stat machinery — no bespoke
engine paths.

**Brasshaven side jobs**: three named citizens (Brother Okto, Mirelle
Two-Lines, Brann the Adjuster — each with a first-meeting cinematic) send you
BACK to old landmarks: the Boneyard ribcage, the Frozen Fathom shore, the
HX-77 crash site. Each spawns a tagged elite pack (badass-tier, +3/+4
levels) and pays out a quest-only unique legendary (Ossuary / Lake Effect /
The Adjuster — never in the world drop pool).

**The main line continues**: q13 "Local Notoriety" — the Mayor of Brasshaven
(Ottoline Brass) won't talk business until you've finished at least one side
job for her citizens. Then q14 "The Signal": a distress call from VELDT
MINOR, and a scrapship (THE PAPERWEIGHT) that needs five Helix hull plates
salvaged from the Slagflats. Next pass: the first zone of the next planet.

**Zone edges, BL2-style**: physical exit arches at map edges with a
full-screen "NOW ENTERING" zone card — Claudelands touches the Frosthollow
(north), the Cinder Throat (southeast), and Brasshaven (west road), each with
a return arch; prop scatter keeps the approaches clear. Cutscene QoL: a 1.1s
no-skip grace window (the skip hint appears only after it) and boss health
bars stay hidden until the pre-fight cinematic has played. Quest tracker,
markers, and toasts now name the correct giver (the "return to Quibb" after
Zaza's quests bug). Drop rates and rarity weights lowered across the board
(gun drop chance, per-tier weights, tier luck).

## Pass 5.1 status — instruments that tell the truth, maps that look like maps

**Compass & minimap chirality fixed**: both instruments used a mirrored
screen-relative angle, so a target on your right showed on the left and the
radar rotated *with* your turn instead of against it. The screen-relative
angle is now `facing − bearing` everywhere: compass markers slide to the
correct edge (with a chevron) when off-view and center exactly when you face
them; the minimap rotates like a real radar and its N tick matches.

**Full map is a real chart**: shared painted-terrain module (contour lines
every 2.5m, hillshade, shorelined water, readable dirt-track roads) under
structure line-art stamped from the world's actual collision footprints —
buildings, forts, wrecks, kilns, the Brasshaven hull, tree scatter as dots —
plus labeled discovered stations, POI icons, faction district rings, and a
correctly rotating player arrow. Map orientation now matches the first-person
camera (N up, same chirality as the minimap), and the minimap draws the same
painted terrain rotated to view. One quest line whose "north" contradicted the
compass was corrected.

**Signs actually read**: `posterTexture` now takes the target plane's aspect
ratio (canvas sized to match — no more squashed 5.6:1 banners drawn on a
0.8:1 texture), measures each line and fits it to the sign's text area, and
centers the block with proper baselines per style. Every two-`side`d text
plane (town banner, station boards, Duke flags, city ads, gate sign) is now a
front+back pair so text never renders mirrored.

**Menus behave like an ECHO device**: BACKPACK / SKILLS / MAP / LOG tab strip
on every device panel — click a tab or flip with Q/E; the world FREEZES
completely while any menu is open (enemies, projectiles, damage all hold);
and the HUD now fades out for the intro cutscene exactly like in-game
cinematics.

## Pass 5 status — cinematics, ECHO UI, painted maps, crits, Brasshaven

**In-game cinematic system** (`ui/cinematics.ts`): triggered, gameplay-pausing,
any-key-skippable letterboxed scenes with timed title cards, HUD faded out
while they run. Three kinds, each plays once (seen-set persisted in the save):
*biome entry* (high sweep down to the player on first arrival at a map, name +
tagline card), *character introduction* (dolly toward Quibb/Zaza on first E,
then the dialogue opens), and *boss pre-fight* (slow orbit + epithet card when
you first close with a living boss — the arena is frozen until it ends).

**ECHO-NET menu reskin**: every panel (backpack, skill trees, quest log,
vendors, dialogue, fast travel, map, pause) is now a dark-teal glass terminal —
"ECHO-NET // FIELD TERMINAL" header strip, animated scanlines + flicker, cyan
borders and teal-tinted rows/buttons/tabs — while the in-world HUD keeps its
amber BL look.

**Painted full map**: the M map now renders a real top-down colored terrain
composite per biome (height-shaded palette bands, rock above the treeline,
lake tint, darkened roads, west-east hillshade, vignette), cached per map,
under labeled district rings colored by controlling faction.

**Criticals actually work**: crit zones are assigned explicitly per archetype
(heads for humanoids, the eye for flyers, the fuse housing for bombers — now
protruding above the body sphere so it's physically hittable) instead of
falling back to "last body part pushed" (guns/armor plates were stealing the
slot). Armored brutes get a logical weak point: a glowing boiler valve on the
BACK — flank them. Verified through the real hitscan path headlessly.

**BRASSHAVEN**, the sanctuary city: fourth map, built in the hull of a beached
mega-hauler — lit name sign, multi-floor buildings with glowing windows and
neon ads, market stalls, string lights, seven ambling citizens, both vendors,
no combat. Unlocked by q12 "Key to the City" after the Cinder Throat boss
falls (the quest auto-discovers the Brasshaven Gate Re-Constructor node), then
fast-travelable from anywhere at any time outside combat.

## Pass 4 status — the Cinder Throat, maps & radar, UI polish

**Third main area, THE CINDER THROAT**: a large linear gauntlet (320m map) —
a serpentine walkable corridor carved between impassable ridge walls (slope
blocking on player and AI), opening into arena nodes: Throat Gate → Cinder
Camp → Ash Flats → Kiln Yard → the Foundry Court, culminating in SAINT
FURNACE (meteor rain, ember novas, offering summons, glowing firebox crit
zone). Volcanic biome via the same texture system: basalt ground with
glowing ember cracks, lava pools, brick kilns, burnt snag trees, ash fall,
the Kindled cult (3 new archetypes + reused bombers), quests q9–q11.

**Navigation**: circular minimap radar (enemy/boss/loot-rarity/station/quest
blips, rotating with view) + full map on M (districts, roads/corridor,
stations, boss, quest, player arrow). Compass markers now smooth-clamp with
edge chevrons and layered icons.

**Fixes/polish**: terrain queries are grid-matched to the rendered mesh
(bilinear over the same vertex grid) so props/characters no longer float or
clip — the throne and boneyard placements sit true; scatter (rocks/tufts)
respects keep-out margins around structures, POIs, and roads; BL-style HUD
reskin (skewed plates, segmented bars, amber trim, bigger ammo numerals).

## Pass 3 status — two worlds, two heroes

**The Frosthollow**: a second full map (frozen highland biome — snow terrain,
snow-capped pines and mesas, aurora ribbons, snowfall, a frozen lake with
something vast under the ice) reached by BL2-style cross-map Re-Constructor
travel, unlocked through the story. Districts: Chatterjaw Landing (Zaza's
caravan — she's the second quest giver, in person), the Pinebreak, the Frozen
Fathom, and the Icebox. Three new quests (q6–q8), five Frostborn archetypes,
and a third phased boss (OLD MAN AVALANCHE: charge, freezing rime novas, pack
summons, enrage). Same procedural texture system, parameterized per biome.

**Second playable class**: Sable Anders, the Stormcaller — Tempest Shell
action skill (shots become chaining Volt, periodic arcs off the player) with
three full trees (Static / Squall / Groundwire), augments (Forked Sky, Squall
Line, Thunderclap) and capstones (Live Wire free-ammo shell, Eye of the Storm
kill-extension, Lightning Rod thorns). Class select + difficulty select on new
game; class persists in the save.

**Intro cutscene**: skippable letterboxed camera sweep with title cards and
the character freeze-frame splash.

**Balance**: difficulty tiers (Tourist / Contractor / Badass — enemy hp/damage,
loot luck, xp), leaner trash gun drops, boss drops floored at rare, stronger
luck scaling, player hp growth up, district repopulation that refills fast
when empty and trickles when full. Two new legendaries (The Avalanche, Small
Talk).

Living document. What shipped per pass, what's stubbed or shallow, and the
concrete next moves. "Seam" = the extension point already exists in code/data;
the work is content or depth, not refactoring.

## Pass 2 status — the open wasteland

The world is now a 260m multi-district overworld on analytic heightfield
terrain: **Gutterlight** (hub town: Quibb, vendors, fast travel, string
lights), **Gully Seven** (Rustborn fort), **the Boneyard** (leviathan skeleton,
graves, cacti), **the Slagflats** (Helix crash site, slag pools, crater), and
**Trash Mountain** (gated boss court). A five-quest main line (goto → cull →
salvage → Gutterball → HX-1 Warden Prime) with dialogue, tracker, log, compass
markers, gate unlock, and reward drops. Districts self-repopulate with
patrolling enemies from two factions (8 archetypes + badasses + 2 phased
bosses). New: dynamic music, save/continue, pause menu, fast-travel network,
vendor selling, compass, target nameplates, boss bars, damage-direction arc,
manufacturer reload animations with mag drops, shell casings, bullet-hole /
scorch / bile decals, elemental death variants (rime freeze-shatter, ember ash,
volt arcs, bile puddles), explosive barrels, grenade fuse blink/beep + wall
bounces, footsteps/landing, weapon sway, tumbleweeds, scrap rats, vultures,
FXAA, sun disc, player-following shadows. Deploys to Vercel as a static site.

## Pass 1 recap

Rendering identity (toon + ink + hatch + bloom + grade), part-based weapon
generation (6 manufacturers × 6 types × 7 slots), rarities + legendaries with
red text, shields/grenades/class mods/relics, 5-element damage matrix, Gunsmith
class (Sentry Rig + three 6-tier trees), Grit Rank meta, FFYL, vendors, chests,
wire spools, art sandbox, headless screenshot harness.

## Stubbed / shallow (explicit debts)

| Area | State | Next move |
| --- | --- | --- |
| Other 3 classes | Data stubs (`playable: false`) | Implement Stormcaller (shock transform) first; class select on title. Seam: skills are data, action-skill code isolated. |
| Side quests | Main line only | Add `sideQuests` rows + multiple active quests + per-quest tracker slots. Seam: quest defs are declarative rows. |
| Opaline tier | Rarity row exists, never drops | Named opaline uniques with build-around effects. |
| Legendary pool | 6 signatures | Grow per manufacturer×type; boss-dedicated drops (bosses currently drop a random legendary). |
| Nav/AI | Straight-line steering | Flow-field around colliders; gunner cover use; drone kiting. |
| Enemy LOS | Fires through thin props at range | Cheap LOS raycast vs `staticTargets` before ranged attacks. |
| Second zone | One overworld | The seam is proven (world-as-data); a second map = new `data/world2.ts` + a loader + Re-Constructor network across maps. |
| True save slots | Single autosave slot | Slot UI + export/import string. |
| ADS sights | FOV zoom + centering | True sight alignment per gun; scope overlay for Longeye. |
| Audio | All synth | Keep synth as fallback; optional sample layers. Mix bus exists. |
| Gun mesh fidelity | Parametric primitives | Authored glTF per part behind the same `PartLook` interface. |
| Multiplayer | Not attempted | Out of scope. |

## Pass 3 priorities (ordered)

1. **Stormcaller playable + class select** — proves multi-class end-to-end.
2. **Side-quest layer** (3-4 originals: rat racing, poster defacement tour,
   Zaza's "mystery box" fetch) + multiple-active-quest tracker.
3. **Enemy LOS + cover AI** — biggest remaining combat-feel gap.
4. **Boss dedicated drops + opaline uniques** — completes the loot chase.
5. **Second map** via the world-as-data seam, with cross-map fast travel.
6. **Perf pass**: merge static district geometry, instanced gibs/casings,
   quality toggle for the ink prepass at high DPR.

## Deploy

- `npm run build` → static `dist/` (game at `/`, art sandbox at `/sandbox.html`).
- Vercel: import the repo, defaults apply via `vercel.json` (framework=vite,
  output=dist). No server, no env vars, no functions.

## Identity checklist (pass-2 self-review)

- [x] Still frames read as the genre in every district — see `docs/screenshots/`
- [x] 6 manufacturers visibly/mechanically distinct; reload styles match maker
- [x] Kill → rarity beam + sting; elemental deaths differ per element
- [x] Item cards reflect parts/stats; compare arrows; vendor buy/sell
- [x] 5 elements with distinct VFX + status; matrix matters by faction
- [x] Comic damage numbers with crit flair; hit-direction + nameplates
- [x] Action skill + trees + Grit spendable; saves persist across sessions
- [x] World feels alive: patrols, critters, vultures, tumbleweeds, music,
      barks, quests, bosses, gates, fast travel
- [x] Deployable to Vercel with zero functionality loss
