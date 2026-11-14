import { Beeper } from './audio.js';
import { el } from './dom.js';
import { MissionBoard } from './missions.js';
import { RobotHub } from './robot/hub.js';
import { Simulator } from './robot/simulator.js';
import { loadTuning } from './robot/tuning.js';
import { load, save } from './storage.js';
import { T } from './texts.js';
import { sleep } from './timing.js';
import { Tutorial } from './tutorial.js';
import { Connection } from './ui/connection.js';
import { DriveView } from './ui/drive-view.js';
import { LearnView } from './ui/learn-view.js';
import { MissionsView } from './ui/missions-view.js';
import { ParentsView } from './ui/parents-view.js';
import { ProgramView } from './ui/program-view.js';
import { RemoteView } from './ui/remote-view.js';
import { createRobotPortrait } from './ui/robot-figure.js';
import { SchoolView } from './ui/school-view.js';

/** How long the stop button says that everything has stopped. */
const STOPPED_NOTE_MS = 1200;

/** Tab ids double as the page's #hash, so a tab can be bookmarked. */
const TABS = [
  { id: 'aprender', icon: '🎓', label: T.tabs.learn },
  { id: 'programar', icon: '🧩', label: T.tabs.program },
  { id: 'conduzir', icon: '🕹️', label: T.tabs.drive },
  { id: 'missoes', icon: '⭐', label: T.tabs.missions },
  { id: 'escola', icon: '🎒', label: T.tabs.school },
  { id: 'comando', icon: '📡', label: T.tabs.remote },
  { id: 'pais', icon: '🛠️', label: T.tabs.parents },
];

function start() {
  document.documentElement.lang = 'pt-PT';

  const tuning = loadTuning();
  const beeper = new Beeper();
  beeper.enabled = load('sound', true);
  const simulator = new Simulator({ tuning, beeper });
  const hub = new RobotHub(simulator, tuning);
  const board = new MissionBoard();
  const tutorial = new Tutorial();

  const showMissions = () => showTab('missoes');
  /** Goes back to the list a mission or a school exercise came from. */
  const showMore = (mission) => showTab(mission.subject ? 'escola' : 'missoes');
  const freePlay = () => {
    board.leave();
    tutorial.leave();
  };
  const programView = new ProgramView({ hub, simulator, tuning, board, tutorial, onPlayLesson: playLesson, onShowMissions: showMissions, onShowMore: showMore });
  const driveView = new DriveView({ hub, simulator, tuning, onFreePlay: freePlay });
  const views = {
    aprender: new LearnView({ tutorial, onPlay: playLesson, onShowMissions: showMissions }).element,
    programar: programView.element,
    conduzir: driveView.element,
    missoes: new MissionsView({ board, onPlay: playMission }).element,
    escola: new SchoolView({ board, onPlay: playMission }).element,
    comando: new RemoteView().element,
    pais: null, // made below, once there is a connection to show
  };

  const stopRobot = () => {
    programView.stop();
    driveView.stop();
  };
  const connection = new Connection({ hub, tuning, onOpen: stopRobot });
  views.pais = new ParentsView({ hub, tuning, link: connection.link }).element;
  /** The way out when the robot is doing too much at once: ends every activity and starts the robot afresh. */
  const stopAll = () => {
    stopRobot();
    return hub.reset();
  };
  // The size of a square may have changed in the tuning.
  connection.dialog.addEventListener('close', () => {
    programView.showScale();
    driveView.showScale();
  });

  const tabButtons = TABS.map((tab) =>
    el(
      'button',
      { class: 'tab', type: 'button', role: 'tab', id: `tab-${tab.id}`, 'aria-controls': `view-${tab.id}`, onClick: () => showTab(tab.id) },
      el('span', { class: 'tab-icon', 'aria-hidden': 'true', text: tab.icon }),
      tab.label,
    ),
  );
  const panels = TABS.map((tab) =>
    el('main', { class: 'view', role: 'tabpanel', id: `view-${tab.id}`, 'aria-labelledby': `tab-${tab.id}`, hidden: true }, views[tab.id]),
  );

  let currentTab = null;

  /** Shows a tab; leaving a tab stops the robot. An unknown id opens the lessons, or Programar once they are done. */
  function showTab(id) {
    const known = TABS.some((tab) => tab.id === id);
    const index = TABS.findIndex((tab) => tab.id === (known ? id : tutorial.next ? 'aprender' : 'programar'));
    const tab = TABS[index];
    if (tab.id === currentTab) return;
    currentTab = tab.id;
    stopRobot();
    panels.forEach((panel, i) => (panel.hidden = i !== index));
    tabButtons.forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
    if (location.hash.slice(1) !== tab.id) location.hash = tab.id;
    window.scrollTo(0, 0);
  }

  /** Opens a mission or a school exercise; neither is ever open together with a lesson. */
  function playMission(mission) {
    tutorial.leave();
    board.start(mission);
    showTab('programar');
  }

  /** Opens a lesson from its first step, or goes back to the one in progress. */
  function playLesson(lesson) {
    const inProgress = tutorial.active === lesson && !tutorial.isFinished(lesson);
    if (!inProgress) {
      board.leave();
      tutorial.leave();
      tutorial.start(lesson);
    }
    showTab('programar');
  }

  document.getElementById('app').append(
    el(
      'header',
      { class: 'top-bar' },
      el('div', { class: 'brand' }, createRobotPortrait().element, el('h1', { text: T.appName })),
      el('nav', { class: 'tabs', role: 'tablist' }, tabButtons),
      stopAllButton(stopAll),
      soundToggle(beeper),
      connection.button,
    ),
    ...panels,
    connection.dialog,
  );

  // Browsers keep sound off until the first tap or key press.
  for (const gesture of ['pointerdown', 'keydown']) document.addEventListener(gesture, () => beeper.unlock());
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRobot();
  });
  showTab(location.hash.slice(1));
}

/** The red button of the top bar. It says "Parado!" for a moment, so the child sees it worked. */
function stopAllButton(stopAll) {
  const label = el('span', { class: 'stop-all-label', text: T.stopAll.label });
  const button = el('button', { class: 'button button-stop stop-all', type: 'button', 'aria-label': T.stopAll.hint, onClick: stop }, el('span', { 'aria-hidden': 'true', text: '✋' }), label);
  async function stop() {
    button.disabled = true;
    label.textContent = T.stopAll.done;
    button.setAttribute('aria-label', T.stopAll.done);
    await Promise.all([stopAll(), sleep(STOPPED_NOTE_MS)]);
    label.textContent = T.stopAll.label;
    button.setAttribute('aria-label', T.stopAll.hint);
    button.disabled = false;
  }
  return button;
}

function soundToggle(beeper) {
  const button = el('button', { class: 'button sound-button', type: 'button', onClick: toggle });
  function toggle() {
    beeper.enabled = !beeper.enabled;
    save('sound', beeper.enabled);
    draw();
  }
  function draw() {
    button.textContent = beeper.enabled ? '🔊' : '🔇';
    button.setAttribute('aria-label', beeper.enabled ? T.sound.on : T.sound.off);
    button.setAttribute('aria-pressed', String(beeper.enabled));
  }
  draw();
  return button;
}

start();
