import { Command } from "commander";
import { startRepl } from "./src/repl.js";

const program = new Command();
program.action(async () => {
    console.log("Action started");
    await startRepl();
    console.log("Action finished!");
});

program.parseAsync().then(() => console.log("parseAsync resolved"));
