import { Beeper } from './audio.js';
import { el } from './dom.js';
import { MissionBoard } from './missions.js';
import { RobotHub } from './robot/hub.js';
import { Simulator } from './robot/simulator.js';
import { loadTuning } from './robot/tuning.js';
import { load, save } from './storage.js';
import { T } from './texts.js';
import { Tutorial } from './tutorial.js';
import { Connection } from './ui/connection.js';
import { DriveView } from './ui/drive-view.js';
import { LearnView } from './ui/learn-view.js';
import { MissionsView } from './ui/missions-view.js';
import { ProgramView } from './ui/program-view.js';
import { RemoteView } from './ui/remote-view.js';
import { createRobotPortrait } from './ui/robot-figure.js';

/** Tab ids double as the page's #hash, so a tab can be bookmarked. */
const TABS = [
  { id: 'aprender', icon: '🎓', label: T.tabs.learn },
  { id: 'programar', icon: '🧩', label: T.tabs.program },
  { id: 'conduzir', icon: '🕹️', label: T.tabs.drive },
  { id: 'missoes', icon: '⭐', label: T.tabs.missions },
  { id: 'comando', icon: '📡', label: T.tabs.remote },
];

function start() {
  document.documentElement.lang = 'pt-PT';

  const tuning = loadTuning();
  const beeper = new Beeper();
  beeper.enabled = load('sound', true);
  const simulator = new Simulator({ tuning, beeper });
  const hub = new RobotHub(simulator);
  const board = new MissionBoard();
  const tutorial = new Tutorial();

  const showMissions = () => showTab('missoes');
  const programView = new ProgramView({ hub, simulator, board, tutorial, onPlayLesson: playLesson, onShowMissions: showMissions });
  const driveView = new DriveView({ hub, simulator });
  const views = {
    aprender: new LearnView({ tutorial, onPlay: playLesson, onShowMissions: showMissions }).element,
    programar: programView.element,
    conduzir: driveView.element,
    missoes: new MissionsView({ board, onPlay: playMission }).element,
    comando: new RemoteView().element,
  };

  const stopRobot = () => {
    programView.stop();
    driveView.stop();
  };
  const connection = new Connection({ hub, tuning, onOpen: stopRobot });

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

  /** A mission and a lesson are never open together. */
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
