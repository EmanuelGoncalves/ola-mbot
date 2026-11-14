import { BluetoothLink, listsAllDevices } from '../js/robot/bluetooth.js';
import { equal, ok, test } from './harness.js';

const noWait = async () => {};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const happened = (target, name) => new Promise((resolve) => target.addEventListener(name, resolve, { once: true }));

/**
 * A pretend Bluetooth with one robot. `write(bytes)` decides how each write goes: by default it
 * succeeds at once. `fails` makes that many connection attempts fail, after the first connection.
 */
function pretend({ write = async () => {} } = {}) {
  const robot = { asked: null, written: [], connects: 0, fails: 0 };
  const writer = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse(bytes) {
      await write(bytes);
      robot.written.push([...bytes]);
    },
  };
  const reader = Object.assign(new EventTarget(), { startNotifications: async () => {} });
  const service = { getCharacteristic: async (uuid) => (uuid.includes('ffe2') ? reader : writer) };
  const device = Object.assign(new EventTarget(), {
    gatt: {
      connected: false,
      async connect() {
        robot.connects += 1;
        if (robot.connects > 1 && robot.fails-- > 0) throw new Error('out of reach');
        device.gatt.connected = true;
        return { getPrimaryService: async () => service };
      },
      disconnect() {
        if (!device.gatt.connected) return;
        device.gatt.connected = false;
        device.dispatchEvent(new Event('gattserverdisconnected'));
      },
    },
  });
  robot.device = device;
  robot.bluetooth = {
    async requestDevice(options) {
      robot.asked = options;
      return device;
    },
  };
  return robot;
}

async function linked(options) {
  const robot = pretend(options);
  const link = new BluetoothLink({ bluetooth: robot.bluetooth, writeLimitMs: 30, wait: noWait });
  await link.connect();
  return { robot, link };
}

test('bluetooth: the search lists only mBots, or every device when asked', async () => {
  const robot = pretend();
  const link = new BluetoothLink({ bluetooth: robot.bluetooth });
  await link.connect();
  ok(robot.asked.filters.some((filter) => filter.namePrefix === 'Makeblock'), 'no filter by name');
  ok(robot.asked.filters.some((filter) => filter.services), 'no filter by service');
  await link.connect({ anyDevice: true });
  equal(robot.asked.acceptAllDevices, true);
  equal(robot.asked.filters, undefined);
});

test('bluetooth: an iPad lists every device from the start', () => {
  ok(listsAllDevices({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), 'an iPad');
  ok(listsAllDevices({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), 'an iPhone');
  ok(!listsAllDevices({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), 'a Mac');
  ok(!listsAllDevices({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }), 'an Android tablet');
});

test('bluetooth: while one write is on its way, only the newest packet of each kind waits', async () => {
  let release;
  const first = new Promise((resolve) => (release = resolve));
  let writes = 0;
  const { robot, link } = await linked({ write: () => (writes++ === 0 ? first : undefined) });
  const sent = [link.send([1], 'wheels'), link.send([2], 'wheels'), link.send([3], 'lights'), link.send([4], 'wheels'), link.send([5]), link.send([6])];
  release();
  await Promise.all(sent);
  equal(robot.written, [[1], [4], [3], [5], [6]]);
  equal(link.health.sent, 5);
});

test('bluetooth: a write that never ends does not hold up the next one', async () => {
  let writes = 0;
  const { robot, link } = await linked({ write: () => (writes++ === 0 ? new Promise(() => {}) : undefined) });
  await Promise.all([link.send([1]), link.send([2])]);
  equal(robot.written, [[2]]);
  equal(link.health.failed, 1);
  ok(link.connected, 'one slow write is not a stuck link');
});

test('bluetooth: a robot that goes away by itself is fetched back', async () => {
  const { robot, link } = await linked();
  const events = [];
  for (const name of ['repairing', 'repaired', 'disconnect']) link.addEventListener(name, () => events.push(name));
  robot.device.gatt.disconnect();
  await happened(link, 'repaired');
  ok(link.connected);
  equal(events, ['repairing', 'repaired']);
  equal(link.health.repairs, 1);
  await link.send([7]);
  equal(robot.written, [[7]]);
});

test('bluetooth: a link that takes nothing any more is started again', async () => {
  let stuck = true;
  const { robot, link } = await linked({ write: () => (stuck ? new Promise(() => {}) : undefined) });
  const repaired = happened(link, 'repaired');
  await Promise.all([link.send([1]), link.send([2])]);
  stuck = false;
  await repaired;
  await link.send([3]);
  equal(robot.written, [[3]]);
  equal(link.health.repairs, 1);
});

test('bluetooth: a robot that does not come back ends the connection', async () => {
  const { robot, link } = await linked();
  robot.fails = 10;
  const gone = happened(link, 'disconnect');
  robot.device.gatt.disconnect();
  await gone;
  ok(!link.connected);
  equal(robot.connects, 4, 'one connection and three tries to get it back:');
});

test('bluetooth: disconnecting on purpose is not repaired', async () => {
  const { robot, link } = await linked();
  const events = [];
  for (const name of ['repairing', 'disconnect']) link.addEventListener(name, () => events.push(name));
  link.disconnect();
  await tick();
  equal(events, ['disconnect']);
  equal(robot.connects, 1);
});
