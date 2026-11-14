import { colorById } from './robot/palette.js';
import { WORLD } from './robot/simulator.js';

export const SUBJECTS = [
  { id: 'math', icon: '🔢', name: 'Matemática' },
  { id: 'portuguese', icon: '📖', name: 'Português' },
];

export const LEVELS = [
  { id: 'easy', icon: '🌱', name: 'Fácil' },
  { id: 'normal', icon: '🌿', name: 'Normal' },
  { id: 'hard', icon: '🌳', name: 'Difícil' },
];

/** School years that have exercises. */
export const YEARS = [2];

// What the robot must have done at the end of the program.
const onSign = (text) => (blocks, robot) => robot.signHere() === text;
/** Exactly `steps` squares straight ahead of the start; bumping into the edge of the mat does not count. */
const ahead = (steps) => (blocks, robot) => robot.cell.x === WORLD.start.x && robot.cell.y === WORLD.start.y - steps && robot.bumps === 0;
/** True when the robot went through the middle of this square on its way. */
const passed = (x, y) => (blocks, robot) => robot.trail.some((point) => Math.hypot(point.x - x, point.y - y) < 0.2);
const lit = (color) => (blocks, robot) => robot.lights === colorById(color).hex;
const played = (notes) => (blocks, robot) => robot.notesPlayed === notes;
const all = (...checks) => (blocks, robot) => checks.every((check) => check(blocks, robot));

/** True when a «Repetir `times` vezes» holds a block for each of `wanted`, given as `[type, value]`. */
const repeats = (times, wanted) => (blocks) =>
  blocks.some(
    (block) =>
      block.type === 'repeat' &&
      block.value === times &&
      wanted.every(([type, value]) => block.body.some((inside) => inside.type === type && (value === undefined || inside.value === value))),
  );

/**
 * Exercises are missions whose answer tells the robot what to do. The robot starts
 * on cell (1, 4), facing up. `text` is a short story to read first; `world.signs`
 * are squares with a word or a number (`[x, y, text]`); `solution` is one program
 * that solves it, in the compact form the tests use.
 */
