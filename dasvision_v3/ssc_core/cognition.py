"""
DAS Vision — CognitiveMind v3 (200 IQ Mode)
Sessiz izleme -> Derin anlama -> Stratejik bildirim

Icerik:
- SmartAlertSystem: Severity, cooldown, grouping, fatigue prevention
- OperationalMemory: SQLite hafiza, personel/verimlilik/anomali tracking
- BehaviorAnalyzer: Skeleton-based aksiyon siniflandirmasi (entegre)
- CognitiveMind: Ana bilissel motor
"""

import json
import os
import time
import sqlite3
import threading
import logging
import asyncio
import aiohttp
import base64
import cv2
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict, deque

logger = logging.getLogger(__name__)


# =============================================================================
#  SMART ALERT SYSTEM
# =============================================================================
class SmartAlertSystem:
    """Severity-based, cooldown'lu, fatigue-resistant bildirim sistemi."""

    SEVERITY_LEVELS = {
        "INFO": 0,
        "WARNING": 1,
        "CRITICAL": 2,
        "ALARM": 3,
    }

    def __init__(self, learning_hours=2):
        self._learning_start = time.time()
        self._learning_hours = learning_hours
        self._cooldowns = {}  # {cam_id: last_alert_time}
        self._cooldown_per_severity = {
            "INFO": 1800,      # 30 dakika
            "WARNING": 900,    # 15 dakika
            "CRITICAL": 300,   # 5 dakika
            "ALARM": 60,       # 1 dakika
        }
        self._alert_count_hour = 0
        self._alert_hour_start = time.time()
        self._max_per_hour = 20
        # Stranger tracking: {cam_id: {label: first_seen_time}}
        self._stranger_tracking = {}
        self._stranger_min_duration = 180  # 3 dakika

    def is_learning(self):
        """Ogrenme modunda mi? (ilk N saat)"""
        return time.time() - self._learning_start < self._learning_hours * 3600

    def is_work_hours(self):
        """Mesai saati mi? (08:00-19:00)"""
        hour = datetime.now().hour
        return 8 <= hour < 19

    def should_alert(self, cam_id, severity, event_key=None):
        """Bildirim yapilmali mi?"""
        # Ogrenme modunda sadece ALARM
        if self.is_learning() and severity != "ALARM":
            return False

        # Saatlik butce kontrolu
        now = time.time()
        if now - self._alert_hour_start > 3600:
            self._alert_count_hour = 0
            self._alert_hour_start = now
        if self._alert_count_hour >= self._max_per_hour and severity != "ALARM":
            return False

        # Kamera + severity bazli cooldown
        key = f"{cam_id}_{severity}_{event_key or ''}"
        last = self._cooldowns.get(key, 0)
        cooldown = self._cooldown_per_severity.get(severity, 900)
        if now - last < cooldown:
            return False

        self._cooldowns[key] = now
        self._alert_count_hour += 1
        return True

    def track_stranger(self, cam_id, label, now=None):
        """Stranger izle — 3dk'dan once bildirim yapma. True=bildir."""
        now = now or time.time()
        if cam_id not in self._stranger_tracking:
            self._stranger_tracking[cam_id] = {}

        tracking = self._stranger_tracking[cam_id]
        if label not in tracking:
            tracking[label] = now
            return False  # Yeni goruldu, henuz bildirme

        first_seen = tracking[label]
        if now - first_seen >= self._stranger_min_duration:
            return True  # 3 dk'yi gecti, bildir

        return False

    def clear_stranger(self, cam_id, label):
        """Stranger gitti."""
        if cam_id in self._stranger_tracking:
            self._stranger_tracking[cam_id].pop(label, None)

    def get_stranger_durations(self):
        """Tum stranger surelerini dondur."""
        now = time.time()
        result = {}
        for cam_id, tracking in self._stranger_tracking.items():
            for label, first_seen in tracking.items():
                result[f"{cam_id}_{label}"] = round((now - first_seen) / 60, 1)
        return result


