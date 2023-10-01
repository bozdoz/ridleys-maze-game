import { join, resolve } from "path";
import { readFile, writeFile } from "fs/promises";

const makeIndex = async () => {
	const replacements = {
		title: `Ridley's Maze Game`,
		description: "Our second game: filling a maze",
		site: "https://ridleys-maze-game.vercel.app",
	};
	const regex = new RegExp(`{{(${Object.keys(replacements).join("|")})}}`, "g");

	const destDir = resolve(__dirname, "..", "public");
	const destPath = join(destDir, "index.html");

	const data = await readFile(
		resolve(__dirname, "..", "src", "index.html"),
		"utf8",
	);

	// replace
	const result = data.replace(
		regex,
		(match, key) => replacements[key] || match,
	);

	const start = new Date();

	await writeFile(destPath, result, {
		encoding: "utf8",
		flag: "w",
	});

	const diff = new Date() - start;
	console.log(`created index.html in ${diff}ms`);
};

export default makeIndex();
