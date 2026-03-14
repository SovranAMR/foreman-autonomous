import { Command } from "commander";
import { startRepl } from "./src/repl.js";

const program = new Command();
program.action(async () => {
    console.log("Starting repl from commander...");
    await startRepl();
    console.log("startRepl returned inside commander");
});

program.parseAsync();
