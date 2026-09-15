// 8-bit fixed palette. Theme: solid black backgrounds, bright CRT green.
export const PAL = {
  '.': null,          // transparent
  'k': '#000000',     // black
  'd': '#00230d',     // near-black green
  'm': '#00a82c',     // mid green
  'g': '#00ff41',     // CRT green
  'w': '#e8fff0',     // off-white
  's': '#13324a',     // suit steel
  'c': '#29e0ff',     // cyan
  'b': '#2f6bd6',     // blue
  'r': '#ff3355',     // red
  'y': '#ffd83d',     // yellow
  'o': '#ff8b2f',     // orange
  'p': '#ff4dd2',     // magenta
  'u': '#8b2fd6',     // purple
};

export const GREEN = '#00ff41';
export const MIDGREEN = '#00a82c';
export const DARKGREEN = '#00230d';
export const WHITE = '#e8fff0';

// Keycard colours, in pickup order shown on the HUD.
export const KEY_COLORS = ['r', 'y', 'c'];
export const KEY_NAMES = ['ALPHA', 'BETA', 'GAMMA'];

// Palette-swap cycle for the octopus (theme: "flashing palette swap frames").
export const OCTO_CALM = ['u', 'p'];
export const OCTO_HUNT = ['p', 'r', 'o', 'w'];
