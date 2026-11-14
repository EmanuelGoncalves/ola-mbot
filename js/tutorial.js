import { load, save } from './storage.js';

/*
 * A lesson is a list of small steps. Each step has:
 *   text    what the robot asks the child to do
 *   target  what to point at: ['chip', type], ['block', id], ['option', value],
 *           ['tool', name], ['slot', containerId] or ['run'], or a function
 *           of the state that returns one of these (or null)
 *   done    a test of the state; the first step that is not done is the current one
 *   retry   (optional) what to say when a run ended and the step is still not done
 *
 * The state is { blocks, top, selected, cursor, ran, robot }: every block, the
 * top-level blocks, the block that is open, where the next block goes, whether
 * the program ran since its last change, and the robot on screen.
 */

const has = (state, type, value) => state.blocks.some((block) => block.type === type && (value === undefined || block.value === value));
const count = (state, type, value) => state.blocks.filter((block) => block.type === type && (value === undefined || block.value === value)).length;
const find = (state, type, test = () => true) => state.blocks.find((block) => block.type === type && test(block));
const opened = (state, type) => state.selected?.type === type;
const holds = (container, type) => Boolean(container?.body.some((block) => block.type === type));

const RUN = ['run'];
const chip = (type) => ['chip', type];
const head = (block) => (block ? ['block', block.id] : null);

/** Points at a block and, once it is open, at one of its choices. */
const choose = (state, block, value) => (block && state.selected === block ? ['option', value] : head(block));

/** Points at a palette block when the next block will land inside `container`, else at the container's slot. */
const addInside = (state, container, type) => (state.cursor.parentId === container.id ? chip(type) : ['slot', container.id]);

