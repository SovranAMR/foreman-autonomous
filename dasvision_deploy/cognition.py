"""
CognitiveMind v2 — Full cognitive system with AlertManager + MemoryManager
==========================================================================
Provides:
    cognition.observe(cam_id, cam_name, result, frame, timestamp) -> list[alert_dict]
    cognition.alerts   -> AlertManager
    cognition.memory   -> MemoryManager
    cognition.event_log -> EventLog
    cognition.behavior  -> BehaviorAnalyzer
    cognition.answer_question(...)
    cognition.strategic_stranger_analysis(...)
    cognition.log_event(...)
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
from collections import defaultdict
from ssc_core.behavior import BehaviorAnalyzer


# ---------------------------------------------------------------------------
# EventLog (preserved from v1)
# ---------------------------------------------------------------------------
class EventLog:
    def __init__(self, log_dir=None):
        if log_dir is None:
            log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "events")
        self.log_dir = os.path.abspath(log_dir)
        os.makedirs(self.log_dir, exist_ok=True)
        self.events = []

    def record(self, cam_id, cam_name, event_type, details=None):
        entry = {
            "timestamp": datetime.now().isoformat(),
            "epoch": time.time(),
            "cam_id": cam_id,
            "cam_name": cam_name,
            "event_type": event_type,
            "details": details or {}
        }
        self.events.append(entry)
        return entry

    def get_daily_summary_data(self):
        today = datetime.now().strftime("%Y-%m-%d")
        return [e for e in self.events if e["timestamp"].startswith(today)]

    def flush_to_disk(self):
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
        with open(path, 'w') as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        self.events = []


# ---------------------------------------------------------------------------
# AlertManager — controls when notifications fire
# ---------------------------------------------------------------------------
class AlertManager:
    """
    Smart alerting with learning mode, work hours awareness, and flood control.
    
    First 2 hours after startup = LEARNING MODE (no alerts, just baseline).
    During learning, it silently watches and establishes what's normal.
    """

    def __init__(self, work_start="08:30", work_end="18:30", learning_hours=2):
        self._start_time = time.time()
        self._learning_duration = learning_hours * 3600
        self._work_start = work_start
        self._work_end = work_end

        # Stranger tracking: {cam_id: {identity_label: first_seen_time}}
        self._stranger_tracker = defaultdict(dict)
        self._stranger_min_duration = 180  # 3 minutes before alerting

        # Notification cooldowns: {key: last_notified_time}
        self._cooldowns = {}
        self._default_cooldown = 900  # 15 minutes
        self._alarm_cooldown = 300    # 5 minutes for critical alerts

        # Hourly budget
        self._notify_count_hour = 0
        self._notify_hour_start = time.time()
        self._max_notify_per_hour = 20

    def is_learning(self) -> bool:
        """True during the initial learning period (first N hours)."""
        return (time.time() - self._start_time) < self._learning_duration

    def is_work_hours(self) -> bool:
        """True if current time is within configured work hours."""
        now = datetime.now()
        if now.weekday() == 6:  # Sunday
            return False
        try:
            start_h, start_m = map(int, self._work_start.split(":"))
            end_h, end_m = map(int, self._work_end.split(":"))
            start = now.replace(hour=start_h, minute=start_m, second=0)
            end = now.replace(hour=end_h, minute=end_m, second=0)
            return start <= now <= end
        except Exception:
            return True

    def should_notify_stranger(self, cam_id: str, identity_label: str) -> bool:
        """
        Returns True only if this stranger has been seen for 3+ minutes.
        Prevents spam from brief passers-by.
        """
        if self.is_learning():
            return False

        now = time.time()
        tracker = self._stranger_tracker[cam_id]

        if identity_label not in tracker:
            tracker[identity_label] = now
            return False

        first_seen = tracker[identity_label]
        duration = now - first_seen

        if duration >= self._stranger_min_duration:
            # Check cooldown
            key = f"stranger_{cam_id}_{identity_label}"
            if self._check_cooldown(key, self._default_cooldown):
                return True

        return False

    def clear_stranger(self, cam_id: str, identity_label: str):
        """Clear stranger tracking when they leave."""
        tracker = self._stranger_tracker.get(cam_id, {})
        tracker.pop(identity_label, None)

    def should_notify(self, alert_type: str, cam_id: str = "", priority: int = 0) -> bool:
        """
        General notification check with cooldown and budget.
        priority: 0=low, 1=normal, 2=high, 3=critical
        """
        if self.is_learning() and priority < 3:
            return False

        # Reset hourly counter
        now = time.time()
        if now - self._notify_hour_start > 3600:
            self._notify_count_hour = 0
            self._notify_hour_start = now

        if self._notify_count_hour >= self._max_notify_per_hour and priority < 3:
            return False

        key = f"{alert_type}_{cam_id}"
        cooldown = self._alarm_cooldown if priority >= 2 else self._default_cooldown

        if self._check_cooldown(key, cooldown):
            self._notify_count_hour += 1
            return True

        return False

    def _check_cooldown(self, key: str, cooldown: float) -> bool:
        now = time.time()
        last = self._cooldowns.get(key, 0)
        if now - last >= cooldown:
            self._cooldowns[key] = now
            return True
        return False


# ---------------------------------------------------------------------------
# MemoryManager — tracks productivity, attendance, breaks
# ---------------------------------------------------------------------------
class MemoryManager:
    """
    Short-term operational memory.
    Tracks per-camera productivity, personnel attendance, and break patterns.
    """

    def __init__(self):
        self._lock = threading.Lock()

        # Productivity: {cam_id: {'score': int, 'avg_persons': float, 'samples': deque}}
        self._productivity = defaultdict(lambda: {
            'score': 0,
            'avg_persons': 0.0,
            'total_persons': 0,
            'sample_count': 0,
            'last_update': 0,
        })

        # Attendance: {person_label: {'giris': str, 'son_gorunme': str, 'first_seen': float, 'last_seen': float}}
        self._attendance = {}

        # Breaks: {person_label: {'start': float, 'cam_id': str}}
        self._breaks = {}

        # Break zones (cameras that indicate someone is on break)
        self._break_zones = {"cam_03", "cam_07"}  # Otopark, Arka Kapi

    def update_productivity(self, cam_id: str, person_count: int, actions: list = None):
        """Update productivity score for a camera zone."""
        with self._lock:
            prod = self._productivity[cam_id]
            prod['total_persons'] += person_count
            prod['sample_count'] += 1
            prod['avg_persons'] = round(prod['total_persons'] / prod['sample_count'], 1)
            prod['last_update'] = time.time()

            # Score calculation:
            # - Base: person_count > 0 = productive
            # - Bonus: active actions (working_hands, bending, walking)
            # - Penalty: phone_use, sitting idle for too long
            active_actions = 0
            idle_actions = 0
            if actions:
                for a in actions:
                    act = a.get('action', 'unknown') if isinstance(a, dict) else str(a)
                    if act in ('working_hands', 'bending', 'reaching_up', 'walking'):
                        active_actions += 1
                    elif act in ('phone_use', 'sitting'):
                        idle_actions += 1

            if person_count == 0:
                raw_score = 0
            else:
                raw_score = min(100, 30 + (person_count * 10) + (active_actions * 15) - (idle_actions * 10))

            # Exponential moving average
            alpha = 0.1
            prod['score'] = int(prod['score'] * (1 - alpha) + raw_score * alpha)

    def get_productivity_snapshot(self) -> dict:
        """Get current productivity scores for all cameras."""
        with self._lock:
            return {
                cam_id: {
                    'score': data['score'],
                    'avg_persons': data['avg_persons'],
                    'last_update': data['last_update']
                }
                for cam_id, data in self._productivity.items()
            }

    def record_attendance(self, person_label: str, cam_id: str):
        """Record a person sighting for attendance tracking."""
        with self._lock:
            now_str = datetime.now().strftime("%H:%M")
            now_ts = time.time()

            if person_label not in self._attendance:
                self._attendance[person_label] = {
                    'giris': now_str,
                    'son_gorunme': now_str,
                    'first_seen': now_ts,
                    'last_seen': now_ts,
                    'sure_saat': 0
                }
            else:
                att = self._attendance[person_label]
                att['son_gorunme'] = now_str
                att['last_seen'] = now_ts
                att['sure_saat'] = round((now_ts - att['first_seen']) / 3600, 1)

            # Break detection: if seen in break zone
            if cam_id in self._break_zones:
                if person_label not in self._breaks:
                    self._breaks[person_label] = {
                        'start': now_ts,
                        'cam_id': cam_id
                    }
            else:
                # Back from break
                self._breaks.pop(person_label, None)

    def get_attendance_summary(self) -> dict:
        """Get today's attendance summary."""
        with self._lock:
            return dict(self._attendance)

    def get_active_breaks(self) -> dict:
        """Get currently active breaks with duration."""
        with self._lock:
            now = time.time()
            result = {}
            for person, info in self._breaks.items():
                duration_min = round((now - info['start']) / 60, 1)
                result[person] = {
                    'sure_dk': duration_min,
                    'cam_id': info['cam_id']
                }
            return result

    def reset_daily(self):
        """Reset attendance data (call at midnight or shift start)."""
        with self._lock:
            self._attendance.clear()
            self._breaks.clear()


