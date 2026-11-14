# Olá, mBot!

A web app in European Portuguese (PT-PT) for an eight-year-old to program a
[Makeblock mBot](https://www.makeblock.com/pages/mbot-robot-kit) with blocks.
It has five tabs:

| Tab | What it is |
| --- | --- |
| **Aprender** | The tutorial: seven short lessons. The robot says what to do and points at what to tap. |
| **Programar** | Tap blocks to build a program, then watch the robot run it on the mat. |
| **Conduzir** | Drive with arrows, let the robot's eyes stop it before it bumps, switch the lights, play the buzzer like a piano, or tap one of twelve jingles. |
| **Missões** | Eight gentle challenges with hints and stars. No timers, no failing. |
| **Comando** | The infrared remote that comes in the box, button by button. |

Every command goes to the robot drawn on screen and, when one is connected over
Bluetooth, to the real mBot too. Without a robot the app is fully usable.

## Run it

No build step and no dependencies: plain HTML, CSS and ES modules.

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. The modules need a web server, so opening
`index.html` straight from the disk does not work.

## Connect a real mBot

The robot must be the Bluetooth version and run the factory firmware (06.01.x),
the one that makes the remote work.

| Device | Browser |
| --- | --- |
| Mac, Windows, Chromebook, Android | Chrome or Edge |
| iPad, iPhone | [Bluefy](https://apps.apple.com/app/id1492822055), a free browser with Web Bluetooth. Safari has none. |

Web Bluetooth only works on `https://` pages (and on `localhost`), so for the
iPad the app is published with GitHub Pages from the `main` branch:
<https://emanuelgoncalves.github.io/ola-mbot/>. Pushing to `main` updates it.

The mBot has no wheel sensors: a step and a quarter turn are timed motor runs.
"Ligar ao robô → Afinar o robô" has two sliders to match them to your floor and
batteries. It also has two switches for a robot that drives or turns the wrong
way, which happens when the two motors were plugged into each other's sockets.

## Layout

```
index.html            entry page
artifact.html         the same page as a fragment, for publishing as a Claude Artifact
css/                  tokens (both themes), base, and one file per area
js/main.js            builds the page and switches tabs
js/texts.js           interface text (PT-PT)
js/tutorial.js        the tutorial's lessons, step by step
js/missions.js        the missions and the star board
js/jingles.js         short tunes for the buzzer, and their player
js/remote-guide.js    what each remote button does
js/program/           block catalogue, program model, interpreter
js/robot/             protocol, Bluetooth link, real mBot, simulator, hub
js/ui/                one module per tab, plus shared pieces
tests/                browser tests
```

A lesson is data: each step has its text, what to point at and a test that
tells when it is done. `js/ui/coach.js` shows the first step that is not done
yet, so a child who undoes something is simply walked through it again.

The interpreter talks to one `RobotHub`, which forwards each command to the
`Simulator` and to the `MBot`. Both implement the same commands: `move`, `turn`,
`moveUntilObstacle`, `setLights`, `playTone`, `obstacleAhead`, `drive`, `stop`.

## Tests

With the server running, open <http://localhost:8765/tests/>. The page runs the
protocol, program, interpreter and simulator tests, plays a reference solution
for every mission, checks that every lesson can be finished and that the
jingles use only the piano's notes.

## Protocol

Packets follow the factory firmware's parser
([source](https://github.com/Makeblock-official/Makeblock-Libraries/blob/master/examples/Firmware_For_mBlock/mbot_factory_firmware/mbot_factory_firmware.ino)):
`ff 55 <length> <index> <action> <device> <data…>`.

| Command | Bytes |
| --- | --- |
| Both wheels | `ff 55 07 00 02 05 <left int16> <right int16>` (left is mirrored) |
| Both LEDs | `ff 55 09 00 02 08 07 02 00 <r> <g> <b>` |
| Buzzer | `ff 55 07 00 02 22 <hz int16> <ms int16>` |
| Read distance | `ff 55 04 <index> 01 01 03` → `ff 55 <index> 02 <float32> 0d 0a` |

Bluetooth service `ffe1`; write to characteristic `ffe3`, notifications on `ffe2`.
