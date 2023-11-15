// TODO: restarting?
// TODO: fix swiping: no two fingers, better swipe
// TODO: better grid highlighting on slide

import jsConfetti from "js-confetti";
import { Howl, Howler } from "howler";
import SwipeHandler from "swipehandler";

const sw = new SwipeHandler();
const confetti = new jsConfetti();
Howler.volume(0);

let hasWon = false;

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const soundToggle = document.createElement("div");
soundToggle.id = "sound";
soundToggle.className = "mute";
soundToggle.role = "button";

document.body.appendChild(soundToggle);

let soundOn = !soundToggle.classList.contains("mute");

soundToggle.addEventListener("click", () => {
	soundToggle.classList.toggle("mute");

	soundOn = !soundToggle.classList.contains("mute");

	if (soundOn) {
		// ios needs to fire audio on user event such as click (initially)
		gun.play();
		Howler.volume(1);
	} else {
		Howler.volume(0);
	}
});

canvas.style.background = "#191929";

const openColor = "#ACE";
const coveredColor = "#3A6";
const portalColor = (x: string | number) => `hsl(${Number(x) * 110}, 60%, 60%)`;

console.clear();

const OPEN = ".";
const COVERED = "=";
const WALL = "#";
const EMPTY = " ";
const PLAYER = "1";

enum Dir {
	UP,
	RIGHT,
	DOWN,
	LEFT,
}

let cellSize = innerWidth < 600 ? 15 : 20;
let fontSize = cellSize === 20 ? 18 : 14;
const bump = new Howl({
	src: ["/assets/ridley-bump.webm", "/assets/ridley-bump.mp3"],
	volume: 0.3,
});
const swoosh = new Howl({
	src: ["/assets/portal-swoosh.webm", "/assets/portal-swoosh.mp3"],
	volume: 0.1,
});
const gun = new Howl({
	src: ["/assets/ridley-gun.webm", "/assets/ridley-gun.mp3"],
	volume: 0.1,
});
const wewon = new Howl({
	src: ["/assets/wewon.webm", "/assets/wewon.m4a"],
	volume: 0.4,
});

const MAZE = `
.......    ...#...
...1....   ........
..    ..   ..    ..
..    ..   ..    ..
3.......   ....3..
......2    2......
..   ...   ..   ...
..    ..   ..    ..
..    ..   ........
..    ..   #......
`;

class Vec {
	x: number;
	y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}
	add(vec: Vec) {
		return new Vec(this.x + vec.x, this.y + vec.y);
	}
	sub(vec: Vec) {
		return new Vec(this.x - vec.x, this.y - vec.y);
	}
	floor() {
		return new Vec(Math.floor(this.x), Math.floor(this.y));
	}
	round() {
		return new Vec(Math.round(this.x), Math.round(this.y));
	}
	ceil() {
		return new Vec(Math.ceil(this.x), Math.ceil(this.y));
	}
	isEmpty() {
		return this.x === 0 && this.y === 0;
	}
	toString() {
		return `${this.x},${this.y}`;
	}
	ease(timeSince: number, diffVec: Vec, endTime: number) {
		return new Vec(
			diffVec.x === 0
				? this.x
				: easeInQuad(timeSince, this.x, diffVec.x, endTime),
			diffVec.y === 0
				? this.y
				: easeInQuad(timeSince, this.y, diffVec.y, endTime),
		);
	}
	getSign() {
		const x = this.x === 0 ? 0 : this.x > 0 ? 1 : -1;
		const y = this.y === 0 ? 0 : this.y > 0 ? 1 : -1;

		return new Vec(x, y);
	}
	// try to reconcile animating the ball between cells
	isCloseTo(vec: Vec) {
		const diff = new Vec(Math.abs(this.x - vec.x), Math.abs(this.y - vec.y));

		return diff.x < 0.2 && diff.y < 0.2;
	}
}

class Cell {
	r: number;
	c: number;
	v: string | number;

	constructor(r: number, c: number, v: string | number) {
		this.r = r;
		this.c = c;
		this.v = v;
	}

	update() {}

