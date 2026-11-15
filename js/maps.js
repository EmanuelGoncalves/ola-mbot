import { LEVELS } from './school.js';

/** The printed maps have squares this wide, in cm. */
export const MAP_SQUARE_CM = 15;

/** On both maps the robot starts on the same square, facing up the map as it is drawn on screen. */
const START = Object.freeze({ x: 2, y: 2, heading: 0 });

/** A thing printed on a map: where it is, its picture, its name on the map and in a sentence. */
const thing = (id, x, y, icon, name, the, more = {}) => ({ id, x, y, icon, name, the, ...more });
/** Too big to be carried. */
const FIXED = { fixed: true };
/** A square to keep off, with what happens to a robot that goes there. */
const hazard = (mishap) => ({ hazard: true, fixed: true, mishap });

/**
 * The two printed maps, six squares by four, drawn with the long side across the screen.
 * Each thing sits on its own square; a river or a forest fills several.
 */
export const MAPS = [
  {
    id: 'house',
    icon: '🏠',
    name: 'A casa',
    cols: 6,
    rows: 4,
    start: START,
    things: [
      thing('coatrack', 0, 0, '🧥', 'Cabide', 'o cabide', FIXED),
      thing('bed', 2, 0, '🛏️', 'Cama', 'a cama', FIXED),
      thing('bicycle', 4, 0, '🚲', 'Bicicleta', 'a bicicleta'),
      thing('backpack', 5, 0, '🎒', 'Mochila', 'a mochila'),
      thing('easel', 0, 1, '🎨', 'Cavalete', 'o cavalete', FIXED),
      thing('piggy', 1, 1, '🐷', 'Mealheiro', 'o mealheiro'),
      thing('toybox', 3, 1, '🧸', 'Brinquedos', 'a caixa dos brinquedos'),
      thing('dresser', 4, 1, '🗄️', 'Cómoda', 'a cómoda', FIXED),
      thing('sportsbag', 0, 2, '👜', 'Saco', 'o saco de desporto'),
      thing('plant', 3, 2, '🪴', 'Planta', 'a planta'),
      thing('aquarium', 4, 2, '🐠', 'Aquário', 'o aquário', FIXED),
      thing('computer', 5, 2, '🖥️', 'Computador', 'o computador', FIXED),
      thing('piano', 1, 3, '🎹', 'Piano', 'o piano', FIXED),
      thing('cat', 2, 3, '🐱', 'Gato', 'o gato'),
      thing('train', 3, 3, '🛤️', 'Comboio', 'a linha do comboio'),
      thing('lamp', 5, 3, '💡', 'Candeeiro', 'o candeeiro'),
    ],
  },
  {
    id: 'kingdom',
    icon: '🏰',
    name: 'O reino',
    cols: 6,
    rows: 4,
    start: START,
    things: [
      thing('castle', 0, 0, '🏰', 'Castelo', 'o castelo', FIXED),
      thing('map', 1, 0, '🗺️', 'Mapa', 'o mapa do tesouro'),
      thing('well', 2, 0, '🪣', 'Poço', 'o poço', FIXED),
      thing('dragonfly', 3, 0, '🦋', 'Libelinha', 'a libelinha'),
      thing('gem', 5, 0, '💎', 'Pedra', 'a pedra preciosa'),
      thing('flower', 0, 1, '🌷', 'Flor', 'a flor'),
      thing('river', 1, 1, '🌊', 'Rio', 'o rio', hazard('Chuá! O robô foi levado pelo rio.')),
      thing('frog', 2, 1, '🐸', 'Sapo', 'o sapo'),
      thing('lake', 3, 1, '💧', 'Lago', 'o lago', hazard('Splash! O robô caiu ao lago.')),
      thing('mushrooms', 4, 1, '🍄', 'Cogumelos', 'os cogumelos'),
      thing('river2', 1, 2, '🌊', 'Rio', 'o rio', hazard('Chuá! O robô foi levado pelo rio.')),
      thing('forest', 3, 2, '🌳', 'Floresta', 'a floresta', hazard('O robô perdeu-se na floresta.')),
      thing('forest2', 4, 2, '🌲', 'Floresta', 'a floresta', hazard('O robô perdeu-se na floresta.')),
      thing('amulet', 5, 2, '🧿', 'Amuleto', 'o amuleto'),
      thing('shield', 0, 3, '🛡️', 'Escudo', 'o escudo'),
      thing('book', 1, 3, '📖', 'Livro', 'o livro de magia'),
      thing('sword', 2, 3, '🗡️', 'Espada', 'a espada'),
      thing('potion', 3, 3, '🧪', 'Poção', 'a poção'),
      thing('bat', 4, 3, '🦇', 'Morcego', 'o morcego'),
      thing('cave', 5, 3, '🪨', 'Gruta', 'a gruta', FIXED),
    ],
  },
];

