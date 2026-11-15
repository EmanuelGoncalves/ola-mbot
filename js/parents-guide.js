/**
 * The "Pais" tab: what the robot is and how the app works with it, for a grown-up to read.
 * Each section has a title, paragraphs and, at the end, an optional list.
 */
export const PARENTS_GUIDE = [
  {
    icon: '🤖',
    title: 'O robô por dentro',
    paragraphs: [
      'O mBot é um robô educativo da Makeblock. O «cérebro» é a placa mCore, feita a partir do Arduino Uno: tem um microcontrolador ATmega328P e funciona com 3,7 V a 6 V.',
    ],
    list: [
      'Dois motores, um em cada roda. Não têm sensores de rotação: o robô não sabe quanto andou nem quanto rodou.',
      'Sensor de ultrassons à frente (os «olhos»), na porta 3. Mede distâncias até cerca de 4 m, num cone com uns 30° de abertura.',
      'Dois sensores de linha por baixo, na porta 2. Distinguem o preto do branco.',
      'Na própria placa: duas luzes de cor (LED RGB), um besouro, um sensor de luz, um botão e um emissor e recetor de infravermelhos, para o comando.',
      'Um módulo Bluetooth, que é por onde esta aplicação fala com o robô.',
      'Quatro portas para acessórios. As portas 1 e 4 estão livres.',
    ],
  },
  {
    icon: '🧭',
    title: 'O que a aplicação consegue, e o que não consegue',
    paragraphs: [
      'Tudo o que a criança faz vai para o robô do ecrã e, se estiver ligado, para o mBot verdadeiro. O robô do ecrã é exato; o verdadeiro não é, e convém a criança saber porquê.',
    ],
    list: [
      'Andar e virar: como o robô não mede o que anda, um passo e um quarto de volta são tempos com os motores ligados. Mudam com o chão e com as pilhas. Em «Ligar ao robô → Afinar o robô», o mBot afina sozinho o passo (virado para uma parede lisa) e as voltas (com coisas à volta). Sem um mBot ligado, o robô do ecrã anda sempre depressa; com ele ligado, anda ao ritmo dele.',
      'Mapas: nos mapas de chão com quadrados de 15 cm, um passo é um quadrado. O mBot não sabe onde está: o robô do ecrã anda com ele e mostra o quadrado onde deve estar. Só acerta se o passo e as voltas estiverem afinados; no separador «Mapas», em baixo, afinam-se à vista, com os quadrados do mapa a servir de régua. O bloco «Apanhar» faz as luzes piscar: o mBot não tem mão.',
      'Virar sem sair do quadrado: o mBot roda em torno do meio das rodas, que ficam uns 4 cm atrás do meio do corpo. Por isso, antes de cada volta de um programa avança esses 4 cm, roda, e recua outra vez: assim o corpo fica no mesmo quadrado. A distância acerta-se em «Ligar ao robô → Afinar o robô».',
      'Olhos: o sensor vê bem uma parede de frente. Uma parede lisa vista de lado não devolve o som, e o robô não a vê. Coisas baixas, moles ou finas também escapam.',
      'Mapa da sala: o robô roda em rodadelas curtas e mede em cada uma. Dá mais de uma volta e descobre onde ela acabou ao ver outra vez as mesmas coisas. Se alguém passar por perto a meio, deixa de as reconhecer e avisa. É um mapa grosseiro: cada caixa pode ficar um quadrado ao lado.',
      'Explorar: o robô segue a parede, mede as aberturas e passa por uma porta com 80 cm a 1 m. É lento e falha às vezes: uma porta meio aberta, um tapete ou uma passagem larga enganam-no.',
      'Seguir a linha: funciona melhor devagar, porque cada olhar para a linha demora umas dezenas de milissegundos a ir e vir por Bluetooth. O botão C do comando faz o mesmo dentro do robô, e por isso mais depressa.',
      'Uma coisa de cada vez: enquanto toca uma nota, o robô não faz mais nada, e segura cada nota cerca de 1,3 vezes o tempo pedido (medido num mBot verdadeiro). A aplicação pede notas mais curtas por isso e espera por ele; a música atrasa um pouco o resto.',
      'Parar tudo: o botão vermelho lá em cima acaba com o que estiver a correr e põe o robô a zeros. Se o robô ficar a apitar sem parar, só desligando e ligando no interruptor.',
    ],
  },
  {
    icon: '💾',
    title: 'O firmware',
    paragraphs: [
      'O firmware é o programa que vive dentro do robô. Esta aplicação fala com o programa de fábrica (versão 06.01.x), o mesmo que faz funcionar o comando e os modos A, B e C.',
      'Se o robô for programado com o mBlock ou com o Arduino, esse programa substitui o de fábrica, e nem o comando nem esta aplicação funcionam. Para o repor, liga-se o robô ao computador por USB e, no mBlock, escolhe-se repor o programa de fábrica (ou atualizar o firmware).',
      'As ordens são pequenos pacotes de bytes: ff 55, o comprimento, um número de ordem, a ação (1 ler, 2 fazer, 4 parar tudo), o aparelho e os dados. A linha de comandos desta página mostra-os e deixa enviá-los à mão.',
    ],
  },
  {
    icon: '🔋',
    title: 'Pilhas e bateria',
    paragraphs: [
      'O mBot não consegue dizer quanta carga lhe resta: o programa de fábrica não tem nenhuma ordem para ler a bateria, e esta aplicação não a pode mostrar.',
      'As pilhas recarregáveis servem. Cada uma dá 1,2 V em vez de 1,5 V, por isso com quatro o robô recebe cerca de 4,8 V em vez de 6 V e anda mais devagar. A placa aceita também uma bateria de lítio de 3,7 V, na ficha própria.',
    ],
    list: [
      'Sinais de pilhas fracas: os passos ficam mais curtos e as voltas incompletas, o robô arranca aos soluços, a ligação Bluetooth cai ou o robô reinicia (toca as três notas) quando os motores arrancam.',
      'Depois de trocar ou carregar as pilhas, afine outra vez o passo e as voltas.',
      '«Afinar o passo sozinho» serve de teste: se o robô anda cada vez menos no mesmo tempo, as pilhas estão a acabar.',
    ],
  },
  {
    icon: '🧰',
    title: 'Outras formas de programar o robô',
    paragraphs: ['Esta aplicação é uma de várias maneiras de dar ordens ao mBot.'],
    list: [
      'mBlock, da Makeblock: programação por blocos e em Python, no computador ou no tablet.',
      'Arduino IDE: a placa é compatível com o Arduino Uno. Liga-se por USB e programa-se em C++, com a biblioteca da Makeblock.',
      'Porta série: com o cabo USB, o programa de fábrica aceita as mesmas ordens desta aplicação, a 115 200 baud. Qualquer linguagem que fale com uma porta série, como o Python, as pode enviar.',
      'Atenção: carregar outro programa no robô apaga o de fábrica.',
    ],
  },
  {
    icon: '🔌',
    title: 'Acessórios que fazem diferença',
    paragraphs: ['Com o programa de fábrica, o robô já sabe usar alguns acessórios da Makeblock nas portas livres. A aplicação precisaria de um pequeno acrescento para cada um.'],
    list: [
      'Matriz de LED 8×16: uma cara para o robô, com olhos, números e palavras curtas.',
      'Servo: um braço, uma bandeira ou uma garra simples.',
      'Sensor de som ou de movimento: bater palmas para arrancar, ou um robô de guarda.',
      'Giroscópio: é o que resolveria as voltas, mas o programa de fábrica não o lê. Seria preciso outro firmware, carregado a partir do computador.',
    ],
  },
];
