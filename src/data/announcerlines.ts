// BIG NAZDA's material — pure data so the VO bake tooling can import it
// without dragging in the audio engine. Placeholders: {n}/{next}/{k} are
// numbers (recordings are baked number-free; the shared voKey normalization
// strips digits so either form finds the clip), {boss} expands to each boss
// display name at bake time.

export const ANNOUNCER_WAVE_START = [
  'WAVE {n}! Release the regrets!',
  'Wave {n}, folks! The floor is lava-ADJACENT!',
  'HERE COMES WAVE {n}! Somebody hide the medics!',
  'Wave {n}! Betting window is CLOSED. Morally it was never open!',
];
export const ANNOUNCER_BOSS_WAVE = [
  'OHHH it’s a BOSS WAVE! {boss} has entered the pit and the insurance has LEFT!',
  'WAVE {n}! Main event! {boss}! The crowd goes appropriately concerned!',
];
export const ANNOUNCER_WAVE_CLEAR = [
  'WAVE {n} CLEARED! The pit is briefly a floor again!',
  'CLEAR! Somebody hose that down before wave {next}!',
  'And that’s wave {n}! Shop fast, bleed slower!',
  'CLEANUP ON WAVE {n}! Purse is paid! The vultures send compliments!',
];
export const ANNOUNCER_PLAYER_DOWN = [
  'DOWN GOES THE CONTRACTOR! Get up, the paperwork isn’t done!',
  'OHHH! Right in the everything! Fight for it, kid!',
];
export const ANNOUNCER_SECOND_WIND = [
  'AND THEY’RE BACK UP! The pit LOVES a comeback!',
  'SECOND WIND! Refunds cancelled!',
];
export const ANNOUNCER_STREAK = [
  '{k} in a row! Someone check the scoreboard for smoke!',
  'A {k}-STREAK! The house is legally impressed!',
];
export const ANNOUNCER_WELCOME = 'LADIES, GENTLEFOLK, AND VULTURES! Fresh meat in the CRUCIBLE!';