export const LESSONS = [
  {
    id: 'first-program',
    icon: '🚀',
    title: 'O primeiro programa',
    about: 'Põe o robô a andar com um só bloco.',
    steps: [
      {
        text: 'Um programa é uma lista de ordens para o robô. Vamos dar-lhe a primeira! Toca no bloco azul «Andar em frente».',
        target: chip('forward'),
        done: (state) => has(state, 'forward'),
      },
      {
        text: 'Boa! O bloco saltou para «O meu programa». Agora carrega no botão verde «Começar».',
        target: RUN,
        done: (state) => state.ran,
      },
    ],
    end: 'O robô andou um passo, tal como mandaste. Acabaste de fazer o teu primeiro programa!',
  },
  {
    id: 'steps',
    icon: '⭐',
    title: 'Até à estrela',
    about: 'Escolhe quantos passos o robô dá.',
    world: { goal: { x: 1, y: 1 } },
    steps: [
      {
        text: 'A estrela está 3 quadrados à frente do robô. Começa por juntar o bloco «Andar em frente».',
        target: chip('forward'),
        done: (state) => has(state, 'forward'),
      },
      {
        text: 'Um passo não chega para lá chegar. Toca no bloco que está no teu programa, para veres as escolhas.',
        target: (state) => head(find(state, 'forward')),
        done: (state) => opened(state, 'forward') || has(state, 'forward', 3),
      },
      {
        text: 'Escolhe «3 passos».',
        target: ['option', 3],
        done: (state) => has(state, 'forward', 3),
      },
      {
        text: 'Carrega em «Começar» e vê o robô ir até à estrela.',
        target: RUN,
        done: (state) => state.ran && state.robot.atGoal(),
        retry: 'Quase! O robô tem de parar em cima da estrela, que está 3 quadrados à frente.',
      },
    ],
    end: 'Chegaste à estrela! Já sabes escolher quantos passos o robô dá.',
  },
  {
    id: 'turn',
    icon: '↪️',
    title: 'Virar a esquina',
    about: 'A ordem dos blocos é importante.',
    world: { goal: { x: 3, y: 2 } },
    steps: [
      {
        text: 'A estrela está ao virar da esquina. Primeiro o robô sobe: junta «Andar em frente».',
        target: chip('forward'),
        done: (state) => has(state, 'forward'),
      },
      {
        text: 'Toca nesse bloco e escolhe «2 passos».',
        target: (state) => choose(state, find(state, 'forward'), 2),
        done: (state) => has(state, 'forward', 2),
      },
      {
        text: 'Agora o robô tem de se virar para o lado da estrela. Junta «Virar à direita».',
        target: chip('turnRight'),
        done: (state) => has(state, 'turnRight'),
      },
      {
        text: 'Falta o último bocado do caminho. Junta outro «Andar em frente» e escolhe também «2 passos».',
        target: (state) => (count(state, 'forward') < 2 ? chip('forward') : choose(state, find(state, 'forward', (block) => block.value !== 2), 2)),
        done: (state) => count(state, 'forward', 2) >= 2,
      },
      {
        text: 'O robô faz os blocos por ordem, de cima para baixo. Carrega em «Começar»!',
        target: RUN,
        done: (state) => state.ran && state.robot.atGoal(),
        retry: 'Quase! A ordem certa é: andar 2 passos, virar à direita, andar 2 passos.',
      },
    ],
    end: 'Viraste a esquina! O robô faz sempre os blocos por ordem, de cima para baixo.',
  },
  {
    id: 'lights-sound',
    icon: '💡',
    title: 'Luzes e música',
    about: 'Acende as luzes e toca uma melodia.',
    steps: [
      {
        text: 'O mBot tem duas luzes que mudam de cor. Junta «Acender as luzes».',
        target: chip('lights'),
        done: (state) => has(state, 'lights'),
      },
      {
        text: 'Toca nesse bloco e escolhe a cor verde.',
        target: (state) => choose(state, find(state, 'lights'), 'green'),
        done: (state) => has(state, 'lights', 'green'),
      },
      {
        text: 'Agora a música! Junta três blocos «Tocar a nota».',
        target: chip('note'),
        done: (state) => count(state, 'note') >= 3,
      },
      {
        text: 'As notas estão todas em Dó. Toca numa delas e escolhe outra nota, como o Mi.',
        target: (state) => choose(state, find(state, 'note'), 'mi'),
        done: (state) => new Set(state.blocks.filter((block) => block.type === 'note').map((block) => block.value)).size >= 2,
      },
      {
        text: 'Carrega em «Começar» para veres a luz e ouvires a música.',
        target: RUN,
        done: (state) => state.ran,
      },
    ],
    end: 'Que bonito! Se não ouviste nada, vê se o som 🔊 está ligado, lá em cima.',
  },
  {
    id: 'fix',
    icon: '🔧',
    title: 'Arranjar um programa',
    about: 'Muda blocos de sítio e tira os que estão a mais.',
    world: { goal: { x: 2, y: 3 } },
    program: [{ type: 'turnRight' }, { type: 'forward' }, { type: 'forward' }, { type: 'backward' }],
    steps: [
      {
        text: 'Este programa tem dois enganos e o robô não chega à estrela. Ele devia andar primeiro e virar depois. Toca no bloco «Virar à direita».',
        target: (state) => head(find(state, 'turnRight')) ?? chip('turnRight'),
        done: (state) => opened(state, 'turnRight') || turnsSecond(state),
      },
      {
        text: 'Usa «Subir» ou «Descer» até ele ficar logo a seguir ao primeiro «Andar em frente».',
        target: (state) => ['tool', state.top[0]?.type === 'turnRight' ? 'down' : 'up'],
        done: turnsSecond,
      },
      {
        text: 'Boa! Agora o último bloco, «Andar para trás», está a mais. Toca nele.',
        target: (state) => head(find(state, 'backward')),
        done: (state) => opened(state, 'backward') || !has(state, 'backward'),
      },
      {
        text: 'Carrega em «Tirar».',
        target: ['tool', 'remove'],
        done: (state) => !has(state, 'backward'),
      },
      {
        text: 'Carrega em «Começar» e vê se o robô já chega à estrela.',
        target: RUN,
        done: (state) => state.ran && state.robot.atGoal(),
        retry: 'Ainda não. O programa certo é: andar em frente, virar à direita, andar em frente.',
      },
    ],
    end: 'Arranjaste o programa! Enganos acontecem a toda a gente, até aos programadores a sério. O que conta é procurá-los e corrigi-los.',
  },
  {
    id: 'repeat',
    icon: '🔁',
    title: 'Repetir',
    about: 'Desenha um quadrado com poucos blocos.',
    steps: [
      {
        text: 'Para desenhar um quadrado, o robô anda e vira 4 vezes. Em vez de 8 blocos, usamos o «Repetir». Junta-o ao programa.',
        target: chip('repeat'),
        done: (state) => has(state, 'repeat'),
      },
      {
        text: 'O «Repetir» é como uma caixa: o robô faz várias vezes o que estiver lá dentro. Põe lá dentro um «Andar em frente».',
        target: (state) => addInside(state, find(state, 'repeat'), 'forward'),
        done: (state) => holds(find(state, 'repeat'), 'forward'),
      },
      {
        text: 'Põe também lá dentro um «Virar à direita».',
        target: (state) => addInside(state, find(state, 'repeat'), 'turnRight'),
        done: (state) => holds(find(state, 'repeat'), 'turnRight'),
      },
      {
        text: 'Um quadrado tem 4 lados. Toca no bloco «Repetir» e escolhe «4 vezes».',
        target: (state) => choose(state, find(state, 'repeat'), 4),
        done: (state) => has(state, 'repeat', 4),
      },
      {
        text: 'Carrega em «Começar» e vê o quadrado a aparecer!',
        target: RUN,
        done: (state) => state.ran && state.robot.atStart() && state.robot.stepsMoved >= 4,
        retry: 'Quase! Dentro do «Repetir 4 vezes» ficam só dois blocos: andar em frente e virar à direita.',
      },
    ],
    end: 'Um quadrado com 3 blocos em vez de 8! Repetir poupa muito trabalho.',
  },
  {
    id: 'eyes',
    icon: '👀',
    title: 'Os olhos do robô',
    about: 'Para o robô antes de bater numa caixa.',
    world: { obstacles: [[1, 1]], goal: { x: 3, y: 2 } },
    steps: [
      {
        text: 'Há uma caixa no caminho! O robô tem dois «olhos» à frente que veem os obstáculos. Junta «Andar até ver um obstáculo».',
        target: chip('untilObstacle'),
        done: (state) => has(state, 'untilObstacle'),
      },
      {
        text: 'O robô vai parar mesmo antes da caixa. Depois tem de se virar: junta «Virar à direita».',
        target: chip('turnRight'),
        done: (state) => has(state, 'turnRight'),
      },
      {
        text: 'Para acabar, junta «Andar em frente» e escolhe «2 passos».',
        target: (state) => choose(state, find(state, 'forward'), 2) ?? chip('forward'),
        done: (state) => has(state, 'forward', 2),
      },
      {
        text: 'Carrega em «Começar» e vê os olhos do robô a trabalhar.',
        target: RUN,
        done: (state) => state.ran && state.robot.atGoal(),
        retry: 'Quase! Experimenta esta ordem: andar até ver um obstáculo, virar à direita, andar 2 passos.',
      },
    ],
    end: 'O robô parou sozinho antes da caixa! No mBot verdadeiro, os olhos são um sensor que mede a distância com sons que nós não ouvimos.',
  },
];

/** Lesson "fix": the turn sits right after the first step forward. */
function turnsSecond(state) {
  return state.top[0]?.type === 'forward' && state.top[1]?.type === 'turnRight';
}

/** Keeps the lesson being followed and the lessons already finished. Fires `change`. */
export class Tutorial extends EventTarget {
  active = null;
  #finished = new Set(load('lessons', []));

  get finishedCount() {
    return LESSONS.filter((lesson) => this.#finished.has(lesson.id)).length;
  }

  isFinished(lesson) {
    return this.#finished.has(lesson.id);
  }

  /** The first lesson not finished yet, or null when all are. */
  get next() {
    return LESSONS.find((lesson) => !this.#finished.has(lesson.id)) ?? null;
  }

  start(lesson) {
    this.active = lesson;
    this.#changed();
  }

  leave() {
    if (!this.active) return;
    this.active = null;
    this.#changed();
  }

  finish(lesson) {
    this.#finished.add(lesson.id);
    save('lessons', [...this.#finished]);
    this.#changed();
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }
}
