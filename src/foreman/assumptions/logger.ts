import chalk from 'chalk';
import { Assumption } from './models';

/**
 * Logs an assumption to the console with color-coded formatting.
 * 
 * @param assumption The assumption object to log.
 */
export function logAssumption(assumption: Assumption): void {
  const { given, when, then, because, confidence } = assumption;

  console.log(chalk.bold.yellow('🧠 New Assumption Declared:'));
  console.log(`${chalk.cyan('Given:')} ${given}`);
  
  if (when) {
    console.log(`${chalk.cyan('When:')}  ${when}`);
  }
  
  console.log(`${chalk.cyan('Then:')}  ${then}`);
  
  if (because) {
    console.log(`${chalk.cyan('Because:')} ${because.join(', ')}`);
  }

  const confidenceColor = confidence > 80 ? chalk.green : (confidence > 50 ? chalk.yellow : chalk.red);
  console.log(`${chalk.cyan('Confidence:')} ${confidenceColor(confidence + '%')}`);
  console.log(chalk.gray('---'));
}