const EXERCISES = {
  math: {
    2: {
      easy: [
        {
          id: 'mat-soma',
          icon: '➕',
          title: 'Somar',
          goal: 'Quanto é 7 + 5? Leva o robô até ao quadrado com a resposta certa.',
          hint: 'Começa no 7 e conta mais 5 pelos dedos. Depois faz o caminho até esse número.',
          world: { signs: [[1, 1, '11'], [3, 2, '12'], [4, 4, '13']] },
          check: onSign('12'),
          solution: [['forward', 2], ['turnRight', 1], ['forward', 2]],
        },
        {
          id: 'mat-passos',
          icon: '👣',
          title: 'Passos contados',
          goal: 'O robô quer andar 9 − 6 passos em frente. Quantos passos são? Faz o robô andar esse número de passos.',
          hint: 'Tens 9 e tiras 6. No bloco «Andar em frente» podes escolher o número de passos.',
          world: {},
          check: ahead(3),
          solution: [['forward', 3]],
        },
        {
          id: 'mat-dobro',
          icon: '✌️',
          title: 'O dobro',
          goal: 'Qual é o dobro de 4? Leva o robô até lá.',
          hint: 'O dobro é duas vezes o mesmo número: 4 + 4.',
          world: { signs: [[1, 0, '6'], [4, 3, '8'], [3, 1, '10']] },
          check: onSign('8'),
          solution: [['forward', 1], ['turnRight', 1], ['forward', 3]],
        },
        {
          id: 'mat-contar',
          icon: '🐸',
          title: 'Saltos de 2 em 2',
          goal: 'A rã salta de 2 em 2: 2, 4, 6, 8… Em que número cai a seguir? Leva o robô até lá.',
          hint: 'Junta mais 2 ao último número.',
          world: { signs: [[0, 2, '9'], [1, 0, '10'], [4, 4, '12']] },
          check: onSign('10'),
          solution: [['forward', 4]],
        },
        {
          id: 'mat-lados',
          icon: '🔺',
          title: 'Os lados do triângulo',
          goal: 'Quantos lados tem um triângulo? Toca uma nota por cada lado.',
          hint: 'Desenha um triângulo no ar com o dedo e conta os lados. Usa o bloco «Tocar a nota».',
          world: {},
          check: played(3),
          solution: [['note', 'do'], ['note', 'mi'], ['note', 'sol']],
        },
      ],
      normal: [
        {
          id: 'mat-dezenas',
          icon: '🔟',
          title: 'Dezenas e unidades',
          goal: 'No número 47, qual é o algarismo das dezenas? Anda esse número de passos em frente.',
          hint: '47 são 4 dezenas e 7 unidades.',
          world: {},
          check: ahead(4),
          solution: [['forward', 4]],
        },
        {
          id: 'mat-tabuada',
          icon: '✖️',
          title: 'A tabuada do 5',
          goal: 'Quanto é 3 × 5? Leva o robô até à resposta.',
          hint: 'São 3 vezes o 5: 5 + 5 + 5.',
          world: { signs: [[1, 2, '8'], [3, 3, '15'], [4, 1, '35']] },
          check: onSign('15'),
          solution: [['forward', 1], ['turnRight', 1], ['forward', 2]],
        },
        {
          id: 'mat-moedas',
          icon: '💶',
          title: 'O mealheiro',
          goal: 'A Marta tem uma moeda de 50 cêntimos e duas moedas de 20 cêntimos. Quantos cêntimos tem ao todo? Leva o robô até lá.',
          hint: 'Soma as três moedas: 50 + 20 + 20.',
          world: { signs: [[0, 1, '70'], [2, 0, '90'], [4, 3, '100']] },
          check: onSign('90'),
          solution: [['forward', 4], ['turnRight', 1], ['forward', 1]],
        },
        {
          id: 'mat-centimetros',
          icon: '📏',
          title: 'Medir o caminho',
          goal: 'Neste exercício, cada quadrado do tapete mede 20 cm. O tesouro está escondido 60 cm à frente do robô. Quantos quadrados são? Leva o robô até lá.',
          hint: 'Conta de 20 em 20 até chegares a 60: 20, 40, 60. Quantas vezes contaste?',
          world: {},
          check: ahead(3),
          solution: [['forward', 3]],
        },
        {
          id: 'mat-padrao',
          icon: '🧩',
          title: 'O padrão',
          goal: '5, 10, 15, 20… Que número vem a seguir? Leva o robô até lá.',
          hint: 'Os números crescem de 5 em 5.',
          world: { signs: [[1, 1, '22'], [3, 4, '25'], [5, 2, '30']] },
          check: onSign('25'),
          solution: [['turnRight', 1], ['forward', 2]],
        },
      ],
      hard: [
        {
          id: 'mat-pomar',
          icon: '🍎',
          title: 'As maçãs do avô',
          goal: 'O avô apanhou 24 maçãs. Deu 9 à Inês e 7 ao Tomás. Com quantas maçãs ficou? Leva o robô até à resposta.',
          hint: 'Vê primeiro quantas maçãs deu ao todo: 9 + 7. Depois tira esse número a 24.',
          world: { signs: [[0, 0, '8'], [2, 2, '10'], [4, 4, '40']] },
          check: onSign('8'),
          solution: [['forward', 4], ['turnLeft', 1], ['forward', 1]],
        },
        {
          id: 'mat-retangulo',
          icon: '▭',
          title: 'O retângulo',
          goal: 'Desenha um retângulo com o robô: os lados compridos têm 3 passos e os lados curtos têm 2. Acaba no sítio onde começaste.',
          hint: 'Um retângulo tem 2 lados compridos e 2 lados curtos. Dentro de um «Repetir 2 vezes» põe: andar 3, virar à direita, andar 2, virar à direita.',
          world: {},
          // The corner opposite the start is (3, 1) for an upright rectangle and (4, 2) for one lying down.
          check: (blocks, robot) => robot.atStart() && robot.stepsMoved === 10 && robot.bumps === 0 && (passed(3, 1)(blocks, robot) || passed(4, 2)(blocks, robot)),
          solution: [['repeat', 2, [['forward', 3], ['turnRight', 1], ['forward', 2], ['turnRight', 1]]]],
        },
        {
          id: 'mat-metade',
          icon: '🔵',
          title: 'Metade dos berlindes',
          goal: 'A Sara tem 16 berlindes e dá metade ao irmão. Com quantos fica? Toca uma nota por cada berlinde com que a Sara fica.',
          hint: 'Metade de 16 é o número que somado a si próprio dá 16. São muitas notas: dentro de um «Repetir 4 vezes» põe 2 notas.',
          world: {},
          check: played(8),
          solution: [['repeat', 4, [['note', 'do'], ['note', 'mi']]]],
        },
        {
          id: 'mat-maior',
          icon: '🏔️',
          title: 'O maior número',
          goal: 'Qual é o maior destes números: 389, 398 ou 298? Leva o robô até ele.',
          hint: 'Compara primeiro as centenas. Se forem iguais, compara as dezenas.',
          world: { signs: [[1, 2, '389'], [4, 2, '398'], [3, 0, '298']] },
          check: onSign('398'),
          solution: [['forward', 2], ['turnRight', 1], ['forward', 3]],
        },
        {
          id: 'mat-itinerario',
          icon: '🧭',
          title: 'O mapa do tesouro',
          goal: 'Neste exercício, cada quadrado do tapete mede 20 cm. O robô anda 80 cm em frente, vira à direita e anda 60 cm. A que tesouro chega? Leva-o até lá.',
          hint: 'Conta de 20 em 20: quantos quadrados são 80 cm? E 60 cm?',
          world: { signs: [[4, 0, '💎'], [3, 0, '👑'], [4, 1, '🏆']] },
          check: onSign('💎'),
          solution: [['forward', 4], ['turnRight', 1], ['forward', 3]],
        },
      ],
    },
  },

  portuguese: {
    2: {
      easy: [
        {
          id: 'pt-silabas',
          icon: '👏',
          title: 'Bater as sílabas',
          goal: 'Quantas sílabas tem a palavra «sapato»? Toca uma nota por cada sílaba.',
          hint: 'Diz a palavra devagar e bate uma palma por cada bocadinho: sa… pa… to.',
          world: {},
          check: played(3),
          solution: [['note', 'do'], ['note', 're'], ['note', 'mi']],
        },
        {
          id: 'pt-rima',
          icon: '🎵',
          title: 'Palavras que rimam',
          goal: 'Que palavra rima com «gato»? Leva o robô até ela.',
          hint: 'Rimam as palavras que acabam com o mesmo som. Diz cada uma em voz alta.',
          world: { signs: [[1, 1, 'mesa'], [3, 3, 'pato'], [4, 1, 'sol']] },
          check: onSign('pato'),
          solution: [['forward', 1], ['turnRight', 1], ['forward', 2]],
        },
        {
          id: 'pt-balao',
          icon: '🎈',
          title: 'O balão do Rui',
          text: 'O Rui tem um balão. O balão do Rui é verde e voa muito alto.',
          goal: 'De que cor é o balão do Rui? Acende as luzes do robô dessa cor.',
          hint: 'Lê outra vez a segunda frase. Depois usa o bloco «Acender as luzes».',
          world: {},
          check: lit('green'),
          solution: [['lights', 'green']],
        },
        {
          id: 'pt-animal',
          icon: '🐶',
          title: 'Onde está o animal?',
          goal: 'Qual destas palavras é o nome de um animal? Leva o robô até ela.',
          hint: 'Lê as três palavras com atenção: uma é para brincar, outra é para comer e a outra é um animal.',
          world: { signs: [[0, 2, 'bola'], [1, 0, 'cão'], [4, 4, 'pão']] },
          check: onSign('cão'),
          solution: [['forward', 4]],
        },
        {
          id: 'pt-mensagem',
          icon: '✉️',
          title: 'A mensagem',
          text: 'Robô, anda três passos em frente. Depois acende as luzes azuis.',
          goal: 'Lê a mensagem e faz o programa que ela pede.',
          hint: 'A mensagem pede duas coisas, uma de cada vez. Usa um bloco para cada uma.',
          world: {},
          check: all(ahead(3), lit('blue')),
          solution: [['forward', 3], ['lights', 'blue']],
        },
      ],
      normal: [
        {
          id: 'pt-plural',
          icon: '🌷',
          title: 'Mais do que uma',
          goal: 'Uma flor, duas… Qual é o plural de «flor»? Leva o robô até à palavra bem escrita.',
          hint: 'Diz em voz alta: «uma flor, duas…».',
          world: { signs: [[1, 2, 'flors'], [3, 3, 'flores'], [4, 1, 'floris']] },
          check: onSign('flores'),
          solution: [['forward', 1], ['turnRight', 1], ['forward', 2]],
        },
        {
          id: 'pt-contrario',
          icon: '↕️',
          title: 'O contrário',
          goal: 'Qual é o contrário de «alto»? Leva o robô até lá.',
          hint: 'Pensa numa girafa e numa formiga. A girafa é alta. E a formiga?',
          world: { signs: [[0, 1, 'grande'], [2, 0, 'baixo'], [4, 3, 'magro']] },
          check: onSign('baixo'),
          solution: [['forward', 4], ['turnRight', 1], ['forward', 1]],
        },
        {
          id: 'pt-verbo',
          icon: '🏃',
          title: 'A palavra que mexe',
          goal: 'Qual destas palavras é um verbo, uma palavra que diz o que alguém faz? Leva o robô até ela.',
          hint: 'Experimenta dizer «Eu vou…» antes de cada palavra. Só uma fica bem.',
          world: { signs: [[1, 1, 'mesa'], [3, 4, 'correr'], [5, 2, 'azul']] },
          check: onSign('correr'),
          solution: [['turnRight', 1], ['forward', 2]],
        },
        {
          id: 'pt-alfabeto',
          icon: '🔤',
          title: 'Ordem alfabética',
          goal: 'Qual destas palavras aparece primeiro no dicionário? Leva o robô até ela.',
          hint: 'Olha para a primeira letra de cada palavra e canta o alfabeto: a, b, c…',
          world: { signs: [[1, 2, 'pera'], [4, 2, 'banana'], [3, 0, 'uva']] },
          check: onSign('banana'),
          solution: [['forward', 2], ['turnRight', 1], ['forward', 3]],
        },
        {
          id: 'pt-parque',
          icon: '🚲',
          title: 'A Ana no parque',
          text: 'A Ana foi ao parque com a avó. Levou a bicicleta vermelha e deu quatro voltas ao lago. No fim, comeram um gelado.',
          goal: 'Quantas voltas deu a Ana ao lago? Anda esse número de passos em frente. Depois acende as luzes da cor da bicicleta.',
          hint: 'Procura no texto um número e uma cor.',
          world: {},
          check: all(ahead(4), lit('red')),
          solution: [['forward', 4], ['lights', 'red']],
        },
      ],
      hard: [
        {
          id: 'pt-caminho',
          icon: '🗺️',
          title: 'O caminho da Rita',
          text: 'A Rita saiu de casa e andou dois passos em frente. Virou à direita e andou três passos. Virou outra vez à direita e andou um passo. Tinha chegado!',
          goal: 'Faz o robô seguir o caminho da Rita. Aonde é que ela chegou: à escola, à praia ou ao parque?',
          hint: 'Lê uma frase de cada vez e junta um bloco por cada coisa que a Rita fez.',
          world: { signs: [[4, 3, '🏫'], [4, 1, '🏖️'], [2, 2, '🌳']] },
          check: onSign('🏫'),
          solution: [['forward', 2], ['turnRight', 1], ['forward', 3], ['turnRight', 1], ['forward', 1]],
        },
        {
          id: 'pt-adjetivo',
          icon: '🐈',
          title: 'Como é o gato?',
          goal: 'Na frase «O gato preto dorme no sofá», que palavra diz como é o gato? É o adjetivo. Leva o robô até ela.',
          hint: 'Pergunta: «Como é o gato?» A resposta é a palavra que procuras.',
          world: { signs: [[0, 0, 'preto'], [2, 2, 'dorme'], [4, 4, 'sofá']] },
          check: onSign('preto'),
          solution: [['forward', 4], ['turnLeft', 1], ['forward', 1]],
        },
        {
          id: 'pt-sinonimo',
          icon: '😊',
          title: 'Quer dizer o mesmo',
          goal: 'Que palavra quer dizer o mesmo que «contente»? Leva o robô até ela.',
          hint: 'Quando recebes uma prenda ficas contente. De que outra maneira podes dizer isso?',
          world: { signs: [[1, 2, 'triste'], [4, 2, 'feliz'], [3, 0, 'zangado']] },
          check: onSign('feliz'),
          solution: [['forward', 2], ['turnRight', 1], ['forward', 3]],
        },
        {
          id: 'pt-tonica',
          icon: '📣',
          title: 'A sílaba mais forte',
          goal: 'Diz «boneca» em voz alta: bo-ne-ca. Qual é a sílaba que soa com mais força? É a sílaba tónica. Leva o robô até ela.',
          hint: 'Chama a boneca como se ela estivesse longe: «bo-NE-ca!»',
          world: { signs: [[0, 3, 'bo'], [2, 1, 'ne'], [5, 4, 'ca']] },
          check: onSign('ne'),
          solution: [['forward', 3], ['turnRight', 1], ['forward', 1]],
        },
        {
          id: 'pt-recado',
          icon: '🎉',
          title: 'O recado da festa',
          text: 'Querido robô, hoje há festa! Acende a luz amarela, espera um segundo e apaga a luz. Faz isto três vezes. No fim, toca duas notas.',
          goal: 'Lê o recado e faz o programa que ele pede.',
          hint: 'O que se faz três vezes vai dentro de um «Repetir 3 vezes». As notas ficam fora, no fim.',
          world: {},
          check: all(repeats(3, [['lights', 'yellow'], ['wait', 1], ['lightsOff']]), played(2)),
          solution: [['repeat', 3, [['lights', 'yellow'], ['wait', 1], ['lightsOff']]], ['note', 'do'], ['note', 'mi']],
        },
      ],
    },
  },
};

/** The exercises of a subject, year and level, each tagged with where it belongs. */
export function exercisesFor(subject, year, level) {
  const exercises = EXERCISES[subject.id]?.[year]?.[level.id] ?? [];
  return exercises.map((exercise) => tagged(exercise, subject, level));
}

/** Every exercise of a subject and year. */
export function exercisesOf(subject, year) {
  return LEVELS.flatMap((level) => exercisesFor(subject, year, level));
}

const tags = new Map();

/** Adds the subject and the banner label; the same object every time, so an exercise can be compared. */
function tagged(exercise, subject, level) {
  if (!tags.has(exercise)) tags.set(exercise, { ...exercise, subject: subject.id, label: `${subject.name} · ${level.name}` });
  return tags.get(exercise);
}
