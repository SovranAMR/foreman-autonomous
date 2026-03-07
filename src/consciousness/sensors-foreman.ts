/**
 * FOREMAN — Operations Sensors
 * 
 * Foreman agent'ın GERÇEK operasyonel nabzı.
 * Sistem metrikleri değil — iş zekası.
 * 
 * 3 sensör:
 *   senseOperations  — Work items, memory writes, git commits
 *   senseSniper      — Twitter Sniper v13 performansı
 *   senseCronHealth   — Cron job'ların yaşayıp yaşamadığı
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { SensorReading } from './types.js';

const run = promisify(exec);

async function shell(cmd: string, timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await run(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch (e: any) {
    return e.stdout?.trim?.() ?? '';
  }
}

// ═══════════════════════════════════════════
// OPERATIONS — Work items, memory, git activity
// ═══════════════════════════════════════════

export interface WorkItemSummary {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'completed';
  stepsTotal: number;
  stepsDone: number;
  staleDays?: number;
}

export interface OperationsContext {
  activeWorks: WorkItemSummary[];
  pausedWorks: WorkItemSummary[];
  recentCompletions: WorkItemSummary[];
  memoryWritesLast24h: number;
  lastCommitAge: number; // hours
  lastCommitMsg: string;
  totalGitChanges24h: number;
}

export async function senseOperations(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // 1. Work tracking — TODO: Claude Code work items dosyalarından okumak
  //    Şimdilik foreman session/chain'lerden oku
  try {
    const chainsDir = '/home/sovranamr/projects/foreman/chains';
    if (existsSync(chainsDir)) {
      const files = await readdir(chainsDir);
      const chainFiles = files.filter(f => f.endsWith('.json'));
      
      let activeCount = 0;
      let pausedCount = 0;
      let staleChains: string[] = [];

      for (const file of chainFiles.slice(-20)) {
        try {
          const data = JSON.parse(await readFile(`${chainsDir}/${file}`, 'utf-8'));
          if (data.status === 'active' || data.status === 'in_progress') {
            activeCount++;
            // 3 günden eski active chain = stale
            const age = (now - new Date(data.createdAt || data.startedAt || 0).getTime()) / 86400000;
            if (age > 3) staleChains.push(data.name || file);
          }
          if (data.status === 'paused') pausedCount++;
        } catch {}
      }

      if (staleChains.length > 0) {
        readings.push({
          sensor: 'self',
          timestamp: now,
          severity: 'warning',
          title: `📋 ${staleChains.length} yarım iş ${staleChains.length > 3 ? '3+ gündür' : ''} bekliyor`,
          detail: staleChains.slice(0, 3).join(', '),
          value: staleChains.length,
          actionable: true,
          metricKey: 'stale_work_items',
        });
      }

      if (activeCount > 0 || pausedCount > 0) {
        readings.push({
          sensor: 'self',
          timestamp: now,
          severity: 'info',
          title: `🔨 ${activeCount} aktif, ${pausedCount} paused iş`,
          detail: `Toplam ${chainFiles.length} chain`,
          value: activeCount,
          actionable: false,
          metricKey: 'active_work_items',
        });
      }
    }
  } catch {}

  // 2. Git activity — son commit ne zaman, ne kadar değişiklik
  try {
    const lastCommitTime = await shell(
      'cd /home/sovranamr/projects/foreman && git log -1 --format="%ct" 2>/dev/null'
    );
    const lastCommitMsg = await shell(
      'cd /home/sovranamr/projects/foreman && git log -1 --format="%s" 2>/dev/null'
    );
    const commitCount24h = await shell(
      'cd /home/sovranamr/projects/foreman && git log --since="24 hours ago" --oneline 2>/dev/null | wc -l'
    );

    const commitTs = parseInt(lastCommitTime, 10) * 1000;
    const hoursAgo = Math.round((now - commitTs) / 3600000);

    readings.push({
      sensor: 'git',
      timestamp: now,
      severity: hoursAgo > 48 ? 'warning' : 'info',
      title: `📦 Son commit: ${hoursAgo}s önce`,
      detail: lastCommitMsg,
      value: hoursAgo,
      actionable: false,
      metricKey: 'last_commit_hours',
    });

    const changes = parseInt(commitCount24h, 10) || 0;
    if (changes > 0) {
      readings.push({
        sensor: 'git',
        timestamp: now,
        severity: 'info',
        title: `📊 24s: ${changes} commit`,
        detail: `Son 24 saatte ${changes} commit yapıldı`,
        value: changes,
        actionable: false,
        metricKey: 'commits_24h',
      });
    }
  } catch {}

  // 3. Memory writes — son 24 saatte kaç memory yazıldı
  try {
    const memDir = '/home/sovranamr/projects/foreman/memory';
    if (existsSync(memDir)) {
      const files = await readdir(memDir);
      let recent = 0;
      for (const f of files.slice(-50)) {
        try {
          const s = await stat(`${memDir}/${f}`);
          if (now - s.mtimeMs < 86400000) recent++;
        } catch {}
      }
      if (recent > 0) {
        readings.push({
          sensor: 'self',
          timestamp: now,
          severity: 'info',
          title: `🧠 24s: ${recent} memory yazıldı`,
          detail: `Toplam ${files.length} memory`,
          value: recent,
          actionable: false,
          metricKey: 'memory_writes_24h',
        });
      }
    }
  } catch {}

  return readings;
}

// ═══════════════════════════════════════════
// SNIPER — Twitter Sniper v13 Performance
// ═══════════════════════════════════════════

export interface SniperScore {
  likes: number;
  replies: number;
  follows: number;
  tweets: number;
  quotes: number;
  lastAction: string;
  lastActionTime: string;
  isRunning: boolean;
  lastRunAge: number; // minutes
}

export async function senseSniper(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();
  const logFile = '/tmp/sniper_v13.log';

  if (!existsSync(logFile)) {
    readings.push({
      sensor: 'service',
      timestamp: now,
      severity: 'warning',
      title: '🐦 Sniper log yok',
      detail: 'sniper_v13.log bulunamadı',
      actionable: true,
    });
    return readings;
  }

  try {
    // Son skor satırı
    const lastScore = await shell(`grep "📊 Daily:" ${logFile} | tail -1`);
    // Son aksiyon satırı
    const lastAction = await shell(`grep "Action:" ${logFile} | tail -1`);
    // Log'un son değiştirilme zamanı
    const logStat = await stat(logFile);
    const logAgeMin = Math.round((now - logStat.mtimeMs) / 60000);

    // Skor parse
    let likes = 0, replies = 0, follows = 0, tweets = 0, quotes = 0;
    const scoreMatch = lastScore.match(/(\d+)❤️\s*(\d+)💬\s*(\d+)👤\s*(\d+)📝\s*(\d+)🔄/);
    if (scoreMatch) {
      likes = parseInt(scoreMatch[1]);
      replies = parseInt(scoreMatch[2]);
      follows = parseInt(scoreMatch[3]);
      tweets = parseInt(scoreMatch[4]);
      quotes = parseInt(scoreMatch[5]);
    }

    // Son aksiyon parse
    let actionType = 'unknown';
    let actionTime = '';
    const actionMatch = lastAction.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*\|\s*Action:\s*(\w+)/);
    if (actionMatch) {
      actionTime = actionMatch[1];
      actionType = actionMatch[2];
    }

    // Sniper sağlık durumu
    const isStale = logAgeMin > 20; // 8dk'da bir çalışmalı, 20dk = sorun
    
    readings.push({
      sensor: 'service',
      timestamp: now,
      severity: isStale ? 'warning' : 'info',
      title: `🐦 Sniper: ${likes}❤️ ${replies}💬 ${follows}👤 ${tweets}📝 ${quotes}🔄`,
      detail: isStale 
        ? `⚠️ Son çalışma ${logAgeMin}dk önce — durmuş olabilir!`
        : `Son aksiyon: ${actionType} (${logAgeMin}dk önce)`,
      value: likes + replies * 3 + follows * 5 + tweets * 2 + quotes * 4, // engagement score
      actionable: isStale,
      metricKey: 'sniper_engagement',
    });

    // Performans analizi — düşük reply oranı
    if (likes > 20 && replies < 3) {
      readings.push({
        sensor: 'service',
        timestamp: now,
        severity: 'info',
        title: '📉 Sniper: Like çok, reply az',
        detail: `${likes} like ama sadece ${replies} reply — query\'ler konuşma başlatmıyor`,
        actionable: false,
        metricKey: 'sniper_reply_ratio',
      });
    }

    // Hata kontrolü
    const errorCount = await shell(`grep -c "ERROR\\|Error\\|error\\|FAIL" ${logFile} 2>/dev/null || echo 0`);
    const recentErrors = await shell(`tail -100 ${logFile} | grep -c "ERROR\\|Error\\|FAIL" 2>/dev/null || echo 0`);
    const errCount = parseInt(recentErrors, 10) || 0;
    
    if (errCount > 3) {
      readings.push({
        sensor: 'service',
        timestamp: now,
        severity: 'warning',
        title: `🐦 Sniper: Son 100 satırda ${errCount} hata`,
        detail: await shell(`tail -100 ${logFile} | grep "ERROR\\|Error\\|FAIL" | tail -2`),
        actionable: true,
      });
    }

  } catch (e: any) {
    readings.push({
      sensor: 'service',
      timestamp: now,
      severity: 'warning',
      title: '🐦 Sniper log okunamadı',
      detail: e.message?.slice(0, 200) || 'unknown error',
      actionable: true,
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// CRON HEALTH — Cron job'ların durumu
// ═══════════════════════════════════════════

export async function senseCronHealth(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  try {
    // Crontab'ı oku
    const crontab = await shell('crontab -l 2>/dev/null');
    if (!crontab || crontab.includes('no crontab')) {
      readings.push({
        sensor: 'cron',
        timestamp: now,
        severity: 'warning',
        title: '⏰ Crontab boş',
        detail: 'Hiç cron job tanımlı değil',
        actionable: true,
      });
      return readings;
    }

    const jobs = crontab.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    
    readings.push({
      sensor: 'cron',
      timestamp: now,
      severity: 'info',
      title: `⏰ ${jobs.length} cron job aktif`,
      detail: jobs.map(j => {
        // Job'dan scripti çıkar
        const parts = j.split('&&').pop()?.trim() || j;
        const script = parts.split('/').pop()?.split(' ')[0] || parts.slice(0, 50);
        return script;
      }).join(', '),
      value: jobs.length,
      actionable: false,
      metricKey: 'cron_job_count',
    });

    // Her job'ın son çalışma zamanını kontrol et
    for (const job of jobs) {
      // Log dosyasını bul
      const logMatch = job.match(/>>?\s*(\S+)/);
      if (logMatch) {
        const logPath = logMatch[1];
        if (existsSync(logPath)) {
          const logInfo = await stat(logPath);
          const ageMin = Math.round((now - logInfo.mtimeMs) / 60000);
          
          // Cron interval'ını çıkar
          const cronParts = job.trim().split(/\s+/);
          const minuteField = cronParts[0];
          let expectedInterval = 60; // default 1 saat
          if (minuteField?.startsWith('*/')) {
            expectedInterval = parseInt(minuteField.replace('*/', ''), 10) || 60;
          }
          
          // 3x interval'dan fazlaysa sorun var
          if (ageMin > expectedInterval * 3) {
            const scriptName = logPath.split('/').pop() || 'unknown';
            readings.push({
              sensor: 'cron',
              timestamp: now,
              severity: 'warning',
              title: `⏰ ${scriptName}: ${ageMin}dk'dır güncellenmedi`,
              detail: `Beklenen: her ${expectedInterval}dk, son: ${ageMin}dk önce`,
              value: ageMin,
              actionable: true,
              metricKey: `cron_${scriptName}_age`,
            });
          }
        }
      }
    }
  } catch {}

  return readings;
}

// ═══════════════════════════════════════════
// GITHUB — Repo star/fork takibi
// ═══════════════════════════════════════════

export async function senseGitHub(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  const repos = [
    'SovranAMR/twitter-sniper',
    'SovranAMR/fitrat',
    'SovranAMR/foreman-autonomous',
  ];

  for (const repo of repos) {
    try {
      const result = await shell(
        `curl -sf "https://api.github.com/repos/${repo}" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('stargazers_count',0),d.get('forks_count',0),d.get('watchers_count',0))"`,
        15000
      );
      
      if (result) {
        const [stars, forks, watchers] = result.split(' ').map(Number);
        const name = repo.split('/')[1];
        
        readings.push({
          sensor: 'git',
          timestamp: now,
          severity: 'info',
          title: `⭐ ${name}: ${stars}★ ${forks}🍴 ${watchers}👁`,
          detail: `github.com/${repo}`,
          value: stars,
          actionable: false,
          metricKey: `github_stars_${name}`,
        });
      }
    } catch {}
  }

  return readings;
}
