"""
DAS Vision — CognitiveMind v3 (200 IQ Mode)
============================================
Sessiz izleme -> Derin anlama -> Stratejik bildirim

Felsefe: Gercek bir 200 IQ CEO/Bekci hic bildirim yapmadan ANLAR.
Bildirdiginde ise cok kesin, cok kisa, cok degerlidir.

Yeni Yetenekler:
- Operational Memory: Son 24 saat tam hafiza
- Pattern Learning: Kim nerede ne zaman ne yapiyor ogrenir
- Workforce Tracker: Personel giris/cikis, alan gecisleri
- Productivity Score: Bolge bazli verimlilik metrikleri
- Smart Alerting: Sadece gercek anomali = bildirim
- Inventory Awareness: Nesne/alan degisiklik tespiti
- Shift Intelligence: Mesai/mola/fazla mesai analizi
"""

import requests
import json
import os
import aiohttp
import asyncio
import base64
import cv2
import time
import threading
from datetime import datetime, timedelta
from collections import defaultdict, deque
from ssc_core.behavior import BehaviorAnalyzer


class EventLog:
    """Thread-safe event log with disk flush."""
    def __init__(self, log_dir=None):
        if log_dir is None:
            log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "events")
        self.log_dir = os.path.abspath(log_dir)
        os.makedirs(self.log_dir, exist_ok=True)
        self.events = []
        self._lock = threading.Lock()

    def record(self, cam_id, cam_name, event_type, details=None):
        entry = {
            "timestamp": datetime.now().isoformat(),
            "epoch": time.time(),
            "cam_id": cam_id,
            "cam_name": cam_name,
            "event_type": event_type,
            "details": details or {}
        }
        with self._lock:
            self.events.append(entry)
        return entry

    def get_events_since(self, seconds_ago):
        cutoff = time.time() - seconds_ago
        with self._lock:
            return [e for e in self.events if e["epoch"] > cutoff]

    def get_daily_summary_data(self):
        today = datetime.now().strftime("%Y-%m-%d")
        with self._lock:
            return [e for e in self.events if e["timestamp"].startswith(today)]

    def flush_to_disk(self):
        with self._lock:
            if not self.events:
                return
            today = datetime.now().strftime("%Y-%m-%d")
            path = os.path.join(self.log_dir, f"events_{today}.json")
            existing = []
            if os.path.exists(path):
                try:
                    with open(path, 'r') as f:
                        existing = json.load(f)
                except Exception:
                    existing = []
            existing.extend(self.events)
            tmp = path + ".tmp"
            with open(tmp, 'w') as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
            self.events = []


