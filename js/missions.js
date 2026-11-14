import { load, save } from './storage.js';

const uses = (blocks, type) => blocks.some((block) => block.type === type);
const count = (blocks, type) => blocks.filter((block) => block.type === type).length;

/** True when the blocks of `type` show `values` in this order, with anything in between. */
function inOrder(blocks, type, values) {
  let next = 0;
  for (const block of blocks) {
    if (block.type === type && block.value === values[next]) next += 1;
  }
  return next === values.length;
}

/**
 * Missions for the robot on screen. The robot starts on cell (1, 4), facing up.
 * `check` receives every block of the program and the simulator after the run.
 */
export const MISSIONS = [
  {
    id: 'first-steps',
    icon: '🐣',
    title: 'Primeiros passos',
    goal: 'Leva o robô até à estrela.',
    hint: 'A estrela está 3 quadrados à frente. Usa o bloco «Andar em frente» e escolhe 3 passos.',
    world: { goal: { x: 1, y: 1 } },
    check: (blocks, simulator) => simulator.atGoal(),
  },
  {
    id: 'corner',
    icon: '↪️',
    title: 'Virar a esquina',
    goal: 'A estrela está ao virar da esquina. Consegues lá chegar?',
    hint: 'Anda 2 passos em frente, vira à direita e anda mais 3 passos.',
    world: { goal: { x: 4, y: 2 } },
    check: (blocks, simulator) => simulator.atGoal(),
  },
  {
    id: 'traffic-light',
    icon: '🚦',
    title: 'O semáforo',
    goal: 'Faz um semáforo: luz vermelha, depois amarela, depois verde.',
    hint: 'Usa três blocos «Acender as luzes»: vermelho, amarelo e verde. Põe um «Esperar» entre eles, para dar tempo de ver cada cor.',
    world: {},
    check: (blocks) => inOrder(blocks, 'lights', ['red', 'yellow', 'green']) && uses(blocks, 'wait'),
  },
  {
    id: 'square',
    icon: '🟧',
    title: 'O quadrado',
    goal: 'Desenha um quadrado e volta ao sítio de onde partiste.',
    hint: 'Um quadrado tem 4 lados iguais. Dentro de um «Repetir 4 vezes» põe: andar em frente e virar à direita.',
    world: {},
    check: (blocks, simulator) => uses(blocks, 'repeat') && simulator.atStart() && simulator.stepsMoved >= 4,
  },
  {
    id: 'musician',
    icon: '🎶',
    title: 'Pequeno músico',
    goal: 'Compõe uma música com 5 notas ou mais.',
    hint: 'Experimenta Dó, Ré, Mi, Fá, Sol. Podes repetir notas de que gostes.',
    world: {},
    check: (blocks) => count(blocks, 'note') >= 5,
  },
  {
    id: 'box',
    icon: '🧱',
    title: 'Cuidado com a caixa',
    goal: 'Há uma caixa no caminho! Usa os olhos do robô para parar antes dela e chega à estrela.',
    hint: 'Começa com «Andar até ver um obstáculo». Depois vira à direita e anda 3 passos.',
    world: { obstacles: [[1, 1]], goal: { x: 4, y: 2 } },
    check: (blocks, simulator) => uses(blocks, 'untilObstacle') && simulator.atGoal(),
  },
  {
    id: 'maze',
    icon: '🗺️',
    title: 'O labirinto',
    goal: 'Dá a volta às caixas e encontra a estrela.',
    hint: 'Sobe 3 passos, vira à direita, anda 2 passos, vira à direita outra vez e desce 3 passos.',
    world: {
      obstacles: [[2, 2], [2, 3], [2, 4], [4, 2], [4, 3], [4, 4]],
      goal: { x: 3, y: 4 },
    },
    check: (blocks, simulator) => simulator.atGoal(),
  },
  {
    id: 'dance',
    icon: '🕺',
    title: 'A dança do robô',
    goal: 'Inventa uma dança com voltas, luzes e música, que se repita.',
    hint: 'Dentro de um «Repetir» põe uma luz, uma nota e uma volta. Depois muda as cores à tua maneira!',
    world: {},
    check: (blocks) =>
      uses(blocks, 'repeat') &&
      uses(blocks, 'lights') &&
      uses(blocks, 'note') &&
      (uses(blocks, 'turnLeft') || uses(blocks, 'turnRight')),
  },
];

const MOST_REDRAWS = 8;

/**
 * Keeps the mission or school exercise being played, the stars already earned and,
 * for the exercises that draw new numbers every round, how many rounds were got right.
 * Fires `change`. `random` and `store` can be replaced in tests.
 */
export class MissionBoard extends EventTarget {
  active = null;
  /** The round being played was already got right; it does not count twice. */
  roundSolved = false;
  #random;
  #store;
  #stars;
  #rounds;
  #roundsMade = 0;

  constructor({ random = Math.random, store = { load, save } } = {}) {
    super();
    this.#random = random;
    this.#store = store;
    this.#stars = new Set(store.load('stars', []));
    this.#rounds = store.load('rounds', {});
  }

  get starCount() {
    return this.starsIn(MISSIONS);
  }

  /** How many of these missions or exercises have their star. */
  starsIn(missions) {
    return missions.filter((mission) => this.#stars.has(mission.id)).length;
  }

  hasStar(mission) {
    return this.#stars.has(mission.id);
  }

  /** Rounds got right so far, up to the `rounds` the exercise asks for. */
  roundsSolved(mission) {
    return this.hasStar(mission) ? mission.rounds : Math.min(mission.rounds, this.#rounds[mission.id] ?? 0);
  }

  start(mission) {
    this.active = this.#round(mission);
    this.#changed();
  }

  /** Draws new numbers for the exercise being played. */
  nextRound() {
    if (!this.active?.make) return;
    this.active = this.#round(this.active);
    this.#changed();
  }

  leave() {
    if (!this.active) return;
    this.active = null;
    this.#changed();
  }

  /**
   * Counts a right answer and returns true when the star is earned: at once for a mission,
   * after `rounds` different rounds for an exercise with new numbers every round.
   */
  award(mission) {
    if (mission.make && !this.hasStar(mission)) {
      if (!this.roundSolved) this.#rounds[mission.id] = this.roundsSolved(mission) + 1;
      this.#store.save('rounds', this.#rounds);
    }
    this.roundSolved = true;
    if (!mission.make || this.#rounds[mission.id] >= mission.rounds) this.#stars.add(mission.id);
    this.#store.save('stars', [...this.#stars]);
    this.#changed();
    return this.hasStar(mission);
  }

  /** An exercise with `make` gets its numbers here; `round` tells one round from the next. */
  #round(mission) {
    this.roundSolved = false;
    if (!mission.make) return mission;
    // Drawn again when the numbers come out the same as in the round before.
    let made = mission.make(this.#random);
    for (let tries = 0; made.goal === mission.goal && tries < MOST_REDRAWS; tries++) made = mission.make(this.#random);
    return { ...mission, ...made, round: ++this.#roundsMade };
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }
}
