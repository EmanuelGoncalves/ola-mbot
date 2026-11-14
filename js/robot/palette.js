/** Light colours: `hex` for the screen, `rgb` for the real LEDs (kept dim, they are bright). */
export const COLORS = [
  { id: 'red', name: 'vermelho', hex: '#ff5a5f', rgb: [150, 0, 0] },
  { id: 'orange', name: 'laranja', hex: '#ff9f45', rgb: [150, 45, 0] },
  { id: 'yellow', name: 'amarelo', hex: '#ffd23c', rgb: [130, 95, 0] },
  { id: 'green', name: 'verde', hex: '#4cd98a', rgb: [0, 140, 0] },
  { id: 'blue', name: 'azul', hex: '#4c9bff', rgb: [0, 0, 150] },
  { id: 'purple', name: 'roxo', hex: '#a877f2', rgb: [90, 0, 140] },
  { id: 'pink', name: 'cor-de-rosa', hex: '#ff8fc7', rgb: [150, 20, 60] },
  { id: 'white', name: 'branco', hex: '#ffffff', rgb: [100, 100, 100] },
];

export const NOTES = [
  { id: 'do', name: 'Dó', hz: 262 },
  { id: 're', name: 'Ré', hz: 294 },
  { id: 'mi', name: 'Mi', hz: 330 },
  { id: 'fa', name: 'Fá', hz: 349 },
  { id: 'sol', name: 'Sol', hz: 392 },
  { id: 'la', name: 'Lá', hz: 440 },
  { id: 'si', name: 'Si', hz: 494 },
  { id: 'do2', name: 'Dó agudo', hz: 523 },
];

export function colorById(id) {
  return COLORS.find((color) => color.id === id) ?? null;
}

export function noteById(id) {
  return NOTES.find((note) => note.id === id) ?? NOTES[0];
}