	draw() {
		switch (this.v) {
			case WALL:
				return;
			case OPEN:
				ctx.fillStyle = openColor;
				break;
			case PLAYER:
			case COVERED:
				ctx.fillStyle = coveredColor;
				break;
			default:
				ctx.fillStyle = portalColor(this.v);
		}

		ctx.strokeStyle = "rgba(0,0,0,0.1)";

		ctx.fillRect(this.c * cellSize, this.r * cellSize, cellSize, cellSize);
		ctx.strokeRect(this.c * cellSize, this.r * cellSize, cellSize, cellSize);
	}
	isPortal() {
		return [WALL, OPEN, PLAYER, COVERED].indexOf(this.v as string) === -1;
	}
	cover() {
		if (!this.isPortal()) {
			this.v = COVERED;
		}
	}
	toVec() {
		return new Vec(this.r, this.c);
	}
}

class Player {
	maze: Maze;
	r: number;
	c: number;
	/** cells / sec */
	speed: number = 50;
	pos: Vec;
	next: Vec;
	dirty: boolean = false;
	moveStartTime: number;
	moveStartPos: Vec;
	state: "idle" | "moving" = "idle";
	diff: Vec;
	dir: number;
	timeToNext: number = 0;

	constructor(m: Maze, r = 0, c = 0) {
		this.maze = m;
		this.r = r;
		this.c = c;
		this.pos = new Vec(r, c);
		this.next = this.pos;
		this.moveStartTime = 0;
		this.moveStartPos = this.pos;
		this.diff = new Vec(0, 0);
		this.dir = Dir.UP;
	}
	slide(dir: number) {
		if (this.state === "idle") {
			this.dir = dir;
			this.next = this.maze.getNext(dir);
		}
	}
	update(d: number) {
		if (this.state === "idle") {
			const diff = this.next.sub(this.pos);

			if (diff.isEmpty()) {
				this.dirty = false;
				return;
			}

			// moving
			swoosh.play();
			this.moveStartTime = d;
			this.moveStartPos = this.pos;
			this.dirty = true;
			this.state = "moving";
			this.diff = diff;

			// cells / cells / second * 1000ms
			this.timeToNext = (Math.abs(diff.x || diff.y) / this.speed) * 1000;
		}

		const timeDiff = d - this.moveStartTime;

		if (timeDiff >= this.timeToNext) {
			// stopped
			this.pos = this.next;
			this.state = "idle";

			// TODO: what if we went through a portal?
			const portal = this.maze.isPortal(this.pos);
			if (portal) {
				// move to neighbor portal
				this.pos = portal.partner?.toVec() || new Vec(0, 0);
				gun.play();
				this.slide(this.dir);
			} else {
				this.dirty = false;
				bump.play();
			}
		} else {
			this.pos = this.moveStartPos.ease(timeDiff, this.diff, this.timeToNext);
		}

		// TODO: figure out how to color cells
		this.maze.playerMoved(this.pos);
	}

	draw() {
		ctx.save();
		ctx.translate(
			this.pos.y * cellSize + fontSize / 1.5,
			this.pos.x * cellSize + fontSize / 1.5,
		);
		// The size of the emoji is set with the font
		ctx.font = `${fontSize}px serif`;
		// use these alignment properties for "better" positioning
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		// a bomb!!
		ctx.fillText("💣", 0, 0);
		ctx.restore();
	}
}

class Maze {
	details: string;
	portals: Record<string, Cell[]> = {};
	height = 0;
	width = 0;
	player = new Player(this);
	grid = new Map<string, Cell>();

	constructor(details: string) {
		this.details = details;
		this.reset();
	}

	reset() {
		const details = this.details;
		const trimmed = details.trim();

		const rows = trimmed.split(/\n/g);

		this.portals = {};
		this.height = rows.length;
		// maybe variable width?
		this.width = 0;
		// maybe no player?
		this.player = new Player(this);

		// build grid
		this.grid = new Map();
		for (let r = 0; r < this.height; r++) {
			const row = rows[r];
			this.width = Math.max(this.width, row.length);
			for (let c = 0; c < row.length; c++) {
				let v = row[c];

				if (v == null || v === EMPTY) {
					// lazy?
					v = WALL;
				}

				const cell = new Cell(r, c, v);
				this.grid.set(`${r},${c}`, cell);
				if (v === PLAYER) {
					this.player = new Player(this, r, c);
				} else if (cell.isPortal()) {
					if (!this.portals[v]) {
						this.portals[v] = [];
					}
					this.portals[v].push(cell);
				}
			}
		}
	}

	getCell(vec: Vec) {
		return this.grid.get(`${vec}`);
	}

	canMove(cell?: Cell) {
		const v = cell?.v;
		return v != null && v !== WALL;
	}

