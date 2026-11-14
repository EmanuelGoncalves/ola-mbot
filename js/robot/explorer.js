import { sleep } from '../timing.js';
import { EYES_AHEAD_CM, OUT_OF_SIGHT_CM } from './mbot.js';
import { measure } from './radar.js';

/** How wide a doorway is, in cm. */
export const DOOR = Object.freeze({ minCm: 80, maxCm: 100 });

/** What the robot is doing, in the order it does it. */
export const Phase = Object.freeze({ LOOK: 'look', APPROACH: 'approach', FOLLOW: 'follow', MEASURE: 'measure', THROUGH: 'through' });

/** The distance the robot keeps from the wall it follows. */
const FOLLOW_CM = 30;
/** When it is off that distance, it aims to be back on it this far ahead. */
const AIM_AHEAD_CM = 80;
/** It takes out this part of its steering error at each step, and bends a step by no more than this many degrees. */
const STEER_GAIN = 0.7;
const MOST_BEND = 12;
/** It does not drive closer than this to what is ahead. */
const FRONT_STOP_CM = 30;
/** A move shorter than this is not worth making. */
const SHORTEST_MOVE_CM = 5;
/** A look to the side this much further than the wall means the wall has an opening. */
const JUMP_CM = 35;
/** The eyes see a cone about 15° to each side, so an opening looks narrower than it is. */
const CONE_SPREAD = Math.tan((15 * Math.PI) / 180);
/** Standing in a doorway, each side of the frame is nearer than this. */
const FRAME_NEAR_CM = 75;
/** Measured from inside the frame, a doorway may be this much off its limits. */
const FRAME_SLACK_CM = 8;
/** When the frame is not in sight at the first try, the robot goes this much further in. */
const FRAME_RETRY_CM = 8;
/** How far it drives on after the doorway. */
const THROUGH_CM = 60;
const READINGS = 3;
const MOST_STEPS = 160;
/** Going round a room is four left turns; one more and the robot has seen every wall twice. */
const MOST_LEFT_TURNS = 5;
const SETTLE_MS = 200;

/**
 * Finds the way out of a room, for a robot with eyes that only look ahead and no way to measure
 * how far it went. It walks to the nearest wall and follows it, with the wall on its right,
 * turning to look at the wall after every step. Where the wall is missing it counts the steps:
 * an opening as wide as a door is the way out. It then stands in the doorway, measures it from
 * side to side, and goes through.
 *
 * `body` is what it drives: `range()` in cm from the robot's centre (or null), `spin(±1)` for a
 * short turn of `spinDegrees`, `quarter(±1)` for a quarter turn (+ is to the right) and
 * `forward(cm, signal, bend)`, which may turn `bend` degrees to the right on the way.
 * `stepCm` is the length of one step.
 *
 * `onEvent` hears `phase`, `pose` (where the robot thinks it is: cm from its start, heading in
 * degrees), `hit` (a point its eyes saw), `gap` (an opening that is not a door), `door`,
 * `closed` and `out`.
 */
export class Explorer {
  pose = { x: 0, y: 0, heading: 0 };
  #body;
  #stepCm;
  #door;
  #signal;
  #onEvent;
  #wait;
  /** How far off the last steering found the robot, in degrees. */
  #lastTurn = 0;

  constructor(body, { stepCm, door = DOOR, signal, onEvent = () => {}, wait = sleep } = {}) {
    this.#body = body;
    this.#stepCm = stepCm;
    this.#door = door;
    this.#signal = signal;
    this.#onEvent = onEvent;
    this.#wait = wait;
  }

