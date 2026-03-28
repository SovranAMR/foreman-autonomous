import chalk from 'chalk';
import { Assumption } from './models';

export function logAssumption(assumption: Assumption): void {
  console.log(chalk.yellow.bold('Assumption Declared:'));
  console.log(chalk.white(`  ID: ${assumption.id}`));
  console.log(chalk.white(`  Description: ${assumption.description}`));
  console.log(chalk.white(`  Source: ${assumption.source}`));
  console.log(chalk.white(`  Confidence: ${assumption.confidence * 100}%`));
  console.log(chalk.white(`  Timestamp: ${assumption.timestamp.toISOString()}`));
  console.log(chalk.gray('----------------------------------------'));
}