# =============================================================================
#  OPERATIONAL MEMORY
# =============================================================================
class OperationalMemory:
    """SQLite tabanli operasyonel hafiza — personel, verimlilik, anomali."""

    def __init__(self, db_path=None):
        if db_path is None:
            if os.name == 'nt':
                db_path = "C:\\DASVision_SSC\\data\\memory.db"
            else:
                db_path = "data/memory.db"

        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

        # In-memory tracking (hizli erisim)
        self._person_last_seen = {}  # {name: {cam_id: timestamp}}
        self._person_first_seen = {}  # {name: timestamp} (bugunun ilk gorunmesi)
        self._cam_person_counts = defaultdict(lambda: deque(maxlen=60))  # rolling 5dk
        self._breaks = {}  # {name: start_time}
        self._anomaly_log = deque(maxlen=100)
        # Baseline (ogrenme modunda dolacak)
        self._baseline = {
            "cam_person_avg": {},  # {cam_id: avg_person_count}
            "cam_activity_hours": {},  # {cam_id: [active_hours]}
        }

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute('''CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, cam_id TEXT, event TEXT,
            timestamp REAL, date TEXT
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS productivity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cam_id TEXT, person_count INTEGER,
            activity_score REAL, timestamp REAL, date TEXT
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS anomalies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cam_id TEXT, type TEXT, description TEXT,
            severity TEXT, timestamp REAL, date TEXT
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS daily_baseline (
            cam_id TEXT, hour INTEGER,
            avg_persons REAL, avg_activity REAL,
            sample_count INTEGER,
            PRIMARY KEY (cam_id, hour)
        )''')
        conn.execute("CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prod_date ON productivity(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_anom_date ON anomalies(date)")
        conn.commit()
        conn.close()

    def record_person_seen(self, name, cam_id, timestamp=None):
        """Kisi gorundu — giris/cikis takibi."""
        now = timestamp or time.time()
        today = datetime.now().strftime("%Y-%m-%d")

        # Ilk gorunme?
        if name not in self._person_first_seen:
            self._person_first_seen[name] = now
            self._db_insert("attendance",
                            name=name, cam_id=cam_id, event="giris",
                            timestamp=now, date=today)

        # Son gorunme guncelle
        if name not in self._person_last_seen:
            self._person_last_seen[name] = {}
        self._person_last_seen[name][cam_id] = now

    def record_cam_snapshot(self, cam_id, person_count, activity_score, timestamp=None):
        """Kamera bazli verimlilik verisi kaydet."""
        now = timestamp or time.time()
        self._cam_person_counts[cam_id].append((now, person_count))

        # Her 5 dakikada DB'ye yaz
        counts = self._cam_person_counts[cam_id]
        if len(counts) >= 30:  # ~5dk (10fps'de)
            avg_count = sum(c for _, c in counts) / len(counts)
            self._db_insert("productivity",
                            cam_id=cam_id, person_count=int(avg_count),
                            activity_score=activity_score,
                            timestamp=now,
                            date=datetime.now().strftime("%Y-%m-%d"))

    def record_anomaly(self, cam_id, anomaly_type, description, severity="WARNING"):
        """Anomali kaydet."""
        now = time.time()
        self._anomaly_log.append({
            "cam_id": cam_id, "type": anomaly_type,
            "desc": description, "severity": severity, "time": now
        })
        self._db_insert("anomalies",
                        cam_id=cam_id, type=anomaly_type,
                        description=description, severity=severity,
                        timestamp=now,
                        date=datetime.now().strftime("%Y-%m-%d"))

    def update_baseline(self, cam_id, person_count, activity_score):
        """Baseline guncelle (ogrenme modunda)."""
        hour = datetime.now().hour
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            row = conn.execute(
                "SELECT avg_persons, avg_activity, sample_count FROM daily_baseline WHERE cam_id=? AND hour=?",
                (cam_id, hour)
            ).fetchone()

            if row:
                old_avg_p, old_avg_a, count = row
                new_count = count + 1
                new_avg_p = (old_avg_p * count + person_count) / new_count
                new_avg_a = (old_avg_a * count + activity_score) / new_count
                conn.execute(
                    "UPDATE daily_baseline SET avg_persons=?, avg_activity=?, sample_count=? WHERE cam_id=? AND hour=?",
                    (new_avg_p, new_avg_a, new_count, cam_id, hour)
                )
            else:
                conn.execute(
                    "INSERT INTO daily_baseline VALUES (?, ?, ?, ?, ?)",
                    (cam_id, hour, person_count, activity_score, 1)
                )
            conn.commit()
            conn.close()

    def check_anomaly(self, cam_id, person_count, activity_score):
        """Baseline'dan sapma kontrol et. True = anomali var."""
        hour = datetime.now().hour
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            row = conn.execute(
                "SELECT avg_persons, avg_activity, sample_count FROM daily_baseline WHERE cam_id=? AND hour=?",
                (cam_id, hour)
            ).fetchone()
            conn.close()

        if not row or row[2] < 10:
            return None  # Yeterli veri yok

        avg_p, avg_a, count = row
        # %50'den fazla sapma = anomali
        if avg_p > 0 and abs(person_count - avg_p) / avg_p > 0.5:
            direction = "fazla" if person_count > avg_p else "az"
            return f"Normalden {direction} kisi: {person_count} (normal: {avg_p:.0f})"

        return None

    def detect_break(self, name, cam_id, now=None):
        """Mola tespiti — kisi 10dk'dir gorunmuyor."""
        now = now or time.time()
        last = self._person_last_seen.get(name, {}).get(cam_id)
        if last and now - last > 600 and name not in self._breaks:
            self._breaks[name] = now
            return True
        if last and now - last < 60:
            self._breaks.pop(name, None)
        return False

    def get_attendance_summary(self):
        """Bugunun personel giris/cikis ozeti."""
        result = {}
        for name, first in self._person_first_seen.items():
            last_seen = 0
            for cam_data in self._person_last_seen.get(name, {}).values():
                last_seen = max(last_seen, cam_data)

            result[name] = {
                "giris": datetime.fromtimestamp(first).strftime("%H:%M"),
                "son_gorunme": datetime.fromtimestamp(last_seen).strftime("%H:%M") if last_seen else "-",
                "sure_saat": round((last_seen - first) / 3600, 1) if last_seen else 0
            }
        return result

    def get_productivity_snapshot(self):
        """Kamera bazli verimlilik."""
        result = {}
        for cam_id, counts in self._cam_person_counts.items():
            if counts:
                recent = [c for t, c in counts if time.time() - t < 300]
                avg = sum(recent) / len(recent) if recent else 0
                result[cam_id] = {
                    "avg_persons": round(avg, 1),
                    "score": min(100, int(avg * 20))  # basit skor
                }
        return result

    def get_active_breaks(self):
        """Aktif molalar."""
        now = time.time()
        result = {}
        for name, start in self._breaks.items():
            result[name] = {"sure_dk": round((now - start) / 60, 1)}
        return result

    def get_recent_anomalies(self, hours=24):
        """Son N saatteki anomaliler."""
        cutoff = time.time() - hours * 3600
        return [a for a in self._anomaly_log if a["time"] > cutoff]

    def _db_insert(self, table, **kwargs):
        """Thread-safe DB insert."""
        cols = ", ".join(kwargs.keys())
        placeholders = ", ".join("?" * len(kwargs))
        with self._lock:
            try:
                conn = sqlite3.connect(self.db_path)
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})",
                             tuple(kwargs.values()))
                conn.commit()
                conn.close()
            except Exception as e:
                logger.warning(f"DB insert error ({table}): {e}")

    def generate_daily_report(self):
        """Gunluk rapor metni uret."""
        att = self.get_attendance_summary()
        prod = self.get_productivity_snapshot()
        anomalies = self.get_recent_anomalies(24)
        breaks = self.get_active_breaks()

        lines = [
            f"📊 GUNLUK RAPOR | {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "",
            "👥 PERSONEL:"
        ]

        if att:
            for name, info in att.items():
                lines.append(f"  {name}: {info['giris']}→{info['son_gorunme']} ({info['sure_saat']}sa)")
        else:
            lines.append("  Bugun personel verisi yok")

        lines.append("")
        lines.append("📈 VERIMLILIK:")
        if prod:
            for cam_id, p in prod.items():
                emoji = "🟢" if p["score"] > 60 else "🟡" if p["score"] > 30 else "🔴"
                lines.append(f"  {emoji} {cam_id}: %{p['score']} ({p['avg_persons']} kisi)")
        else:
            lines.append("  Henuz verimlilik verisi yok")

        if anomalies:
            lines.append("")
            lines.append(f"⚠ ANOMALILER ({len(anomalies)} adet):")
            for a in anomalies[-5:]:
                t = datetime.fromtimestamp(a["time"]).strftime("%H:%M")
                lines.append(f"  [{t}] {a['severity']}: {a['desc']}")

        if breaks:
            lines.append("")
            lines.append("☕ MOLALAR:")
            for name, info in breaks.items():
                lines.append(f"  {name}: {info['sure_dk']}dk")

        return "\n".join(lines)