  /** Resolves with `{ found: true, widthCm }`, or `{ found: false, reason }`: 'lost', 'none' or 'tired'. */
  async run() {
    if (!(await this.#findWall())) return { found: false, reason: 'lost' };
    return this.#followWall();
  }

  // --- The plan ---

  /** Looks all around, turns to the nearest thing and walks up to it. Ends with it on the right. */
  async #findWall() {
    const spins = Math.round(360 / this.#body.spinDegrees);
    for (let attempt = 0; attempt < 3; attempt++) {
      this.#say(Phase.LOOK);
      let nearest = null;
      for (let spin = 0; spin < spins; spin++) {
        const range = await this.#look();
        if (range !== null && (nearest === null || range < nearest.range)) nearest = { spin, range };
        await this.#spin(1);
      }
      if (nearest !== null) {
        await this.#spin(nearest.spin <= spins / 2 ? nearest.spin : nearest.spin - spins);
        this.#say(Phase.APPROACH);
        await this.#advance(nearest.range);
        await this.#quarter(-1);
        return true;
      }
      await this.#advance(3 * this.#stepCm); // nothing in sight: try from further on
    }
    return false;
  }

  async #followWall() {
    const widest = this.#door.maxCm + this.#stepCm;
    let wall = FOLLOW_CM; // how far the wall on the right was at the last look
    let gap = 0; // steps taken since the wall went missing
    let bend = 0; // how much the next step turns, to stay along the wall
    let leftTurns = 0;
    this.#say(Phase.FOLLOW);
    for (let step = 0; step < MOST_STEPS; step++) {
      const front = await this.#look();
      const room = front === null ? this.#stepCm : Math.min(this.#stepCm, front - FRONT_STOP_CM);
      if (room < SHORTEST_MOVE_CM) {
        // Something ahead: a corner of the room, or a piece of furniture. It becomes the wall to follow.
        // An opening that ends here may still be a door, right next to the corner.
        const out = gap > 0 ? await this.#tryOpening(gap, wall, ((gap - 1) / 2) * this.#stepCm) : null;
        if (out) return out;
        if (++leftTurns > MOST_LEFT_TURNS) return { found: false, reason: 'none' };
        await this.#quarter(-1);
        [wall, gap, bend, this.#lastTurn] = [front, 0, 0, 0];
        this.#say(Phase.FOLLOW);
        continue;
      }
      await this.#forward(room, bend);
      bend = 0;
      const side = await this.#lookRight();
      if (side === null || side > wall + JUMP_CM) {
        gap += room / this.#stepCm;
        this.#say(Phase.MEASURE);
        if (this.#widthOf(gap, wall) <= widest) continue;
        // By the count this is too wide for a door: the wall ends here. The robot goes round its end.
        const out = await this.#roundTheEnd(gap, wall);
        if (out) return out;
        leftTurns -= 1;
        [wall, gap] = [FOLLOW_CM, 0];
        this.#say(Phase.FOLLOW);
      } else if (gap > 0) {
        const out = await this.#tryOpening(gap, wall, ((gap + 1) / 2) * this.#stepCm);
        if (out) return out;
        [wall, gap] = [side, 0];
        this.#say(Phase.FOLLOW);
      } else {
        bend = await this.#steer(side, wall, room);
        wall = side;
      }
    }
    return { found: false, reason: 'tired' };
  }

  /**
   * The width of an opening passed in `gap` steps, `wall` cm away. The first and the last look
   * into it are half a step from its edges on average, and the cone of the eyes hides a little
   * of each edge.
   */
  #widthOf(gap, wall) {
    return gap * this.#stepCm + 2 * wall * CONE_SPREAD;
  }

  #doorSized(width, slack) {
    return width >= this.#door.minCm - slack && width <= this.#door.maxCm + slack;
  }

  /** `width` is null when the robot went into the opening and did not find a door frame around it. */
  #notADoor(width) {
    this.#onEvent({ type: 'gap', width, small: width !== null && width < this.#door.minCm });
    return null;
  }

  /**
   * Counting steps measures an opening only roughly, so any opening that is not clearly too
   * small is tried: the robot goes `back` to its middle, turns into it and stands in the doorway.
   * If it is not a door, it comes back to where it was.
   */
  async #tryOpening(gap, wall, back) {
    const width = this.#widthOf(gap, wall);
    if (width < this.#door.minCm - 2 * this.#stepCm) return this.#notADoor(width);
    this.#say(Phase.THROUGH);
    await this.#forward(-back);
    await this.#quarter(1);
    const reached = await this.#advance(wall + 4);
    const doorway = reached < wall - 10 ? { driven: 0 } : await this.#passDoorway();
    if (doorway.out) return doorway.out;
    if (reached < wall - 10) this.#onEvent({ type: 'closed' });
    await this.#forward(-(reached + doorway.driven));
    await this.#quarter(-1);
    await this.#forward(back);
    return null;
  }

