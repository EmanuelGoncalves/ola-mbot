const WHITE = '#ffffff';
const GREEN = '#4cd98a';
const BLUE = '#4c9bff';
const YELLOW = '#ffd23c';
const RED = '#ff5a5f';

/**
 * What each button of the mBot's infrared remote does with the factory program
 * (firmware 06.01.x). `lights` is what the robot's two LEDs show: [left, right].
 */
export const REMOTE_TOPICS = {
  modeA: {
    title: 'Botão A: modo de conduzir',
    text: 'As luzes do robô ficam brancas e ele fica à espera das tuas ordens. Agora usa as setas para o guiar. Quando ligas o mBot, ele já acorda neste modo.',
    lights: [WHITE, WHITE],
  },
  modeB: {
    title: 'Botão B: modo de fugir aos obstáculos',
    text: 'As luzes ficam verdes e o robô anda sozinho. Quando os «olhos» veem uma coisa à frente, ele roda e segue por outro lado. Dá-lhe espaço no chão e experimenta pôr a mão à frente dele! Para o parar, carrega em A.',
    lights: [GREEN, GREEN],
  },
  modeC: {
    title: 'Botão C: modo de seguir a linha',
    text: 'As luzes ficam azuis e o robô segue uma linha preta no chão, com os dois sensores que tem por baixo. Põe-no em cima da pista em forma de 8 que veio na caixa, ou faz uma pista com fita-cola preta num chão claro. Para o parar, carrega em A.',
    lights: [BLUE, BLUE],
  },
  up: {
    title: 'Seta para cima: andar em frente',
    text: 'O robô anda em frente enquanto carregares no botão. Quando largas, ele para. As luzes ficam amarelas. Só funciona no modo A.',
    lights: [YELLOW, YELLOW],
  },
  down: {
    title: 'Seta para baixo: andar para trás',
    text: 'O robô anda para trás enquanto carregares no botão. As luzes ficam vermelhas, como as luzes de marcha-atrás. Só funciona no modo A.',
    lights: [RED, RED],
  },
  left: {
    title: 'Seta para a esquerda: rodar',
    text: 'O robô roda para a esquerda sem sair do sítio, e acende a luz desse lado. Só funciona no modo A.',
    lights: [YELLOW, null],
  },
  right: {
    title: 'Seta para a direita: rodar',
    text: 'O robô roda para a direita sem sair do sítio, e acende a luz desse lado. Só funciona no modo A.',
    lights: [null, YELLOW],
  },
  slow: {
    title: 'Números 1, 2 e 3: devagar',
    text: 'Os números mudam a velocidade. Com 1, 2 ou 3 o robô anda devagar: é a melhor velocidade para começar. Cada número toca uma nota diferente!',
    lights: [null, null],
  },
  medium: {
    title: 'Números 4, 5 e 6: velocidade média',
    text: 'Com 4, 5 ou 6 o robô anda a uma velocidade média. Cada número toca uma nota diferente!',
    lights: [null, null],
  },
  fast: {
    title: 'Números 7, 8 e 9: depressa',
    text: 'Com 7, 8 ou 9 o robô anda depressa. Escolhe um sítio com muito espaço! Cada número toca uma nota diferente.',
    lights: [null, null],
  },
  spare: {
    title: 'Botão livre',
    text: 'Este botão ainda não faz nada. Fica guardado para quando criares os teus próprios programas.',
    lights: [null, null],
  },
};

const key = (face, topic, kind, name = face) => ({ face, topic, kind, name });
const speedTopic = (number) => (number <= 3 ? 'slow' : number <= 6 ? 'medium' : 'fast');
const numberRow = (numbers) => numbers.map((number) => key(String(number), speedTopic(number), 'number'));

/** The remote's buttons, row by row, as they are on the real one. */
export const REMOTE_ROWS = [
  [key('A', 'modeA', 'mode'), key('B', 'modeB', 'mode'), key('C', 'modeC', 'mode')],
  [key('D', 'spare', 'spare'), key('▲', 'up', 'arrow', 'Seta para cima'), key('E', 'spare', 'spare')],
  [key('◀', 'left', 'arrow', 'Seta para a esquerda'), key('⚙', 'spare', 'spare', 'Roda dentada'), key('▶', 'right', 'arrow', 'Seta para a direita')],
  [key('0', 'spare', 'spare'), key('▼', 'down', 'arrow', 'Seta para baixo'), key('F', 'spare', 'spare')],
  numberRow([1, 2, 3]),
  numberRow([4, 5, 6]),
  numberRow([7, 8, 9]),
];

export const REMOTE_TEXT = {
  title: 'O comando do mBot',
  intro: 'O comando fala com o robô por uma luz invisível, tal como o comando da televisão. Toca num botão do desenho para saberes o que ele faz.',
  startTitle: 'Para começar',
  start: [
    'Liga o mBot no interruptor. Ele toca três notas e pisca as luzes.',
    'Aponta o comando para o robô.',
    'Carrega em A e, depois, nas setas.',
  ],
  helpTitle: 'Se o comando não funcionar',
  help: [
    'Vê se o comando tem pilha: leva uma pilha redonda e fina, do tipo CR2025. Se o comando é novo, tira a tira de plástico que protege a pilha.',
    'Chega-te mais perto e aponta bem para o robô. A luz do comando não atravessa paredes nem móveis.',
    'Com muito sol ou luzes fortes, o robô vê pior o comando.',
    'Carrega em A: as setas só funcionam nesse modo.',
    'Também podes mudar de modo no botão pequenino que está em cima do robô.',
  ],
  parents:
    'Para os pais: se o mBot tiver sido programado com outro programa (por exemplo, no mBlock), o comando só volta a funcionar depois de repor o programa de fábrica na aplicação da Makeblock.',
};