class OperationalMemory:
    """
    200 IQ hafiza: Isletmenin nabzini tutar.
    - Kim nerede ne zaman goruldu
    - Bolge bazli kisi/aktivite sayilari (rolling window)
    - Normal pattern'ler ogrenilir, anomali = normal'den sapma
    """
    def __init__(self):
        self.zone_history = defaultdict(lambda: deque(maxlen=2000))
        self.person_tracker = defaultdict(lambda: deque(maxlen=500))
        self.hourly_baselines = defaultdict(lambda: defaultdict(list))
        self.area_snapshots = {}
        self.attendance = {}
        self.break_tracker = {}
        self._lock = threading.Lock()

    def record_zone(self, cam_id, person_count, actions, objects, identities):
        now = time.time()
        with self._lock:
            self.zone_history[cam_id].append({
                "t": now,
                "persons": person_count,
                "actions": actions,
                "objects": objects,
                "identities": [i.get("label", "?") for i in identities] if identities else []
            })
            hour = datetime.now().hour
            self.hourly_baselines[cam_id][hour].append(person_count)
            if len(self.hourly_baselines[cam_id][hour]) > 500:
                self.hourly_baselines[cam_id][hour] = self.hourly_baselines[cam_id][hour][-500:]

    def record_person(self, label, cam_id, action=None):
        now = time.time()
        with self._lock:
            self.person_tracker[label].append({
                "t": now,
                "cam": cam_id,
                "action": action
            })
            today = datetime.now().strftime("%Y-%m-%d")
            if today not in self.attendance:
                self.attendance[today] = {}
            if label not in self.attendance[today]:
                self.attendance[today][label] = {
                    "first_seen": now,
                    "last_seen": now,
                    "zones": set(),
                    "total_sightings": 0
                }
            att = self.attendance[today][label]
            att["last_seen"] = now
            att["zones"].add(cam_id)
            att["total_sightings"] += 1

            outdoor_cams = {"cam_03", "cam_07"}
            if cam_id in outdoor_cams:
                if label not in self.break_tracker:
                    self.break_tracker[label] = {"start": now, "cam_id": cam_id}
            else:
                if label in self.break_tracker:
                    start = self.break_tracker[label]["start"]
                    duration = now - start
                    del self.break_tracker[label]
                    if duration > 60:
                        return {"type": "break_ended", "label": label, "duration_min": round(duration / 60, 1)}
        return None

    def get_zone_avg(self, cam_id, hours_back=1):
        cutoff = time.time() - hours_back * 3600
        with self._lock:
            records = [r for r in self.zone_history[cam_id] if r["t"] > cutoff]
        if not records:
            return 0
        return sum(r["persons"] for r in records) / len(records)

    def get_hourly_baseline(self, cam_id):
        hour = datetime.now().hour
        with self._lock:
            data = self.hourly_baselines[cam_id].get(hour, [])
        if len(data) < 10:
            return None
        import statistics
        avg = statistics.mean(data)
        std = statistics.stdev(data) if len(data) > 1 else avg * 0.3
        return {"avg": round(avg, 1), "std": round(std, 1), "min": round(avg - 2 * std, 1), "max": round(avg + 2 * std, 1)}

    def get_attendance_summary(self):
        today = datetime.now().strftime("%Y-%m-%d")
        with self._lock:
            att = self.attendance.get(today, {})
        result = {}
        for label, data in att.items():
            if label.startswith("Unknown_"):
                continue
            first = datetime.fromtimestamp(data["first_seen"]).strftime("%H:%M")
            last = datetime.fromtimestamp(data["last_seen"]).strftime("%H:%M")
            duration = (data["last_seen"] - data["first_seen"]) / 3600
            result[label] = {
                "giris": first,
                "son_gorunme": last,
                "sure_saat": round(duration, 1),
                "bolge_sayisi": len(data["zones"]),
                "gorunme": data["total_sightings"]
            }
        return result

    def get_active_breaks(self):
        now = time.time()
        with self._lock:
            breaks = {}
            for label, info in self.break_tracker.items():
                dur = (now - info["start"]) / 60
                if dur > 2:
                    breaks[label] = {"sure_dk": round(dur, 1), "konum": info["cam_id"]}
        return breaks

    def detect_anomaly(self, cam_id, current_count):
        baseline = self.get_hourly_baseline(cam_id)
        if baseline is None:
            return None
        if current_count > baseline["max"] + 2:
            return {"type": "crowd", "current": current_count, "expected_max": baseline["max"]}
        if current_count == 0 and baseline["avg"] > 2:
            return {"type": "empty", "expected_avg": baseline["avg"]}
        return None

    def get_productivity_snapshot(self):
        now = time.time()
        cutoff_30m = now - 1800
        result = {}
        with self._lock:
            for cam_id, history in self.zone_history.items():
                recent = [r for r in history if r["t"] > cutoff_30m]
                if not recent:
                    result[cam_id] = {"status": "inactive", "score": 0}
                    continue
                avg_persons = sum(r["persons"] for r in recent) / len(recent)
                work_actions = 0
                idle_actions = 0
                for r in recent:
                    for act in (r.get("actions") or []):
                        a = act if isinstance(act, str) else act.get("action", "")
                        if a in ("working_hands", "bending", "reaching_up", "walking"):
                            work_actions += 1
                        elif a in ("standing", "sitting", "phone_use"):
                            idle_actions += 1
                total = work_actions + idle_actions
                work_ratio = work_actions / total if total > 0 else 0
                score = min(100, int(work_ratio * 100))
                result[cam_id] = {
                    "status": "active" if avg_persons > 0.5 else "inactive",
                    "avg_persons": round(avg_persons, 1),
                    "work_ratio": round(work_ratio, 2),
                    "score": score,
                    "samples": len(recent)
                }
        return result