// What the robot must have done at the end of the program. `place` is a thing's id, or 'start'.
const squareOf = (robot, place) => (place === 'start' ? robot.world.start : robot.thing(place).home);
const on = (thing, square) => thing.x === square.x && thing.y === square.y;
/** The robot stopped on the square of this thing. */
const ends = (place) => (blocks, robot) => on(robot.cell, squareOf(robot, place));
/** The robot carries this thing. */
const holds = (id) => (blocks, robot) => robot.thing(id).held;
/** This thing was put down on the square of `place`. */
const brought = (id, place) => (blocks, robot) => !robot.thing(id).held && on(robot.thing(id), squareOf(robot, place));
/** The robot never went onto the squares of these things. */
const avoids = (...ids) => (blocks, robot) => ids.every((id) => !robot.visited.has(`${robot.thing(id).home.x},${robot.thing(id).home.y}`));
/** The program has no more blocks than this. */
const atMost = (count) => (blocks) => blocks.length <= count;
const all = (...checks) => (blocks, robot) => checks.every((check) => check(blocks, robot));

/**
 * The missions of each map, as `[level, id, icon, title, goal, hint, check, solution]`. The
 * `solution` is one program that does it, for the tests: `['forward', 2]`, `['pick']`…
 */
const MISSIONS_OF = {
  house: [
    ['easy', 'cat', '🐱', 'Bom dia, gato!', 'Vai ter com o gato.', 'O gato está mesmo atrás do robô. Experimenta «Andar para trás».', ends('cat'), [['backward', 1]]],
    ['easy', 'plant', '🪴', 'Regar a planta', 'Leva o robô até à planta.', 'A planta está no quadrado à direita do robô: vira à direita e anda 1 passo.', ends('plant'), [['turnRight', 1], ['forward', 1]]],
    [
      'easy',
      'backpack',
      '🎒',
      'A mochila',
      'Vai buscar a mochila: chega ao quadrado dela e apanha-a.',
      'Sobe 2 passos, vira à direita e anda 3 passos. No fim, usa o bloco «Apanhar».',
      holds('backpack'),
      [['forward', 2], ['turnRight', 1], ['forward', 3], ['pick']],
    ],
    [
      'easy',
      'bedtime',
      '🛏️',
      'Hora de dormir',
      'Leva o gato para a cama.',
      'Anda para trás até ao gato e apanha-o. A cama fica 3 quadrados à frente: quando lá chegares, usa «Largar».',
      brought('cat', 'bed'),
      [['backward', 1], ['pick'], ['forward', 3], ['drop']],
    ],
    [
      'normal',
      'savings',
      '🐷',
      'Guardar o mealheiro',
      'Arruma o mealheiro na cómoda.',
      'O mealheiro está em cima e à esquerda. Depois de o apanhares, dá meia volta: a cómoda fica 3 quadrados em frente.',
      brought('piggy', 'dresser'),
      [['forward', 1], ['turnLeft', 1], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 3], ['drop']],
    ],
    [
      'normal',
      'music',
      '🎹',
      'Música para a planta',
      'Leva a planta para ao pé do piano. O gato está a dormir: não passes pelo quadrado dele!',
      'Apanha a planta e volta para trás, passando outra vez pela partida. Só depois desces para o piano.',
      all(brought('plant', 'piano'), avoids('cat')),
      [['turnRight', 1], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 2], ['turnLeft', 1], ['forward', 1], ['drop']],
    ],
    [
      'normal',
      'school',
      '🚲',
      'A caminho da escola',
      'Apanha a bicicleta e a mochila e traz as duas para o quadrado da partida.',
      'Estão as duas lá em cima, à direita, uma ao lado da outra. O robô pode levar várias coisas ao mesmo tempo.',
      all(brought('bicycle', 'start'), brought('backpack', 'start')),
      [['forward', 2], ['turnRight', 1], ['forward', 2], ['pick'], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 3], ['turnLeft', 1], ['forward', 2], ['drop']],
    ],
    [
      'hard',
      'painting',
      '🎨',
      'Luz para pintar',
      'Leva o candeeiro ao cavalete, sem passar pelo quadrado do gato.',
      'O candeeiro está no canto de baixo, à direita. Para voltar, sobe 2 quadrados antes de atravessares a casa toda.',
      all(brought('lamp', 'easel'), avoids('cat')),
      [['turnRight', 1], ['forward', 3], ['turnRight', 1], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 2], ['turnLeft', 1], ['forward', 5], ['drop']],
    ],
    [
      'hard',
      'tidy',
      '🧥',
      'Dia de arrumações',
      'Pendura o saco de desporto e a mochila no cabide.',
      'Apanha primeiro o saco, que está à esquerda. A mochila está no outro canto: vai buscá-la e volta ao cabide com as duas coisas.',
      all(brought('sportsbag', 'coatrack'), brought('backpack', 'coatrack')),
      [['turnLeft', 1], ['forward', 2], ['pick'], ['turnRight', 1], ['forward', 2], ['turnRight', 1], ['forward', 5], ['pick'], ['turnRight', 2], ['forward', 5], ['drop']],
    ],
    [
      'hard',
      'fish',
      '🐠',
      'O gato e o peixe',
      'O gato quer ver o peixe: leva-o ao aquário com 6 blocos, no máximo.',
      'Não é preciso virar para ir buscar o gato: o robô também anda para trás.',
      all(brought('cat', 'aquarium'), atMost(6)),
      [['backward', 1], ['pick'], ['forward', 1], ['turnRight', 1], ['forward', 2], ['drop']],
    ],
  ],
  kingdom: [
    ['easy', 'frog', '🐸', 'Olá, sapo!', 'Vai ter com o sapo.', 'O sapo está no quadrado em frente do robô.', ends('frog'), [['forward', 1]]],
    ['easy', 'sword', '🗡️', 'A espada', 'Apanha a espada.', 'A espada está atrás do robô. Quando estiveres no quadrado dela, usa o bloco «Apanhar».', holds('sword'), [['backward', 1], ['pick']]],
    ['easy', 'well', '🪣', 'Água do poço', 'Leva o robô até ao poço.', 'O poço fica 2 quadrados em frente, depois do sapo.', ends('well'), [['forward', 2]]],
    [
      'easy',
      'book',
      '📖',
      'O livro de magia',
      'Apanha o livro de magia. Cuidado com o rio!',
      'Não vás pela esquerda: é o rio. Anda primeiro para trás, até à espada, e só depois vira à esquerda.',
      holds('book'),
      [['backward', 1], ['turnLeft', 1], ['forward', 1], ['pick']],
    ],
    [
      'normal',
      'potion',
      '🧪',
      'A poção para o castelo',
      'Leva a poção ao castelo, sem passar pelo lago nem pela floresta.',
      'A poção está em baixo, à direita da espada. O caminho seguro para o castelo é pela fila de baixo e depois sempre a subir.',
      brought('potion', 'castle'),
      [['backward', 1], ['turnRight', 1], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 3], ['turnRight', 1], ['forward', 3], ['drop']],
    ],
    [
      'normal',
      'knight',
      '🛡️',
      'O cavaleiro',
      'Leva a espada e o escudo ao castelo.',
      'Estão os dois na fila de baixo. Apanha a espada, depois o escudo, e sobe até ao castelo.',
      all(brought('sword', 'castle'), brought('shield', 'castle')),
      [['backward', 1], ['pick'], ['turnLeft', 1], ['forward', 2], ['pick'], ['turnRight', 1], ['forward', 3], ['drop']],
    ],
    [
      'normal',
      'treasure',
      '🗺️',
      'O tesouro escondido',
      'Apanha o mapa do tesouro e leva-o para a gruta.',
      'O mapa está lá em cima, ao lado do poço. A gruta fica no canto oposto: segue pela fila de cima e desce pela direita.',
      brought('map', 'cave'),
      [['forward', 2], ['turnLeft', 1], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 4], ['turnRight', 1], ['forward', 3], ['drop']],
    ],
    [
      'normal',
      'lunch',
      '🍄',
      'O almoço do sapo',
      'Leva os cogumelos ao sapo. O lago está no meio do caminho!',
      'Vai pela fila de cima, desce até aos cogumelos e volta pelo mesmo caminho. Para sair de lá, experimenta «Andar para trás».',
      brought('mushrooms', 'frog'),
      [['forward', 2], ['turnRight', 1], ['forward', 2], ['turnRight', 1], ['forward', 1], ['pick'], ['backward', 1], ['turnRight', 1], ['forward', 2], ['turnLeft', 1], ['forward', 1], ['drop']],
    ],
    [
      'hard',
      'jewels',
      '💎',
      'As joias do reino',
      'Guarda a pedra preciosa e o amuleto no poço.',
      'Estão os dois na coluna da direita. Apanha a pedra, desce até ao amuleto e volta pelo mesmo caminho.',
      all(brought('gem', 'well'), brought('amulet', 'well')),
      [['forward', 2], ['turnRight', 1], ['forward', 3], ['pick'], ['turnRight', 1], ['forward', 2], ['pick'], ['turnRight', 2], ['forward', 2], ['turnLeft', 1], ['forward', 3], ['drop']],
    ],
    [
      'hard',
      'spell',
      '✨',
      'O grande feitiço',
      'Junta no castelo a poção, o livro de magia e a flor.',
      'Começa pela poção e segue pela fila de baixo até ao canto. A flor está no caminho para o castelo.',
      all(brought('potion', 'castle'), brought('book', 'castle'), brought('flower', 'castle')),
      [['backward', 1], ['turnRight', 1], ['forward', 1], ['pick'], ['turnRight', 2], ['forward', 2], ['pick'], ['forward', 1], ['turnRight', 1], ['forward', 2], ['pick'], ['forward', 1], ['drop']],
    ],
    [
      'hard',
      'hide',
      '🪨',
      'O sapo aventureiro',
      'O sapo quer conhecer a gruta: leva-o lá com 6 blocos, no máximo.',
      'O caminho mais curto é pela fila de baixo. Depois de apanhares o sapo, anda para trás em vez de dares meia volta.',
      all(brought('frog', 'cave'), atMost(6)),
      [['forward', 1], ['pick'], ['backward', 2], ['turnRight', 1], ['forward', 3], ['drop']],
    ],
  ],
};