# ---------------------------------------------------------------------------
# CognitiveMind — Main class
# ---------------------------------------------------------------------------
class CognitiveMind:
    def __init__(self, local_llm="llama3.2:3b", remote_url="http://192.168.1.159:51200/v1/messages"):
        self.local_llm = local_llm
        self.ollama_url = "http://localhost:11434/api/generate"
        self.antigravity_url = remote_url
        self.remote_active = True
        self.event_log = EventLog()
        self.behavior = BehaviorAnalyzer()
        self.alerts = AlertManager()
        self.memory = MemoryManager()
        self._last_flush = time.time()

        # Gemini API
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.gemini_model = "gemini-2.0-flash"
        self.gemini_base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def observe(self, cam_id, cam_name, result, frame, timestamp):
        """
        Main observation method. Processes AI results and returns alerts.
        
        Args:
            cam_id: Camera ID
            cam_name: Camera display name
            result: Dict from engine.detect() with persons, objects, faces
            frame: Original frame (for photo alerts)
            timestamp: Frame timestamp
            
        Returns:
            list of alert dicts: [{'type': str, 'message': str, 'frame': np.array, 'priority': int}]
        """
        alerts_out = []
        persons = result.get('persons', [])
        objects = result.get('objects', {})
        faces = result.get('faces', [])
        person_count = result.get('person_count', 0)

        # --- Behavior analysis ---
        actions = []
        for person in persons:
            action_result = self.behavior.analyze_person(cam_id, person, timestamp)
            actions.append(action_result)

        # --- Update productivity ---
        self.memory.update_productivity(cam_id, person_count, actions)

        # --- Log detection event ---
        if person_count > 0 or objects:
            self.event_log.record(cam_id, cam_name, "detection", {
                "person_count": person_count,
                "objects": objects,
                "actions": [a.get('action', 'unknown') for a in actions]
            })

        # --- After-hours alert ---
        if not self.alerts.is_work_hours() and person_count > 0:
            if self.alerts.should_notify("after_hours", cam_id, priority=2):
                alerts_out.append({
                    'type': 'after_hours',
                    'message': f"⚠️ MESAI DISI HAREKET\n📹 {cam_name}\n👤 {person_count} kisi tespit edildi\n⏰ {datetime.now().strftime('%H:%M')}",
                    'frame': frame,
                    'priority': 2,
                    'cam_id': cam_id
                })

        # --- Periodic flush ---
        if time.time() - self._last_flush > 300:
            self.event_log.flush_to_disk()
            self._last_flush = time.time()

        return alerts_out

    def log_event(self, cam_id, cam_name, event_type, details=None):
        self.event_log.record(cam_id, cam_name, event_type, details)
        if time.time() - self._last_flush > 300:
            self.event_log.flush_to_disk()
            self._last_flush = time.time()

    # -----------------------------------------------------------------------
    # Gemini LLM methods (preserved from v1)
    # -----------------------------------------------------------------------
    async def _gemini_text(self, prompt, max_tokens=500):
        if not self.gemini_api_key:
            return None
        url = f"{self.gemini_base_url}/{self.gemini_model}:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.4}
        }
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result["candidates"][0]["content"]["parts"][0]["text"]
                    else:
                        print(f"SSC Gemini API error: {resp.status}")
        except Exception as e:
            print(f"SSC Gemini API exception: {e}")
        return None

    async def _gemini_vision(self, prompt, img_base64, max_tokens=400):
        if not self.gemini_api_key:
            return None
        url = f"{self.gemini_base_url}/{self.gemini_model}:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": img_base64}}
                ]
            }],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3}
        }
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result["candidates"][0]["content"]["parts"][0]["text"]
                    else:
                        print(f"SSC Gemini Vision error: {resp.status}")
        except Exception as e:
            print(f"SSC Gemini Vision exception: {e}")
        return None

    async def _ollama_generate(self, prompt, max_tokens=200):
        try:
            payload = {
                "model": self.local_llm,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens, "temperature": 0.4}
            }
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.post(self.ollama_url, json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result.get("response", "").strip()
        except Exception as e:
            print(f"SSC Ollama error: {e}")
        return None

    def _build_context(self, identity_manager=None, scene_interpreter=None, cameras=None, engine=None):
        recent = self.event_log.get_daily_summary_data()
        one_hour_ago = time.time() - 3600
        recent = [e for e in recent if e.get("epoch", 0) > one_hour_ago]

        cam_counts = {}
        action_counts = {}
        stranger_count = 0
        scene_events = []
        for e in recent:
            cam = e["cam_name"]
            cam_counts[cam] = cam_counts.get(cam, 0) + 1
            if e["event_type"] == "stranger_detected":
                stranger_count += 1
            if e["event_type"] == "action_detected":
                act = e["details"].get("action", "unknown")
                action_counts[act] = action_counts.get(act, 0) + 1
            if e["event_type"] in ("scene_started", "scene_ended", "scene_update"):
                scene_events.append(e)

        ctx = ""
        if cameras:
            cam_names = [f"{c['name']} ({c['id']})" for c in cameras]
            ctx = f"Sistem: {len(cameras)} kamera izleniyor: {', '.join(cam_names)}\n"

        if engine:
            fps = engine.get_fps()
            ctx += f"FPS (anlik): {json.dumps(fps, ensure_ascii=False)}\n"

        ctx += f"Son 1 saat: {len(recent)} olay, {stranger_count} yabanci.\n"
        ctx += f"Kamera bazli olay sayisi: {json.dumps(cam_counts, ensure_ascii=False)}\n"
        ctx += f"Aksiyonlar: {json.dumps(action_counts, ensure_ascii=False)}\n"

        if scene_events:
            recent_scenes = scene_events[-5:]
            scene_strs = []
            for se in recent_scenes:
                d = se["details"]
                scene_strs.append(f"{se['cam_name']}: {d.get('scene_type', '?')} - {d.get('description', '?')}")
            ctx += f"Son sahneler: {'; '.join(scene_strs)}\n"

        if scene_interpreter:
            active = scene_interpreter.get_all_active_scenes()
            if active:
                active_strs = [f"{s.get('description', '?')} ({s.get('duration_minutes', 0)}dk)" for s in active]
                ctx += f"Aktif sahneler: {'; '.join(active_strs)}\n"

        if identity_manager:
            identities = identity_manager.get_all_identities()
            named = [i for i in identities if i.get("is_named")]
            if named:
                names = ", ".join(f"{i['label']}(#{i['id']})" for i in named)
                ctx += f"Bilinen kisiler: {names}\n"

        # Add productivity data
        prod = self.memory.get_productivity_snapshot()
        if prod:
            ctx += f"Verimlilik: {json.dumps({k: v['score'] for k, v in prod.items()}, ensure_ascii=False)}\n"

        # Add attendance
        att = self.memory.get_attendance_summary()
        if att:
            att_str = ", ".join(f"{k}({v['giris']}-{v['son_gorunme']})" for k, v in att.items())
            ctx += f"Personel: {att_str}\n"

        return ctx

    async def answer_question(self, question, identity_manager=None, scene_interpreter=None, cameras=None, engine=None):
        context = self._build_context(identity_manager, scene_interpreter, cameras, engine)
        prompt = (
            "Sen DASVision akilli guvenlik asistanisin. CEO Ali Ilcel sana soru soruyor.\n"
            f"Sistem baglami:\n{context}\n"
            f"Soru: {question}\n\n"
            "Kisa, net, Turkce cevap ver. Bilmedigini uydurma."
        )
        result = await self._gemini_text(prompt, max_tokens=500)
        return result or "Gemini'dan yanit alinamadi."

    async def strategic_stranger_analysis(self, frame, cam_name, cam_desc, identity_label):
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')

        prompt = (
            f"KRITIK GUVENLIK ALARMI — DASVision CEO Intelligence\n"
            f"Kamera: {cam_name} ({cam_desc})\n"
            f"Kimlik: {identity_label}\n"
            f"Zaman: {datetime.now().strftime('%H:%M:%S')}\n\n"
            f"Bu kisi taninamadi. Goruntuyu analiz et:\n"
            f"1. Kisinin tahmini yasi, cinsiyeti, kiyafet detayi\n"
            f"2. Ne yapiyor? (bekliyor, yuruyuyor, etrafa bakiniyor vs)\n"
            f"3. Tehdit seviyesi: DUSUK / ORTA / YUKSEK\n"
            f"4. CEO'ya 2 satirlik oneri\n"
            f"Turkce, kisa, oz."
        )

        result = await self._gemini_vision(prompt, img_base64, max_tokens=400)
        return result or f"Yabanci tespit: {cam_name}, analiz beklemede..."

    async def generate_daily_report(self, cameras=None, engine=None, identity_manager=None, scene_interpreter=None):
        """Generate end-of-day summary report via Gemini."""
        context = self._build_context(identity_manager, scene_interpreter, cameras, engine)
        events = self.event_log.get_daily_summary_data()

        prompt = (
            "Sen DASVision akilli guvenlik asistanisin.\n"
            f"Bugunun verileri:\n{context}\n"
            f"Toplam olay: {len(events)}\n\n"
            "CEO Ali Ilcel icin gunluk rapor yaz:\n"
            "1. Genel ozet (1-2 cumle)\n"
            "2. Verimlilik degerlendirmesi\n"
            "3. Guvenlik olaylari (varsa)\n"
            "4. Oneriler\n"
            "Kisa, profesyonel, Turkce."
        )
        result = await self._gemini_text(prompt, max_tokens=600)
        return result or "Gunluk rapor olusturulamadi."


if __name__ == "__main__":
    mind = CognitiveMind()
    print("CognitiveMind v2 initialized")
    print(f"Learning mode: {mind.alerts.is_learning()}")
    print(f"Work hours: {mind.alerts.is_work_hours()}")