class SmartAlertManager:
    """
    200 IQ bildirim yoneticisi: Sessiz ol, sadece gercek anomalide konus.

    Kurallar:
    - Ilk 2 saat: TAMAMEN sessiz, sadece ogren
    - Sonrasi: Sadece baseline'dan sapma = bildirim
    - Ayni tip olay = 30dk cooldown
    - Saatte max 5 bildirim (ALARM haric)
    - Gece (mesai disi) = herhangi bir insan = bildirim
    - Stranger: Sadece 3+ dakika kalan stranger = bildirim
    """
    def __init__(self, work_start="08:30", work_end="18:30"):
        self._start_time = time.time()
        self._learning_period = 7200
        self._cooldowns = {}
        self._hourly_count = 0
        self._hourly_reset = time.time()
        self._max_per_hour = 5
        self._cooldown_seconds = 1800
        self._alarm_cooldown = 300
        self.work_start = work_start
        self.work_end = work_end
        self._stranger_timers = {}

    def is_learning(self):
        return (time.time() - self._start_time) < self._learning_period

    def is_work_hours(self):
        now = datetime.now()
        day = now.strftime("%A")
        if day == "Sunday":
            return False
        try:
            start_h, start_m = map(int, self.work_start.split(":"))
            end_h, end_m = map(int, self.work_end.split(":"))
            start = now.replace(hour=start_h, minute=start_m, second=0)
            end = now.replace(hour=end_h, minute=end_m, second=0)
            return start <= now <= end
        except Exception:
            return True

    def should_alert(self, event_type, cam_id, severity="normal", extra=None):
        now = time.time()
        if self.is_learning() and severity != "critical":
            return False
        if now - self._hourly_reset > 3600:
            self._hourly_count = 0
            self._hourly_reset = now
        if severity != "critical" and self._hourly_count >= self._max_per_hour:
            return False
        key = f"{cam_id}_{event_type}"
        last = self._cooldowns.get(key, 0)
        cooldown = self._alarm_cooldown if severity == "critical" else self._cooldown_seconds
        if now - last < cooldown:
            return False
        if not self.is_work_hours() and event_type == "person_detected":
            self._cooldowns[key] = now
            self._hourly_count += 1
            return True
        if event_type == "stranger_detected":
            timer_key = f"{cam_id}_{extra or 'unknown'}"
            if timer_key not in self._stranger_timers:
                self._stranger_timers[timer_key] = now
                return False
            elapsed = now - self._stranger_timers[timer_key]
            if elapsed < 180:
                return False
            del self._stranger_timers[timer_key]
            self._cooldowns[key] = now
            self._hourly_count += 1
            return True
        if severity == "critical":
            self._cooldowns[key] = now
            self._hourly_count += 1
            return True
        self._cooldowns[key] = now
        self._hourly_count += 1
        return True

    def clear_stranger_timer(self, cam_id, label):
        timer_key = f"{cam_id}_{label}"
        self._stranger_timers.pop(timer_key, None)