# =============================================================================
#  COGNITIVE MIND
# =============================================================================
class CognitiveMind:
    """Ana bilissel motor — dusunur, analiz eder, karar verir."""

    def __init__(self, manifest_path=None):
        if manifest_path:
            with open(manifest_path, 'r') as f:
                self.config = json.load(f)
        else:
            self.config = {}

        self.alerts = SmartAlertSystem(learning_hours=2)
        self.memory = OperationalMemory()

        # LLM ayarlari
        self.ollama_url = "http://localhost:11434/api/generate"
        self.ollama_model = self.config.get("intelligence", {}).get("local_llm", "llama3.2:3b")

        # Gemini rate limiter (token bucket)
        self._gemini_key = os.environ.get("GEMINI_API_KEY", "")
        self._gemini_tokens = 10
        self._gemini_max = 10
        self._gemini_last_refill = time.time()
        self._gemini_rate = 10.0 / 60.0  # 10 token/dk

    def _consume_gemini_token(self):
        now = time.time()
        elapsed = now - self._gemini_last_refill
        self._gemini_tokens = min(self._gemini_max, self._gemini_tokens + elapsed * self._gemini_rate)
        self._gemini_last_refill = now
        if self._gemini_tokens >= 1:
            self._gemini_tokens -= 1
            return True
        return False

    async def analyze_frame(self, cam_id, cam_name, cam_desc, persons, objects, identities, frame, timestamp):
        """
        Tek frame analizi.
        Returns: {
            "persons_identified": [...],
            "actions": [...],
            "scene_summary": str,
            "alerts": [...],  # gonderilecek bildirimler
            "anomaly": str or None
        }
        """
        now = timestamp or time.time()
        person_count = len(persons)
        is_learning = self.alerts.is_learning()

        # 1. Kimlikleri esle (engine'den gelen identities)
        identified = []
        for ident in identities:
            identified.append(ident)

        # 2. Personel takibi
        for ident in identified:
            name = ident.get("name", "Stranger")
            if name != "Stranger":
                self.memory.record_person_seen(name, cam_id, now)

        # 3. Verimlilik snapshot
        activity_score = self._calculate_activity(persons, objects)
        self.memory.record_cam_snapshot(cam_id, person_count, activity_score, now)

        # 4. Baseline guncelle / anomali kontrol
        alerts = []
        if is_learning:
            self.memory.update_baseline(cam_id, person_count, activity_score)
        else:
            anomaly = self.memory.check_anomaly(cam_id, person_count, activity_score)
            if anomaly:
                self.memory.record_anomaly(cam_id, "person_count", anomaly, "WARNING")
                if self.alerts.should_alert(cam_id, "WARNING", "person_count"):
                    alerts.append({
                        "severity": "WARNING",
                        "text": f"⚠ {cam_name}: {anomaly}",
                        "frame": frame
                    })

        # 5. Stranger tracking
        stranger_alerts = self._check_strangers(cam_id, cam_name, identities, now)
        alerts.extend(stranger_alerts)

        # 6. Scene summary (hafif — her frame degil, her 30 saniyede)
        scene_summary = f"{cam_name}: {person_count} kisi"

        return {
            "persons_identified": identified,
            "person_count": person_count,
            "activity_score": activity_score,
            "scene_summary": scene_summary,
            "alerts": alerts,
            "is_learning": is_learning,
        }

    def _calculate_activity(self, persons, objects):
        """Basit aktivite skoru (0-100)."""
        score = 0
        score += min(50, len(persons) * 10)  # Kisi sayisi
        # Hareket halindeki kisiler
        moving = sum(1 for p in persons if p.get("skeleton"))
        score += min(30, moving * 10)
        # Nesne cesitliligi
        unique_objects = set(o.get("class", "") for o in objects)
        score += min(20, len(unique_objects) * 5)
        return min(100, score)

    def _check_strangers(self, cam_id, cam_name, identities, now):
        """Stranger tespiti — 3dk kuralı."""
        alerts = []
        for ident in identities:
            name = ident.get("name", "Stranger")
            if name == "Stranger":
                label = f"stranger_{int(ident.get('bbox', [0])[0])}"
                should_alert = self.alerts.track_stranger(cam_id, label, now)
                if should_alert and self.alerts.should_alert(cam_id, "WARNING", f"stranger_{label}"):
                    duration = self.alerts.get_stranger_durations().get(f"{cam_id}_{label}", 0)
                    alerts.append({
                        "severity": "WARNING",
                        "text": f"🔍 {cam_name}: Taninmayan kisi {duration:.0f}dk'dir bolgede",
                        "frame": None
                    })
        return alerts

    async def local_reasoning(self, metadata):
        """Ollama ile yerel hizli analiz."""
        payload = {
            "model": self.ollama_model,
            "prompt": f"Analyze concisely: {json.dumps(metadata, default=str)[:500]}",
            "stream": False,
            "options": {"num_predict": 30, "temperature": 0.2}
        }
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.post(self.ollama_url, json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result.get("response", "")
        except Exception:
            pass
        return ""

    async def strategic_analysis(self, frame, cam_name, cam_desc):
        """Gemini ile derin gorsel analiz (rate limited)."""
        if not self._gemini_key or not self._consume_gemini_token():
            return await self.local_reasoning({"cam": cam_name, "desc": cam_desc})

        _, buffer = cv2.imencode('.jpg', frame)
        img_b64 = base64.b64encode(buffer).decode('utf-8')

        prompt = (
            f"DASVision CEO Intelligence. Kamera: {cam_name} ({cam_desc}). "
            f"Goruntuyu analiz et. Kisa, oz rapor. Turkce."
        )

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self._gemini_key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": "image/jpeg", "data": img_b64}}
                    ]
                }],
                "generationConfig": {"maxOutputTokens": 200}
            }
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            logger.warning(f"Gemini error: {e}")

        return await self.local_reasoning({"cam": cam_name, "desc": cam_desc})

    async def handle_command(self, text):
        """Telegram komutu isle."""
        cmd = text.strip().split()[0].lower() if text.strip() else ""

        if cmd == "/durum":
            learning = "OGRENME" if self.alerts.is_learning() else "AKTIF"
            work = "MESAI" if self.alerts.is_work_hours() else "MESAI DISI"
            prod = self.memory.get_productivity_snapshot()
            lines = [
                f"🤖 DAS Vision v3 | {learning} | {work}",
                f"⏰ {datetime.now().strftime('%H:%M:%S')}",
            ]
            for cam_id, p in prod.items():
                emoji = "🟢" if p["score"] > 60 else "🟡" if p["score"] > 30 else "🔴"
                lines.append(f"  {emoji} {cam_id}: %{p['score']} ({p['avg_persons']} kisi)")
            strangers = self.alerts.get_stranger_durations()
            if strangers:
                lines.append("🔍 Stranger'lar:")
                for k, dur in strangers.items():
                    lines.append(f"  {k}: {dur}dk")
            return "\n".join(lines)

        elif cmd == "/personel":
            att = self.memory.get_attendance_summary()
            if not att:
                return "Henuz personel verisi yok."
            lines = ["👥 PERSONEL DURUMU", f"📅 {datetime.now().strftime('%Y-%m-%d')}"]
            for name, d in att.items():
                lines.append(f"  {name}: {d['giris']}→{d['son_gorunme']} ({d['sure_saat']}sa)")
            return "\n".join(lines)

        elif cmd == "/verimlilik":
            prod = self.memory.get_productivity_snapshot()
            if not prod:
                return "Henuz verimlilik verisi yok."
            lines = ["📊 VERIMLILIK"]
            for cam_id, p in prod.items():
                emoji = "🟢" if p["score"] > 60 else "🟡" if p["score"] > 30 else "🔴"
                lines.append(f"  {emoji} {cam_id}: %{p['score']} ({p['avg_persons']} kisi)")
            return "\n".join(lines)

        elif cmd == "/anomali":
            anomalies = self.memory.get_recent_anomalies(24)
            if not anomalies:
                return "Son 24 saatte anomali yok ✅"
            lines = [f"⚠ ANOMALILER ({len(anomalies)} adet):"]
            for a in anomalies[-10:]:
                t = datetime.fromtimestamp(a["time"]).strftime("%H:%M")
                lines.append(f"  [{t}] {a['severity']}: {a['desc']}")
            return "\n".join(lines)

        elif cmd == "/mola":
            breaks = self.memory.get_active_breaks()
            if not breaks:
                return "Kimse molada degil."
            lines = ["☕ MOLALAR:"]
            for name, info in breaks.items():
                lines.append(f"  {name}: {info['sure_dk']}dk")
            return "\n".join(lines)

        elif cmd == "/rapor":
            return self.memory.generate_daily_report()

        elif cmd == "/yardim" or cmd == "/help":
            return (
                "🤖 DAS Vision v3 Komutlar:\n"
                "/durum — Sistem durumu\n"
                "/personel — Personel giris/cikis\n"
                "/verimlilik — Bolge verimlilikleri\n"
                "/anomali — Son anomaliler\n"
                "/mola — Aktif molalar\n"
                "/rapor — Gunluk ozet rapor\n"
                "/snap [cam_id] — Kamera snapshot\n"
                "/yardim — Bu mesaj"
            )

        return None
