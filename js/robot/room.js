import { sleep } from '../timing.js';

/** Thickness of the walls, in cm. */
const WALL_CM = 12;
/** The robot is about this wide around its turning point. */
const RADIUS_CM = 9;
/** The eyes see a cone: these are the rays cast inside it, in degrees. */
const CONE = [-12, -6, 0, 6, 12];
const SIGHT_CM = 350;
/** A smooth wall seen at more than this slant sends no echo back. */
const MOST_SLANT = 40;
/** A corner sends an echo back from any side: this close to the end of a wall counts as its corner. */
const CORNER_CM = 3;
const SPIN_DEGREES = 20;

/**
 * Pretend rooms for the robot on screen, in cm, with (0, 0) in the bottom-left corner.
 * `door` is an opening `width` wide in one `wall`, starting `at` cm along it; `boxes` are
 * pieces of furniture `[x, y, width, height]`; the robot starts at `start`, heading in degrees.
 */
export const ROOMS = [
  { name: 'A sala', width: 300, height: 240, door: { wall: 'top', at: 170, width: 90 }, start: { x: 90, y: 70, heading: 0 } },
  {
    name: 'O quarto',
    width: 320,
    height: 260,
    door: { wall: 'right', at: 60, width: 85 },
    boxes: [[40, 150, 70, 50]],
    start: { x: 170, y: 110, heading: 90 },
  },
  {
    name: 'A cozinha',
    width: 260,
    height: 300,
    door: { wall: 'left', at: 170, width: 95 },
    boxes: [[200, 0, 60, 90]],
    start: { x: 150, y: 150, heading: 180 },
  },
  { name: 'O escritório', width: 360, height: 220, door: { wall: 'bottom', at: 50, width: 80 }, start: { x: 250, y: 130, heading: 270 } },
];

/** The four sides of a rectangle, as segments `[x1, y1, x2, y2]`. */
function sides(x, y, width, height) {
  const [right, top] = [x + width, y + height];
  return [
    [x, y, right, y],
    [right, y, right, top],
    [right, top, x, top],
    [x, top, x, y],
  ];
}

/** Every wall and piece of furniture of a room, as segments. A door splits its wall in two. */
export function wallsOf({ width, height, door = null, boxes = [] }) {
  const walls = {
    bottom: (from, to) => sides(from, -WALL_CM, to - from, WALL_CM),
    top: (from, to) => sides(from, height, to - from, WALL_CM),
    left: (from, to) => sides(-WALL_CM, from, WALL_CM, to - from),
    right: (from, to) => sides(width, from, WALL_CM, to - from),
  };
  const lengths = { bottom: width, top: width, left: height, right: height };
  const segments = boxes.flatMap((box) => sides(...box));
  for (const [name, wall] of Object.entries(walls)) {
    // Walls that lie across the room reach past its corners, so that the corners are closed.
    const across = name === 'bottom' || name === 'top';
    const [from, to] = across ? [-WALL_CM, lengths[name] + WALL_CM] : [0, lengths[name]];
    if (door?.wall === name) segments.push(...wall(from, door.at), ...wall(door.at + door.width, to));
    else segments.push(...wall(from, to));
  }
  return segments;
}

const radians = (degrees) => (degrees * Math.PI) / 180;
/** Heading 0 points up the room (+y) and grows clockwise. */
const direction = (heading) => [Math.sin(radians(heading)), Math.cos(radians(heading))];

/**
 * The robot in a pretend room. It has the body an Explorer drives: `range`, `spin`, `quarter`
 * and `forward`. `pace` is the pause after each move, so it can be watched; `slip` makes moves
 * and turns come out up to that part too short or too long, as on a real floor.
 */
export class VirtualRoom {
  spinDegrees = SPIN_DEGREES;
  pose;
  segments;
  #room;
  #pace;
  #slip;
  #random;

  constructor(room, { pace = 0, slip = 0, random = Math.random } = {}) {
    this.#room = room;
    this.#pace = pace;
    this.#slip = slip;
    this.#random = random;
    this.pose = { ...room.start };
    this.segments = wallsOf(room);
  }

  /** True once the robot is on the other side of the walls. */
  get outside() {
    const { x, y } = this.pose;
    return x < 0 || y < 0 || x > this.#room.width || y > this.#room.height;
  }

  /** Distance in cm from the robot's centre to what its eyes see, or null. */
  async range() {
    const echoes = CONE.map((offset) => this.#echo(this.pose.heading + offset)).filter((echo) => echo !== null);
    return echoes.length > 0 && Math.min(...echoes) <= SIGHT_CM ? Math.min(...echoes) : null;
  }

  async spin(direction, signal) {
    await this.#turn(direction * SPIN_DEGREES, signal);
  }

  async quarter(direction, signal) {
    await this.#turn(direction * 90, signal);
  }

  /**
   * Drives `cm` forwards (backwards when negative), stopping at anything in the way, and turns
   * `bend` degrees to the right as it goes.
   */
  async forward(cm, signal, bend = 0) {
    const way = Math.sign(cm);
    const length = Math.abs(cm) * this.#slipped();
    const turn = (bend * this.#slipped()) / length;
    for (let left = length; left > 0; left -= 1) {
      const stride = Math.min(1, left);
      const heading = this.pose.heading + turn * stride;
      const [dx, dy] = direction(heading);
      const [x, y] = [this.pose.x + way * dx * stride, this.pose.y + way * dy * stride];
      if (this.segments.some((segment) => distanceTo(segment, x, y) < RADIUS_CM)) break;
      this.pose = { x, y, heading };
    }
    await this.#pause(signal);
  }

  async #turn(degrees, signal) {
    this.pose = { ...this.pose, heading: this.pose.heading + degrees * this.#slipped() };
    await this.#pause(signal);
  }

  /** No pause at all when there is nobody watching, as in the tests. */
  async #pause(signal) {
    if (this.#pace > 0) await sleep(this.#pace, signal);
  }

  #slipped() {
    return 1 + (this.#random() * 2 - 1) * this.#slip;
  }

  /** How far one ray goes before a wall sends it back, or null when no echo returns. */
  #echo(heading) {
    const [dx, dy] = direction(heading);
    let nearest = null;
    for (const [x1, y1, x2, y2] of this.segments) {
      const [wx, wy] = [x2 - x1, y2 - y1];
      const cross = dx * wy - dy * wx;
      if (Math.abs(cross) < 1e-9) continue; // the ray runs along the wall
      const [ox, oy] = [x1 - this.pose.x, y1 - this.pose.y];
      const along = (ox * wy - oy * wx) / cross; // distance along the ray
      const across = (ox * dy - oy * dx) / cross; // 0 to 1 along the wall
      if (along <= 0 || across < 0 || across > 1) continue;
      if (nearest === null || along < nearest.along) nearest = { along, across, length: Math.hypot(wx, wy), slant: Math.abs(cross) / Math.hypot(wx, wy) };
    }
    if (nearest === null) return null;
    const corner = Math.min(nearest.across, 1 - nearest.across) * nearest.length < CORNER_CM;
    return corner || nearest.slant >= Math.cos(radians(MOST_SLANT)) ? nearest.along : null;
  }
}

/** Distance from the point (x, y) to a segment. */
function distanceTo([x1, y1, x2, y2], x, y) {
  const [wx, wy] = [x2 - x1, y2 - y1];
  const along = Math.max(0, Math.min(1, ((x - x1) * wx + (y - y1) * wy) / (wx * wx + wy * wy)));
  return Math.hypot(x - x1 - along * wx, y - y1 - along * wy);
}