/** What the mat needs to show a map. */
const worldOf = ({ id, cols, rows, start, things }) => ({ map: id, cols, rows, start, things });

/** Every mission on a printed map, in the form the missions of the other tabs have. */
export const MAP_MISSIONS = MAPS.flatMap((map) =>
  MISSIONS_OF[map.id].map(([level, id, icon, title, goal, hint, check, solution]) => ({
    id: `map-${map.id}-${id}`,
    map: map.id,
    level,
    label: map.name,
    icon,
    title,
    goal,
    hint,
    world: worldOf(map),
    check,
    solution,
  })),
);

/** The map with nothing asked: the child programs the robot on it as they like. */
export const freePlayOn = (map) => ({
  id: `map-${map.id}-free`,
  map: map.id,
  sandbox: true,
  label: map.name,
  icon: '🖍️',
  title: 'À vontade',
  goal: 'Programa o robô como quiseres neste mapa.',
  hint: 'Experimenta ir buscar uma coisa com «Apanhar» e deixá-la noutro quadrado com «Largar».',
  world: worldOf(map),
  check: () => false,
});

export const missionsOn = (map) => MAP_MISSIONS.filter((mission) => mission.map === map.id);
export const missionsAt = (map, level) => missionsOn(map).filter((mission) => mission.level === level.id);
export { LEVELS };