class CognitiveMind:
    """200 IQ Beyin — Sessiz izle, derin anla, stratejik bildir."""

    def __init__(self, local_llm="llama3.2:3b", remote_url="http://192.168.1.159:51200/v1/messages", manifest_path=None):
        self.local_llm = local_llm
        self.ollama_url = "http://localhost:11434/api/generate"
        self.antigravity_url = remote_url
        self.remote_active = True
        self.event_log = EventLog()
        self.behavior = BehaviorAnalyzer()
        self._last_flush = time.time()

        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.gemini_model = "gemini-2.0-flash"
        self.gemini_base_url = "https://generativelanguage.googleapis.com/v1beta/models"

        self.memory = OperationalMemory()
        self.business = {}
        self.work_start = "08:30"
        self.work_end = "18:30"
        self.off_day = "Pazar"

        if manifest_path and os.path.exists(manifest_path):
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                self.business = manifest.get("business", {})
                wh = self.business.get("work_hours", {})
                self.work_start = wh.get("start", "08:30")
                self.work_end = wh.get("end", "18:30")
                self.off_day = wh.get("off", "Pazar")
                print(f"SSC Cognition v3: Business context loaded - {self.business.get('company', '?')}")
            except Exception as e:
                print(f"SSC Cognition v3: Business context load error: {e}")

        self.alerts = SmartAlertManager(self.work_start, self.work_end)
        self._gemini_last_call = 0
        self._gemini_min_interval = 4
        self._gemini_backoff = 4

    def _build_business_prompt(self):
        if not self.business:
            return ""
        b = self.business
        lines = [
            "=== ISLETME BAGLAMI ===",
            f"Sirket: {b.get('company', '?')}",
            f"Sektor: {b.get('industry', '?')}",
            f"Sahip/CEO: {b.get('owner', '?')}",
            f"Lokasyon: {b.get('location', '?')}",
            f"Mesai: {self.work_start}-{self.work_end} ({b.get('work_hours', {}).get('days', '?')})",
            f"Tatil: {self.off_day}",
            f"Ogle arasi: {b.get('work_hours', {}).get('lunch', '?')}",
        ]
        depts = b.get("departments", {})
        if depts:
            lines.append("\nBOLUMLER:")
            for dept_id, dept in depts.items():
                lines.append(f"  {dept_id}: {dept.get('description', '?')} | Kameralar: {dept.get('cameras', [])}")
        rules = b.get("rules", [])
        if rules:
            lines.append("\nKURALLAR:")
            for r in rules:
                lines.append(f"  - {r}")
        return "\n".join(lines)

    async def _gemini_text(self, prompt, max_tokens=500):
        if not self.gemini_api_key:
            return None
        now = time.time()
        wait = self._gemini_min_interval - (now - self._gemini_last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        url = f"{self.gemini_base_url}/{self.gemini_model}:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3}
        }
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.post(url, json=payload) as resp:
                    self._gemini_last_call = time.time()
                    if resp.status == 200:
                        data = await resp.json()
                        self._gemini_backoff = 4
                        return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    elif resp.status == 429:
                        self._gemini_backoff = min(self._gemini_backoff * 2, 120)
                        self._gemini_min_interval = self._gemini_backoff
                        print(f"SSC Gemini 429 — backoff {self._gemini_backoff}s")
                        return None
                    else:
                        print(f"SSC Gemini API error: {resp.status}")
                        return None
        except Exception as e:
            print(f"SSC Gemini error: {e}")
            return None

    async def _gemini_vision(self, prompt, image_base64, max_tokens=500):
        if not self.gemini_api_key:
            return None
        now = time.time()
        wait = self._gemini_min_interval - (now - self._gemini_last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        url = f"{self.gemini_base_url}/{self.gemini_model}:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [{"parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}
            ]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3}
        }
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.post(url, json=payload) as resp:
                    self._gemini_last_call = time.time()
                    if resp.status == 200:
                        data = await resp.json()
                        self._gemini_backoff = 4
                        return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    elif resp.status == 429:
                        self._gemini_backoff = min(self._gemini_backoff * 2, 120)
                        self._gemini_min_interval = self._gemini_backoff
                        return None
                    else:
                        return None
        except Exception as e:
            print(f"SSC Gemini vision error: {e}")
            return None

    def log_event(self, cam_id, cam_name, event_type, details=None):
        self.event_log.record(cam_id, cam_name, event_type, details)
        now = time.time()
        if now - self._last_flush > 300:
            self.event_log.flush_to_disk()
            self._last_flush = now

    def observe(self, cam_id, cam_name, persons, objects, actions, identities):
        """
        Ana gozlem metodu. Her frame'de cagrilir.
        Sessizce gozlemler, hafizaya kaydeder, anomali arar.
        Returns: alert dict if notification needed, else None
        """
        person_count = len(persons) if persons else 0
        action_list = actions if actions else []
        object_list = objects if objects else []
        identity_list = identities if identities else []

        self.memory.record_zone(cam_id, person_count, action_list, object_list, identity_list)

        for ident in identity_list:
            label = ident.get("label", "Unknown")
            action = action_list[0] if action_list else None
            act_str = action.get("action", "?") if isinstance(action, dict) else str(action) if action else None
            break_event = self.memory.record_person(label, cam_id, act_str)
            if break_event and break_event["type"] == "break_ended":
                if break_event["duration_min"] > 15:
                    if self.alerts.should_alert("long_break", cam_id, "normal"):
                        return {
                            "type": "long_break",
                            "label": break_event["label"],
                            "duration": break_event["duration_min"],
                            "cam_id": cam_id,
                            "cam_name": cam_name,
                            "severity": "info"
                        }

        anomaly = self.memory.detect_anomaly(cam_id, person_count)
        if anomaly:
            if anomaly["type"] == "crowd" and self.alerts.should_alert("crowd_anomaly", cam_id, "normal"):
                return {
                    "type": "crowd_anomaly",
                    "cam_id": cam_id,
                    "cam_name": cam_name,
                    "current": anomaly["current"],
                    "expected": anomaly["expected_max"],
                    "severity": "warning"
                }
            elif anomaly["type"] == "empty" and self.alerts.should_alert("zone_empty", cam_id, "normal"):
                return {
                    "type": "zone_empty",
                    "cam_id": cam_id,
                    "cam_name": cam_name,
                    "expected_avg": anomaly["expected_avg"],
                    "severity": "info"
                }

        if not self.alerts.is_work_hours() and person_count > 0:
            if self.alerts.should_alert("after_hours", cam_id, "critical"):
                return {
                    "type": "after_hours_intrusion",
                    "cam_id": cam_id,
                    "cam_name": cam_name,
                    "person_count": person_count,
                    "identities": [i.get("label") for i in identity_list],
                    "severity": "critical"
                }

        return None

    async def check_and_report_anomalies(self):
        if self.alerts.is_learning():
            return None
        events = self.event_log.get_events_since(600)
        if not events:
            return None
        anomalies = []
        productivity = self.memory.get_productivity_snapshot()
        for cam_id, prod in productivity.items():
            if prod["status"] == "inactive" and self.alerts.is_work_hours():
                baseline = self.memory.get_hourly_baseline(cam_id)
                if baseline and baseline["avg"] > 1:
                    anomalies.append(f"{cam_id}: Mesai saatinde bos (normalde {baseline['avg']} kisi)")
        active_breaks = self.memory.get_active_breaks()
        for label, info in active_breaks.items():
            if info["sure_dk"] > 20:
                anomalies.append(f"{label}: {info['sure_dk']}dk molada ({info['konum']})")
        if not anomalies:
            return None
        prompt = (
            f"{self._build_business_prompt()}\n\n"
            f"Zaman: {datetime.now().strftime('%H:%M')}\n"
            f"Anomaliler:\n" + "\n".join(f"- {a}" for a in anomalies) + "\n\n"
            "CEO'ya 2-3 satirlik rapor yaz. Sadece onemli olanlari bildir. Turkce."
        )
        result = await self._gemini_text(prompt, max_tokens=200)
        if result:
            return result
        return "Anomali: " + "; ".join(anomalies)

    async def generate_daily_report(self):
        attendance = self.memory.get_attendance_summary()
        productivity = self.memory.get_productivity_snapshot()
        events = self.event_log.get_daily_summary_data()
        event_types = defaultdict(int)
        for e in events:
            event_types[e["event_type"]] += 1
        report_data = {
            "tarih": datetime.now().strftime("%Y-%m-%d"),
            "personel": attendance,
            "verimlilik": productivity,
            "olay_sayilari": dict(event_types),
            "toplam_olay": len(events)
        }
        prompt = (
            f"{self._build_business_prompt()}\n\n"
            f"GUNLUK RAPOR VERISI:\n{json.dumps(report_data, ensure_ascii=False, indent=2)}\n\n"
            "CEO Ali Ilcel icin gunluk operasyonel rapor yaz:\n"
            "1. Personel ozeti (kim geldi, ne kadar calisti)\n"
            "2. Bolge verimlilik skoru\n"
            "3. One cikan olaylar\n"
            "4. Genel degerlendirme\n"
            "Kisa, sayi bazli, profesyonel. Turkce. Max 15 satir."
        )
        result = await self._gemini_text(prompt, max_tokens=600)
        return result or json.dumps(report_data, ensure_ascii=False, indent=2)

    async def strategic_stranger_analysis(self, frame, cam_name, cam_desc, label):
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        biz = self._build_business_prompt()
        prompt = (
            f"{biz}\n"
            f"GUVENLIK ALARMI\n"
            f"Kamera: {cam_name} ({cam_desc})\n"
            f"Kimlik: {label}\n"
            f"Zaman: {datetime.now().strftime('%H:%M:%S')}\n\n"
            f"Taninamayan kisi. Analiz et:\n"
            f"1. Yas, cinsiyet, kiyafet\n"
            f"2. Ne yapiyor? Bolgeye uygun mu?\n"
            f"3. Tehdit: DUSUK / ORTA / YUKSEK\n"
            f"4. CEO'ya 2 satirlik oneri\n"
            f"Turkce, kisa."
        )
        result = await self._gemini_vision(prompt, img_base64, max_tokens=400)
        return result or f"Yabanci tespit: {cam_name}"

    async def answer_question(self, question, identity_manager=None, scene_interpreter=None, cameras=None, engine=None):
        context = self._build_full_context(identity_manager, scene_interpreter, cameras, engine)
        prompt = (
            f"Sen DAS Vision 200 IQ akilli guvenlik ve operasyon asistanisin.\n"
            f"{context}\n"
            f"Soru: {question}\n\n"
            "Kisa, net, Turkce cevap ver. Bilmedigini uydurma. "
            "Isletme kurallarini ve bolge bilgilerini kullanarak cevapla. "
            "Veri varsa sayi ver."
        )
        result = await self._gemini_text(prompt, max_tokens=500)
        return result or "Gemini'dan yanit alinamadi."

    def _build_full_context(self, identity_manager=None, scene_interpreter=None, cameras=None, engine=None):
        ctx = self._build_business_prompt() + "\n"
        if cameras:
            cam_names = [f"{c['name']} ({c['id']})" for c in cameras]
            ctx += f"Sistem: {len(cameras)} kamera: {', '.join(cam_names)}\n"
        if engine:
            fps = engine.get_fps()
            ctx += f"FPS: {json.dumps(fps, ensure_ascii=False)}\n"
        recent = self.event_log.get_events_since(3600)
        event_counts = defaultdict(int)
        for e in recent:
            event_counts[e["event_type"]] += 1
        ctx += f"Son 1 saat: {len(recent)} olay | {json.dumps(dict(event_counts), ensure_ascii=False)}\n"
        prod = self.memory.get_productivity_snapshot()
        if prod:
            prod_strs = [f"{cid}: %{p['score']}" for cid, p in prod.items() if p.get("score", 0) > 0]
            if prod_strs:
                ctx += f"Verimlilik: {', '.join(prod_strs)}\n"
        att = self.memory.get_attendance_summary()
        if att:
            att_strs = [f"{name}: {d['giris']}-{d['son_gorunme']}" for name, d in att.items()]
            ctx += f"Personel: {', '.join(att_strs)}\n"
        breaks = self.memory.get_active_breaks()
        if breaks:
            br_strs = [f"{name}: {d['sure_dk']}dk" for name, d in breaks.items()]
            ctx += f"Molada: {', '.join(br_strs)}\n"
        if scene_interpreter:
            active = scene_interpreter.get_all_active_scenes()
            if active:
                s_strs = [f"{s.get('description', '?')} ({s.get('duration_minutes', 0)}dk)" for s in active]
                ctx += f"Aktif sahneler: {'; '.join(s_strs)}\n"
        if identity_manager:
            identities = identity_manager.get_all_identities()
            named = [i for i in identities if i.get("is_named")]
            if named:
                names = ", ".join(f"{i['label']}(#{i['id']})" for i in named)
                ctx += f"Bilinen: {names}\n"
        return ctx


if __name__ == "__main__":
    mind = CognitiveMind()