  /**
   * At the end of a wall: back to just past the end, a turn to the right, and on past the wall's
   * line. A door counted too wide looks like the end of a wall, so on the line the robot checks
   * whether it is standing in a doorway.
   */
  async #roundTheEnd(gap, wall) {
    const pastTheEnd = (gap - 0.5) * this.#stepCm;
    await this.#forward(-Math.max(0, pastTheEnd - FOLLOW_CM));
    await this.#quarter(1);
    const reached = await this.#advance(wall + 4);
    if (reached >= wall - 10) {
      this.#say(Phase.THROUGH);
      const doorway = await this.#passDoorway();
      if (doorway.out) return doorway.out;
    }
    await this.#advance(FOLLOW_CM / 2);
    return null;
  }

  /**
   * Standing where a doorway may be, the robot looks to both sides: the two distances to the
   * frame add up to the true width. If that is a door, it drives through, and checks that the
   * frame is behind it: a passage that goes on between two walls is a corridor, not a door.
   * Returns `{ out }` when it is through, and always how far it has `driven`.
   */
  async #passDoorway() {
    let driven = 0;
    let frame = await this.#frame();
    if (frame === null) {
      // Not between the two sides of the frame yet: a little further in, and one more try.
      driven += await this.#advance(FRAME_RETRY_CM);
      frame = await this.#frame();
    }
    if (frame === null || !this.#doorSized(frame.width, FRAME_SLACK_CM)) {
      this.#notADoor(frame?.width ?? null);
      return { driven };
    }
    const widthCm = Math.round(frame.width);
    this.#onEvent({ type: 'door', widthCm });
    if (Math.abs(frame.offCentre) >= SHORTEST_MOVE_CM) {
      // To the middle of the doorway first, so as not to catch the frame on the way through.
      const side = Math.sign(frame.offCentre);
      await this.#quarter(side);
      await this.#forward(Math.abs(frame.offCentre));
      await this.#quarter(-side);
    }
    const beyond = await this.#advance(THROUGH_CM);
    driven += beyond;
    if (beyond < THROUGH_CM - 2 * SHORTEST_MOVE_CM) {
      this.#onEvent({ type: 'closed' });
      return { driven };
    }
    if ((await this.#frame()) !== null) {
      this.#notADoor(null);
      return { driven };
    }
    this.#onEvent({ type: 'out', widthCm });
    return { driven, out: { found: true, widthCm } };
  }

  /**
   * The doorway the robot is standing in: its `width`, and how far the robot is `offCentre`
   * (to the left when positive). Null when it is not between the two sides of a frame.
   */
  async #frame() {
    await this.#quarter(-1);
    const left = await this.#nearestLook();
    await this.#quarter(1);
    await this.#quarter(1);
    const right = await this.#nearestLook();
    await this.#quarter(-1);
    const between = left !== null && right !== null && left < FRAME_NEAR_CM && right < FRAME_NEAR_CM;
    return between ? { width: left + right, offCentre: (right - left) / 2 } : null;
  }

  /** The nearest of three looks, a spin apart: the true distance to a wall the robot is not squarely facing. */
  async #nearestLook() {
    const looks = [await this.#look()];
    await this.#spin(1);
    looks.push(await this.#look());
    await this.#spin(-2);
    looks.push(await this.#look());
    await this.#spin(1);
    const seen = looks.filter((range) => range !== null);
    return seen.length > 0 ? Math.min(...seen) : null;
  }

  /**
   * Keeps the robot along the wall. How much the wall came closer or went away over the last
   * move tells which way the robot is pointing; how far the wall is tells which way it should
   * point, to be back at the right distance a few steps on. The difference is returned, in
   * degrees to the right, for the next step to bend by. A large difference seen twice running is
   * put right at once with short spins; seen only once, it is more likely the edge of an opening
   * than the robot pointing the wrong way.
   */
  async #steer(side, wall, moved) {
    const degrees = (angle) => (angle * 180) / Math.PI;
    const pointing = degrees(Math.asin(Math.max(-1, Math.min(1, (side - wall) / moved)))); // + is away from the wall
    const wanted = -degrees(Math.atan((side - FOLLOW_CM) / AIM_AHEAD_CM));
    const turn = pointing - wanted;
    const large = 1.5 * this.#body.spinDegrees;
    const twice = Math.abs(this.#lastTurn) >= large && Math.sign(this.#lastTurn) === Math.sign(turn);
    const spins = twice ? Math.trunc(turn / large) : 0;
    this.#lastTurn = spins === 0 ? turn : 0;
    await this.#spin(spins);
    const rest = STEER_GAIN * (turn - spins * this.#body.spinDegrees);
    return Math.max(-MOST_BEND, Math.min(MOST_BEND, rest));
  }

  // --- Moves, with the robot keeping track of where it thinks it is ---

  /** Drives up to `cm` ahead in steps, looking before each one. Returns how far it went. */
  async #advance(cm) {
    let driven = 0;
    for (let step = 0; driven < cm && step < MOST_STEPS; step++) {
      const front = await this.#look();
      const room = Math.min(this.#stepCm, cm - driven, front === null ? Infinity : front - FRONT_STOP_CM);
      if (room < SHORTEST_MOVE_CM) break;
      await this.#forward(room);
      driven += room;
    }
    return driven;
  }

  /** Drives `cm` ahead (back when negative), turning `bend` degrees to the right on the way. */
  async #forward(cm, bend = 0) {
    if (cm === 0) return;
    this.#signal?.throwIfAborted();
    await this.#body.forward(cm, this.#signal, bend);
    const turn = ((this.pose.heading + bend / 2) * Math.PI) / 180;
    this.#moved({ x: this.pose.x + Math.sin(turn) * cm, y: this.pose.y + Math.cos(turn) * cm, heading: this.pose.heading + bend });
  }

  /** `count` short spins, to the right when positive. */
  async #spin(count) {
    for (let spin = 0; spin < Math.abs(count); spin++) {
      this.#signal?.throwIfAborted();
      await this.#body.spin(Math.sign(count), this.#signal);
      this.#moved({ heading: this.pose.heading + Math.sign(count) * this.#body.spinDegrees });
    }
  }

  async #quarter(direction) {
    this.#signal?.throwIfAborted();
    await this.#body.quarter(direction, this.#signal);
    this.#moved({ heading: this.pose.heading + 90 * direction });
  }

  #moved(change) {
    this.pose = { ...this.pose, ...change };
    this.#onEvent({ type: 'pose', pose: this.pose });
  }

  /** A steady look ahead: cm from the robot's centre, or null. */
  async #look() {
    this.#signal?.throwIfAborted();
    const range = await measure(this.#body, { signal: this.#signal, wait: this.#wait, readings: READINGS });
    if (range !== null) {
      const turn = (this.pose.heading * Math.PI) / 180;
      this.#onEvent({ type: 'hit', x: this.pose.x + Math.sin(turn) * range, y: this.pose.y + Math.cos(turn) * range });
    }
    return range;
  }

  async #lookRight() {
    await this.#quarter(1);
    const range = await this.#look();
    await this.#quarter(-1);
    return range;
  }

  #say(phase) {
    this.#onEvent({ type: 'phase', phase });
  }
}

/** The real mBot as a body for the Explorer; `tuning` gives its timed step, turns and radar spins. */
export function realBody(mbot, tuning) {
  const settle = (signal) => sleep(SETTLE_MS, signal);
  return {
    get spinDegrees() {
      return 360 / tuning.scanStops;
    },
    async range() {
      const cm = await mbot.readDistance();
      return cm > 0 && cm < OUT_OF_SIGHT_CM ? cm + EYES_AHEAD_CM : null;
    },
    async spin(direction, signal) {
      await mbot.rotate(direction, tuning.scanStepMs, signal);
      await settle(signal);
    },
    async quarter(direction, signal) {
      await mbot.turn(direction, signal);
      await settle(signal);
    },
    async forward(cm, signal, bend = 0) {
      await mbot.move(cm / tuning.cellCm, signal, bend);
      await settle(signal);
    },
  };
}
