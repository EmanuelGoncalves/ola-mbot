import { colorById, COLORS, noteById, NOTES } from './palette.js';
import { sleep } from '../timing.js';

const NEEDS_ROBOT = 'Esta ordem só funciona com o mBot verdadeiro ligado.';
const NO_ANSWER = 'O mBot não respondeu.';
const LINE_SEEN = ['os dois sensores estão em cima da linha', 'só o sensor da esquerda está em cima da linha', 'só o sensor da direita está em cima da linha', 'nenhum sensor vê a linha'];
const WHEELS_MS = 500;

/** Lower case and without accents, so that «distância» and «distancia» are the same word. */
const plain = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Bytes as text, for showing what goes to the robot and what comes back. */
export const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');

/** A whole number between `min` and `max`, or null. */
function whole(text, min, max) {
  const number = Number(text);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/**
 * The orders of the command line: what to type, what it does, and how to do it.
 * `run(args, { hub, tuning, health })` resolves with the answer to show.
 */
export const COMMANDS = [
  {
    name: 'ajuda',
    usage: 'ajuda',
    about: 'mostra esta lista',
    run: async () => COMMANDS.map((command) => `${command.usage.padEnd(22)} ${command.about}`).join('\n'),
  },
  {
    name: 'andar',
    usage: 'andar <passos>',
    about: 'anda 1 a 5 passos; com sinal menos, para trás',
    async run([steps], { hub }) {
      const count = whole(steps, -5, 5);
      if (!count) return 'Escreva um número de passos de -5 a 5, sem o zero. Exemplo: andar 2';
      await hub.move(count);
      return `Andei ${Math.abs(count)} ${Math.abs(count) === 1 ? 'passo' : 'passos'} ${count > 0 ? 'em frente' : 'para trás'}.`;
    },
  },
  {
    name: 'virar',
    usage: 'virar <quartos>',
    about: 'vira 1 a 4 quartos de volta à direita; com sinal menos, à esquerda',
    async run([quarters], { hub }) {
      const count = whole(quarters, -4, 4);
      if (!count) return 'Escreva um número de quartos de volta de -4 a 4, sem o zero. Exemplo: virar -1';
      await hub.turn(count);
      return `Virei ${Math.abs(count)} ${Math.abs(count) === 1 ? 'quarto' : 'quartos'} de volta à ${count > 0 ? 'direita' : 'esquerda'}.`;
    },
  },
  {
    name: 'rodas',
    usage: 'rodas <esq> <dir>',
    about: 'liga as rodas meio segundo, com velocidades de -255 a 255',
    async run([left, right], { hub }) {
      const speeds = [whole(left, -255, 255), whole(right, -255, 255)];
      if (speeds.includes(null)) return 'Escreva duas velocidades de -255 a 255. Exemplo: rodas 120 -120';
      await hub.drive(...speeds);
      await sleep(WHEELS_MS);
      await hub.stop();
      return `Rodas a ${speeds[0]} e ${speeds[1]} durante meio segundo.`;
    },
  },
  {
    name: 'parar',
    usage: 'parar',
    about: 'para as rodas, o besouro e as luzes',
    async run(args, { hub }) {
      await hub.reset();
      return 'Parei tudo.';
    },
  },
  {
    name: 'luz',
    usage: 'luz <cor>',
    about: `acende as luzes (${COLORS.map((color) => color.name).join(', ')}) ou apaga-as com «luz apagar»`,
    async run(words, { hub }) {
      const wanted = words.join(' ');
      const color = COLORS.find((item) => plain(item.name) === wanted || item.id === wanted);
      if (!color && wanted !== 'apagar') return `Não conheço essa cor. As cores são: ${COLORS.map((item) => item.name).join(', ')}.`;
      await hub.setLights(color ?? null);
      return color ? `Luzes em ${color.name}.` : 'Luzes apagadas.';
    },
  },
  {
    name: 'nota',
    usage: 'nota <nome>',
    about: `toca uma nota (${NOTES.map((note) => plain(note.name.split(' ')[0])).slice(0, 7).join(', ')}, do2)`,
    async run([name], { hub }) {
      const note = NOTES.find((item) => item.id === name);
      if (!note) return `Não conheço essa nota. As notas são: ${NOTES.map((item) => item.id).join(', ')}.`;
      await hub.playTone(noteById(note.id).hz, 400);
      return `Toquei ${note.name} (${note.hz} Hz).`;
    },
  },
  {
    name: 'distancia',
    usage: 'distancia',
    about: 'mede a distância à frente dos olhos, em cm',
    async run(args, { hub, tuning }) {
      if (!hub.real) return `O robô do ecrã vê alguma coisa a ${Math.round((await hub.range()) * tuning.cellCm)} cm do seu centro.`;
      const cm = await hub.real.readDistance();
      if (cm === null) return NO_ANSWER;
      return cm > 0 && cm < 400 ? `${cm.toFixed(1)} cm` : `Nada à vista (o sensor respondeu ${Math.round(cm)}).`;
    },
  },
  {
    name: 'linha',
    usage: 'linha',
    about: 'diz o que veem os dois sensores de linha',
    async run(args, { hub }) {
      const seen = await hub.readLine();
      return seen === null ? NO_ANSWER : `${seen}: ${LINE_SEEN[seen] ?? 'resposta desconhecida'}.`;
    },
  },
  {
    name: 'luminosidade',
    usage: 'luminosidade',
    about: 'mede a luz que chega à placa (0 escuro, cerca de 1000 muita luz)',
    async run(args, { hub }) {
      if (!hub.real) return NEEDS_ROBOT;
      const light = await hub.real.readLight();
      return light === null ? NO_ANSWER : String(Math.round(light));
    },
  },
  {
    name: 'botao',
    usage: 'botao',
    about: 'diz se o botão da placa está a ser carregado',
    async run(args, { hub }) {
      if (!hub.real) return NEEDS_ROBOT;
      const pressed = await hub.real.readButton();
      return pressed === null ? NO_ANSWER : pressed ? 'O botão está carregado.' : 'O botão está solto.';
    },
  },
  {
    name: 'versao',
    usage: 'versao',
    about: 'pergunta ao robô a versão do firmware',
    async run(args, { hub }) {
      if (!hub.real) return NEEDS_ROBOT;
      return (await hub.real.readVersion()) ?? NO_ANSWER;
    },
  },
  {
    name: 'estado',
    usage: 'estado',
    about: 'mostra como está a ligação Bluetooth',
    async run(args, { hub, health }) {
      if (!hub.real) return 'O mBot não está ligado: as ordens vão só para o robô do ecrã.';
      const { sent, failed, slowestMs, repairs } = health();
      return `${sent} ordens enviadas, ${failed} falhadas; a mais lenta levou ${slowestMs} ms; ligação refeita ${repairs} ${repairs === 1 ? 'vez' : 'vezes'}.`;
    },
  },
  {
    name: 'hex',
    usage: 'hex <bytes>',
    about: 'envia bytes tal e qual, em hexadecimal. Exemplo: hex ff 55 02 00 04',
    async run(words, { hub }) {
      if (!hub.real) return NEEDS_ROBOT;
      const bytes = words.map((word) => (/^[0-9a-f]{1,2}$/.test(word) ? parseInt(word, 16) : null));
      if (bytes.length === 0 || bytes.includes(null)) return 'Escreva os bytes em hexadecimal, separados por espaços. Exemplo: hex ff 55 02 00 04';
      await hub.real.sendRaw(bytes);
      return `Enviei: ${hex(bytes)}`;
    },
  },
];

/** Runs one line typed at the command line and resolves with the answer, as text. */
export async function runCommand(line, context) {
  const [name, ...words] = plain(line).trim().split(/\s+/);
  const command = COMMANDS.find((item) => item.name === name);
  if (!command) return `Não conheço a ordem «${name}». Escreva «ajuda» para ver as ordens.`;
  try {
    return await command.run(words, context);
  } catch (error) {
    return `Não correu bem: ${error?.message ?? error}`;
  }
}
