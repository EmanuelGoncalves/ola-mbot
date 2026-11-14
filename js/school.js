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

// For the exercises that draw new numbers every round. `random` is a function like Math.random.
const between = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];

function shuffled(random, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** How many right answers, each with new numbers, earn the star of an exercise that has `make`. */
const ROUNDS = 3;

/** Squares for signs: spread out, and none below the robot, so each is reached by going up and then sideways. */
const SIGN_SPOTS = [[1, 1], [3, 0], [5, 1], [0, 2], [3, 2], [4, 3], [3, 4], [5, 4], [0, 0]];

/** The blocks that take the robot from the start to a square that is not below it. */
function pathTo([x, y]) {
  const up = WORLD.start.y - y;
  const across = x - WORLD.start.x;
  return [
    ...(up > 0 ? [['forward', up]] : []),
    ...(across !== 0 ? [[across > 0 ? 'turnRight' : 'turnLeft', 1], ['forward', Math.abs(across)]] : []),
  ];
}

/**
 * Three signs on random squares: the right `answer` and two of the `wrong` ones (never equal
 * to it, to each other, or below 1). Returns the `world`, the `check` and a `solution`.
 */
function signQuiz(random, answer, wrong) {
  const others = shuffled(random, [...new Set(wrong)].filter((value) => value !== answer && !(value < 1)));
  const [right, second, third] = shuffled(random, SIGN_SPOTS);
  return {
    world: { signs: [[...right, String(answer)], [...second, String(others[0])], [...third, String(others[1])]] },
    check: onSign(String(answer)),
    solution: pathTo(right),
  };
}

/** True when a «Repetir `times` vezes» holds a block for each of `wanted`, given as `[type, value]`. */
const repeats = (times, wanted) => (blocks) =>
  blocks.some(
    (block) =>
      block.type === 'repeat' &&
      block.value === times &&
      wanted.every(([type, value]) => block.body.some((inside) => inside.type === type && (value === undefined || inside.value === value))),
  );

/** Words and their syllables, for clapping. */
const SYLLABLES = [
  ['sapato', ['sa', 'pa', 'to']],
  ['bola', ['bo', 'la']],
  ['janela', ['ja', 'ne', 'la']],
  ['gato', ['ga', 'to']],
  ['borboleta', ['bor', 'bo', 'le', 'ta']],
  ['macaco', ['ma', 'ca', 'co']],
  ['telefone', ['te', 'le', 'fo', 'ne']],
  ['mesa', ['me', 'sa']],
  ['cavalo', ['ca', 'va', 'lo']],
  ['bicicleta', ['bi', 'ci', 'cle', 'ta']],
];

/**
 * Exercises are missions whose answer tells the robot what to do. The robot starts
 * on cell (1, 4), facing up. `text` is a short story to read first; `world.signs`
 * are squares with a word or a number (`[x, y, text]`); `solution` is one program
 * that solves it, in the compact form the tests use.
 *
 * An exercise with `make(random)` draws new numbers every round: `make` returns the
 * `goal`, `hint`, `world`, `check` and `solution` of one round, and the star is earned
 * after `rounds` right answers.
 */
const EXERCISES = {
  math: {
    2: {
      easy: [
        {
          id: 'mat-soma',
          icon: '🧮',
          title: 'Somar',
          rounds: ROUNDS,
          make(random) {
            const a = between(random, 2, 9);
            const b = between(random, 2, 9);
            return {
              goal: `Quanto é ${a} + ${b}? Leva o robô até ao quadrado com a resposta certa.`,
              hint: `Começa no ${Math.max(a, b)} e conta mais ${Math.min(a, b)} pelos dedos. Depois faz o caminho até esse número.`,
              ...signQuiz(random, a + b, [a + b - 1, a + b + 1, a + b - 2, a + b + 2]),
            };
          },
        },
        {
          id: 'mat-passos',
          icon: '🦶',
          title: 'Passos contados',
          rounds: ROUNDS,
          make(random) {
            const steps = between(random, 1, 4);
            const taken = between(random, 2, 6);
            return {
              goal: `O robô quer andar ${steps + taken} − ${taken} passos em frente. Quantos passos são? Faz o robô andar esse número de passos.`,
              hint: `Tens ${steps + taken} e tiras ${taken}. No bloco «Andar em frente» podes escolher o número de passos.`,
              world: {},
              check: ahead(steps),
              solution: [['forward', steps]],
            };
          },
        },
        {
          id: 'mat-dobro',
          icon: '✌️',
          title: 'O dobro',
          rounds: ROUNDS,
          make(random) {
            const number = between(random, 2, 9);
            return {
              goal: `Qual é o dobro de ${number}? Leva o robô até lá.`,
              hint: `O dobro é duas vezes o mesmo número: ${number} + ${number}.`,
              ...signQuiz(random, 2 * number, [2 * number - 1, 2 * number + 1, 2 * number + 2, number + 2]),
            };
          },
        },
        {
          id: 'mat-contar',
          icon: '🐸',
          title: 'Saltos de 2 em 2',
          rounds: ROUNDS,
          make(random) {
            const first = 2 * between(random, 1, 5);
            const jumps = [0, 2, 4, 6].map((jump) => first + jump);
            return {
              goal: `A rã salta de 2 em 2: ${jumps.join(', ')}… Em que número cai a seguir? Leva o robô até lá.`,
              hint: 'Junta mais 2 ao último número.',
              ...signQuiz(random, first + 8, [first + 7, first + 9, first + 10, first + 12]),
            };
          },
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
          rounds: ROUNDS,
          make(random) {
            const tens = between(random, 1, 4);
            const units = pick(random, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => digit !== tens));
            return {
              goal: `No número ${tens}${units}, qual é o algarismo das dezenas? Anda esse número de passos em frente.`,
              hint: `${tens}${units} são ${tens} ${tens === 1 ? 'dezena' : 'dezenas'} e ${units} ${units === 1 ? 'unidade' : 'unidades'}.`,
              world: {},
              check: ahead(tens),
              solution: [['forward', tens]],
            };
          },
        },
        {
          id: 'mat-tabuada',
          icon: '✋',
          title: 'As tabuadas',
          rounds: ROUNDS,
          make(random) {
            const table = pick(random, [2, 5, 10]);
            const times = between(random, 2, 9);
            const answer = times * table;
            return {
              goal: `Quanto é ${times} × ${table}? Leva o robô até à resposta.`,
              hint: `São ${times} vezes o ${table}. Conta de ${table} em ${table}, ${times} vezes.`,
              ...signQuiz(random, answer, [answer - table, answer + table, answer + 1, times + table]),
            };
          },
        },
        {
          id: 'mat-moedas',
          icon: '💶',
          title: 'O mealheiro',
          rounds: ROUNDS,
          make(random) {
            const big = pick(random, [20, 50]);
            const small = pick(random, [5, 10, 20].filter((coin) => coin !== big));
            const count = between(random, 2, 3);
            const total = big + count * small;
            return {
              goal: `A Marta tem uma moeda de ${big} cêntimos e ${count === 2 ? 'duas' : 'três'} moedas de ${small} cêntimos. Quantos cêntimos tem ao todo? Leva o robô até lá.`,
              hint: `Soma todas as moedas: ${[big, ...Array(count).fill(small)].join(' + ')}.`,
              ...signQuiz(random, total, [big + small, total + 10, total - 10, total + 5]),
            };
          },
        },
        {
          id: 'mat-centimetros',
          icon: '📏',
          title: 'Medir o caminho',
          rounds: ROUNDS,
          make(random) {
            const size = pick(random, [10, 20]);
            const squares = between(random, 1, 4);
            return {
              goal: `Neste exercício, cada quadrado do tapete mede ${size} cm. O tesouro está escondido ${size * squares} cm à frente do robô. Quantos quadrados são? Leva o robô até lá.`,
              hint: `Conta de ${size} em ${size} até chegares a ${size * squares}. Quantas vezes contaste?`,
              world: {},
              check: ahead(squares),
              solution: [['forward', squares]],
            };
          },
        },
        {
          id: 'mat-padrao',
          icon: '🧩',
          title: 'O padrão',
          rounds: ROUNDS,
          make(random) {
            const step = pick(random, [5, 10]);
            const first = step * between(random, 1, 4);
            const terms = [0, 1, 2, 3].map((term) => first + term * step);
            const answer = first + 4 * step;
            return {
              goal: `${terms.join(', ')}… Que número vem a seguir? Leva o robô até lá.`,
              hint: `Os números crescem de ${step} em ${step}.`,
              ...signQuiz(random, answer, [answer + step, answer + 1, answer - 1, answer + 2]),
            };
          },
        },
      ],
      hard: [
        {
          id: 'mat-pomar',
          icon: '🍎',
          title: 'As maçãs do avô',
          rounds: ROUNDS,
          make(random) {
            const apples = between(random, 20, 30);
            const first = between(random, 3, 9);
            const second = pick(random, [3, 4, 5, 6, 7, 8, 9].filter((number) => number !== first));
            const left = apples - first - second;
            return {
              goal: `O avô apanhou ${apples} maçãs. Deu ${first} à Inês e ${second} ao Tomás. Com quantas maçãs ficou? Leva o robô até à resposta.`,
              hint: `Vê primeiro quantas maçãs deu ao todo: ${first} + ${second}. Depois tira esse número a ${apples}.`,
              ...signQuiz(random, left, [apples - first, apples - second, left + 2, left - 1]),
            };
          },
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
          rounds: ROUNDS,
          make(random) {
            const half = pick(random, [4, 6, 8, 10]);
            return {
              goal: `A Sara tem ${2 * half} berlindes e dá metade ao irmão. Com quantos fica? Toca uma nota por cada berlinde com que a Sara fica.`,
              hint: `Metade de ${2 * half} é o número que somado a si próprio dá ${2 * half}. São muitas notas: põe 2 notas dentro de um «Repetir».`,
              world: {},
              check: played(half),
              solution: [['repeat', half / 2, [['note', 'do'], ['note', 'mi']]]],
            };
          },
        },
        {
          id: 'mat-maior',
          icon: '🏔️',
          title: 'O maior número',
          rounds: ROUNDS,
          make(random) {
            // Three numbers made of the same digits, so that the hundreds and then the tens must be compared.
            const hundreds = between(random, 2, 9);
            const low = between(random, 1, 7);
            const high = between(random, low + 1, 9);
            const largest = hundreds * 100 + high * 10 + low;
            const others = [hundreds * 100 + low * 10 + high, (hundreds - 1) * 100 + high * 10 + low];
            const [a, b, c] = shuffled(random, [largest, ...others]);
            return {
              goal: `Qual é o maior destes números: ${a}, ${b} ou ${c}? Leva o robô até ele.`,
              hint: 'Compara primeiro as centenas. Se forem iguais, compara as dezenas.',
              ...signQuiz(random, largest, others),
            };
          },
        },
        {
          id: 'mat-itinerario',
          icon: '🧭',
          title: 'O mapa do tesouro',
          rounds: ROUNDS,
          make(random) {
            const up = between(random, 2, 4);
            const across = between(random, 1, 4);
            const [right, near, below] = shuffled(random, ['💎', '👑', '🏆']);
            const x = WORLD.start.x + across;
            const y = WORLD.start.y - up;
            return {
              goal: `Neste exercício, cada quadrado do tapete mede 20 cm. O robô anda ${20 * up} cm em frente, vira à direita e anda ${20 * across} cm. A que tesouro chega? Leva-o até lá.`,
              hint: `Conta de 20 em 20: quantos quadrados são ${20 * up} cm? E ${20 * across} cm?`,
              world: { signs: [[x, y, right], [x - 1, y, near], [x, y + 1, below]] },
              check: onSign(right),
              solution: pathTo([x, y]),
            };
          },
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
          rounds: ROUNDS,
          make(random) {
            const [word, parts] = pick(random, SYLLABLES);
            return {
              goal: `Quantas sílabas tem a palavra «${word}»? Toca uma nota por cada sílaba.`,
              hint: `Diz a palavra devagar e bate uma palma por cada bocadinho: ${parts.join('… ')}.`,
              world: {},
              check: played(parts.length),
              solution: parts.map(() => ['note', 'do']),
            };
          },
        },
        {
          id: 'pt-rima',
          icon: '🎤',
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
