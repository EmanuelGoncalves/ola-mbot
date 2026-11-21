import { COMMANDS, hex, runCommand } from '../js/robot/console.js';
import { ReplyParser, buttonRequest, lightRequest, sensorRequest, versionRequest } from '../js/robot/protocol.js';
import { equal, ok, test } from './harness.js';

/** A hub that writes down what it is asked; `real` is the pretend mBot, or null. */
function pretend({ real = null } = {}) {
  const hub = {
    log: [],
    real,
    move: async (steps) => hub.log.push(['move', steps]),
    turn: async (quarters) => hub.log.push(['turn', quarters]),
    drive: async (left, right) => hub.log.push(['drive', left, right]),
    stop: async () => hub.log.push(['stop']),
    reset: async () => hub.log.push(['reset']),
    setLights: async (color) => hub.log.push(['lights', color?.id ?? null]),
    playTone: async (hz) => hub.log.push(['tone', hz]),
    range: async () => 2.5,
    readLine: async () => 1,
  };
  const context = { hub, tuning: { cellCm: 20 }, health: () => ({ sent: 12, failed: 1, slowestMs: 40, repairs: 0 }) };
  return { hub, ask: (line) => runCommand(line, context) };
}

test('console: every order has its own name, a usage and an explanation', () => {
  equal(new Set(COMMANDS.map((command) => command.name)).size, COMMANDS.length);
  for (const command of COMMANDS) ok(command.usage.startsWith(command.name) && command.about, command.name);
});

test('console: "ajuda" lists every order', async () => {
  const help = await pretend().ask('ajuda');
  for (const command of COMMANDS) ok(help.includes(command.usage), `${command.name} is missing`);
});

test('console: orders move the robot, with or without accents and capitals', async () => {
  const { hub, ask } = pretend();
  await ask('andar 2');
  await ask('  Virar -1 ');
  await ask('luz VERMELHO');
  await ask('luz apagar');
  await ask('nota sol');
  await ask('parar');
  equal(hub.log, [['move', 2], ['turn', -1], ['lights', 'red'], ['lights', null], ['tone', 392], ['reset']]);
});

test('console: "rgb" and "tom" take plain numbers', async () => {
  const { hub, ask } = pretend();
  hub.setLights = async (color) => hub.log.push(['lights', ...color.rgb]);
  equal(await ask('rgb 0 60 120'), 'Luzes em 0, 60, 120.');
  equal(await ask('tom 440 300'), 'Toquei 440 Hz durante 300 ms.');
  ok((await ask('rgb 0 60')).includes('Exemplo'));
  ok((await ask('rgb 0 60 300')).includes('0 a 255'));
  ok((await ask('tom 440')).includes('Exemplo'));
  equal(hub.log, [['lights', 0, 60, 120], ['tone', 440]]);
});

test('console: a wrong order or number is explained, and nothing moves', async () => {
  const { hub, ask } = pretend();
  ok((await ask('voar')).includes('ajuda'));
  ok((await ask('andar 9')).includes('-5 a 5'));
  ok((await ask('andar')).includes('Exemplo'));
  ok((await ask('rodas 300 0')).includes('-255 a 255'));
  ok((await ask('luz bege')).includes('vermelho'));
  equal(hub.log, []);
});

test('console: without the mBot, the robot on screen answers what it can', async () => {
  const { ask } = pretend();
  ok((await ask('distância')).includes('50 cm'));
  ok((await ask('linha')).startsWith('1:'));
  ok((await ask('versao')).includes('mBot verdadeiro'));
  ok((await ask('ler 7 4')).includes('mBot verdadeiro'));
  ok((await ask('hex ff 55 02 00 04')).includes('mBot verdadeiro'));
  ok((await ask('estado')).includes('não está ligado'));
});

test('console: with the mBot, it reads the sensors and sends raw bytes', async () => {
  const sent = [];
  const real = {
    readDistance: async () => 23.46,
    readLight: async () => 512.4,
    readButton: async () => true,
    readVersion: async () => '06.01.009',
    sendRaw: async (bytes) => sent.push(bytes),
    read: async (...numbers) => (numbers.join() === '7,4' ? 312.456 : null),
  };
  const { ask } = pretend({ real });
  equal(await ask('distancia'), '23.5 cm');
  equal(await ask('luminosidade'), '512');
  ok((await ask('botao')).includes('carregado'));
  equal(await ask('versao'), '06.01.009');
  equal(await ask('ler 7 4'), '312.46', 'any sensor, by device and port:');
  ok((await ask('ler 9 1')).includes('não respondeu'));
  ok((await ask('ler')).includes('Exemplo'));
  ok((await ask('estado')).includes('12 ordens'));
  equal(await ask('hex FF 55 2 0 4'), 'Enviei: ff 55 02 00 04');
  equal(sent, [[255, 85, 2, 0, 4]]);
  ok((await ask('hex ff zz')).includes('hexadecimal'));
  equal(sent.length, 1);
});

test('console: an order that fails says so instead of breaking', async () => {
  const { hub, ask } = pretend();
  hub.move = async () => {
    throw new Error('sem pilhas');
  };
  ok((await ask('andar 1')).includes('sem pilhas'));
});

test('console: bytes are shown in hexadecimal', () => {
  equal(hex([255, 85, 2, 0, 4]), 'ff 55 02 00 04');
});

test('protocol: questions for the version, the light sensor and the button', () => {
  equal([...versionRequest(5)], [0xff, 0x55, 3, 5, 1, 0]);
  equal([...lightRequest(6)], [0xff, 0x55, 4, 6, 1, 3, 6]);
  equal([...buttonRequest(7)], [0xff, 0x55, 5, 7, 1, 35, 7, 0]);
  equal([...sensorRequest(8, 7, 4)], [0xff, 0x55, 4, 8, 1, 7, 4], 'any sensor: the sound sensor on port 4');
});

test('protocol: a text reply carries its own length, and may come in pieces', () => {
  const parser = new ReplyParser();
  const text = [...'06.01.009'].map((letter) => letter.charCodeAt(0));
  equal(parser.push([0xff, 0x55, 5, 4, text.length, ...text.slice(0, 4)]), []);
  equal(parser.push([...text.slice(4), 0x0d, 0x0a, 0xff, 0x55, 9, 1, 1, 0x0d, 0x0a]), [{ index: 5, value: '06.01.009' }, { index: 9, value: 1 }]);
});