	playerMoved(vec: Vec) {
		// vec may be between cells
		const ceil = this.grid.get(vec.ceil().toString());
		const floor = this.grid.get(vec.floor().toString());
		if (ceil) {
			ceil.cover();
		}
		if (floor) {
			floor.cover();
		}

		for (const [, cell] of this.grid) {
			if (cell.v === OPEN) {
				// we haven't won
				return;
			}
		}
		if (!hasWon) {
			// if not: we win
			wewon.play();
			wewon.once("end", function () {
				hasWon = false;
			});
			hasWon = true;
		}
		confetti.addConfetti();
	}

	getNext(dir: Dir) {
		let vec = new Vec(0, 0);
		switch (dir) {
			case Dir.UP:
				vec = new Vec(-1, 0);
				break;
			case Dir.RIGHT:
				vec = new Vec(0, 1);
				break;
			case Dir.DOWN:
				vec = new Vec(1, 0);
				break;
			case Dir.LEFT:
				vec = new Vec(0, -1);
				break;
		}

		let cur = this.player.pos;
		let next = cur.add(vec);
		let nextCell = this.getCell(next);

		while (this.canMove(nextCell)) {
			cur = next;

			if (nextCell?.isPortal()) {
				// stay at portal for now
				return cur;
			}

			next = cur.add(vec);
			nextCell = this.getCell(next);
		}

		return cur;
	}

	isPortal(vec: Vec) {
		const cell = this.getCell(vec);

		return cell?.isPortal()
			? {
					partner: this.portals[cell.v].find((c) => c !== cell),
			  }
			: null;
	}

	isDirty() {
		return this.player.dirty;
	}

	update(d: number) {
		this.grid.forEach((rc) => {
			rc.update();
		});

		this.player.update(d);
	}

	draw() {
		this.grid.forEach((rc) => {
			rc.draw();
		});
		this.player.draw();
	}
}

const maze = new Maze(MAZE);

const update = () => {
	const now = Date.now();

	maze.update(now);
};

const draw = () => {
	maze.draw();
};

const loop = () => {
	ctx.clearRect(0, 0, innerWidth, innerHeight);
	update();
	draw();

	if (maze.isDirty()) {
		requestAnimationFrame(loop);
	}
};

/**
 START EVENTS
*/

document.addEventListener("keydown", (e) => {
	switch (e.key) {
		case "ArrowUp":
			maze.player.slide(Dir.UP);
			break;
		case "ArrowDown":
			maze.player.slide(Dir.DOWN);
			break;
		case "ArrowLeft":
			maze.player.slide(Dir.LEFT);
			break;
		case "ArrowRight":
			maze.player.slide(Dir.RIGHT);
			break;
		default:
			return;
	}
	loop();
});

// swipe
sw.onSwipe((e) => {
	switch (e.dir) {
		case "up":
			maze.player.slide(Dir.UP);
			break;
		case "down":
			maze.player.slide(Dir.DOWN);
			break;
		case "left":
			maze.player.slide(Dir.LEFT);
			break;
		case "right":
			maze.player.slide(Dir.RIGHT);
			break;
		default:
			return;
	}
	loop();
});

document.addEventListener("contextmenu", () => {
	maze.reset();
	loop();
});

const resize = () => {
	canvas.width = innerWidth * devicePixelRatio;
	canvas.height = innerHeight * devicePixelRatio;
	canvas.style.width = `${innerWidth}px`;
	canvas.style.height = `${innerHeight}px`;

	ctx.scale(devicePixelRatio, devicePixelRatio);

	// very silly responsive designs here
	cellSize = innerWidth < 600 ? 15 : 20;
	fontSize = cellSize === 20 ? 18 : 14;

	const mazeHeight = (maze.height * cellSize) / 2;
	const mazeWidth = (maze.width * cellSize) / 2;

	ctx.translate(innerWidth / 2 - mazeWidth, innerHeight / 2 - mazeHeight);

	loop();
};

window.addEventListener("resize", resize);

/**
 END EVENTS
*/

document.body.appendChild(canvas);

resize();
loop();

// t = Time - Amount of time that has passed since the beginning of the animation. Usually starts at 0 and is slowly increased using a game loop or other update function.
// b = Beginning value - The starting point of the animation. Usually it's a static value, you can start at 0 for example.
// c = Change in value - The amount of change needed to go from starting point to end point. It's also usually a static value.
// d = Amount of time the animation will take. Usually a static value aswell.

function easeInQuad(t: number, b: number, c: number, d: number) {
	return c * (t /= d) * t + b;
}
