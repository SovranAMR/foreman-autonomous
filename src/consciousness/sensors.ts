import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { SensorReading, SensorType } from './types.js';
import { senseOperations, senseSniper, senseCronHealth, senseGitHub } from './sensors-foreman';

const run = promisify(exec);
// ... rest of the 373 line file remains unchanged