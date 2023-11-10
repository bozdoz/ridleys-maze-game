import { defineConfig } from "vite";

const transformHtmlPlugin = (replacements) => ({
	name: "transform-html",
	transformIndexHtml: {
		enforce: "pre",
		transform(html) {
			return html.replace(
				new RegExp(`{{(${Object.keys(replacements).join("|")})}}`, "g"),
				(match, p1) => replacements[p1] || "",
			);
		},
	},
});

export default defineConfig({
	plugins: [
		transformHtmlPlugin({
			title: `Ridley's Maze Game`,
			description: "Our second game: filling a maze",
			site: "https://ridleys-maze-game.vercel.app",
			keywords: "maze, game, javascript, web",
		}),
	],
});
