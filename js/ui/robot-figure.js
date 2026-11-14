import { svg } from '../dom.js';

/**
 * The robot seen from above, centred on (0, 0) and facing up; about 90 units tall.
 * `setLights(left, right)` takes screen colours, or null for off.
 */
export function createRobotFigure() {
  const glows = [-11, 11].map((x) => svg('circle', { class: 'robot-glow', cx: x, cy: 6, r: 22 }));
  const leds = [-11, 11].map((x) => svg('circle', { class: 'robot-led', cx: x, cy: 6, r: 7 }));

  const group = svg(
    'g',
    { class: 'robot' },
    svg('rect', { class: 'robot-wheel', x: -39, y: -4, width: 13, height: 40, rx: 6 }),
    svg('rect', { class: 'robot-wheel', x: 26, y: -4, width: 13, height: 40, rx: 6 }),
    svg('path', { class: 'robot-nose', d: 'M -9 -36 L 0 -47 L 9 -36 Z' }),
    svg('rect', { class: 'robot-body', x: -29, y: -37, width: 58, height: 74, rx: 17 }),
    ...glows,
    ...[-12, 12].flatMap((x) => [
      svg('circle', { class: 'robot-eye', cx: x, cy: -18, r: 9.5 }),
      svg('circle', { class: 'robot-pupil', cx: x, cy: -20, r: 4.5 }),
    ]),
    ...leds,
    svg('path', { class: 'robot-smile', d: 'M -8 22 Q 0 29 8 22' }),
  );

  function setLights(left, right = left) {
    [left, right].forEach((color, side) => {
      leds[side].style.fill = color ?? '';
      glows[side].style.fill = color ?? '';
      glows[side].style.opacity = color ? 0.35 : 0;
    });
  }

  setLights(null);
  return { group, setLights };
}

/** A small standalone picture of the robot. */
export function createRobotPortrait() {
  const figure = createRobotFigure();
  const picture = svg('svg', { class: 'robot-portrait', viewBox: '-50 -52 100 100', 'aria-hidden': 'true' }, figure.group);
  return { element: picture, setLights: figure.setLights };
}
