import chalk from 'chalk';
import { Assumption } from './models';

/**
 * Logs assumptions to the console with specialized formatting.
 * This helps in debugging and tracking the model's reasoning process.
 */
export class AssumptionLogger {
  /**
   * Logs a single assumption.
   * @param assumption The assumption to log.
   */
  public static log(assumption: Assumption): void {
    const header = chalk.bold.yellow(`🧠 Assumption (${assumption.id}):`);
    const scope = chalk.gray(`   Scope: ${assumption.scope}`);
    const given = chalk.blue(`   Given: ${assumption.given}`);
    const then = chalk.green(`   Then:  ${assumption.then}`);
    const because = chalk.magenta(`   Because: ${assumption.because}`);

    console.log(header);
    console.log(scope);
    console.log(given);
    console.log(then);
    console.log(because);
    console.log(''); // Add a blank line for readability
  }

  /**
   * Logs an array of assumptions.
   * @param assumptions The array of assumptions to log.
   */
  public static logBatch(assumptions: Assumption[]): void {
    console.log(chalk.bold.bgYellow.black(' --- Logging Batch of Assumptions --- '));
    assumptions.forEach(this.log);
    console.log(chalk.bold.bgYellow.black(' --- End of Batch --- '));
  }
}
