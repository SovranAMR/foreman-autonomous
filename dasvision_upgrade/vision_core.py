"""
DAS Vision — vision_core.py v3 (200 IQ Mode)
=============================================
Tamamen yeniden yapilandirilmis ana motor.

Degisiklikler v2 -> v3:
- Stranger spam yok: 3+ dk kalmadan bildirim yapilmaz
- Sessiz ogrenme: Ilk 2 saat SIFIR bildirim, baseline ogrenir
- Akilli observe(): Her frame sessizce islenir, anomali yoksa sessiz
- Kamera reconnect: Exponential backoff ile stabilize
- Telegram DNS fix: Retry + fallback
- DB lock fix: WAL mode + busy timeout
- Gunluk rapor: Verimlilik + personel + anomali
- Anomali checker: Baseline'dan sapma tespiti
"""

import os
import time
import asyncio
import json
import io
import requests
import aiohttp
import cv2
from datetime import datetime, timedelta
from dotenv import load_dotenv
from ssc_core.engine import NeuralEngine
from ssc_core.cognition import CognitiveMind
from ssc_core.identity import IdentityManager
from ssc_core.discovery import CameraDiscovery
from ssc_core.scene_interpreter import SceneInterpreter

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))


class SovereignSingularityCore:
    def __init__(self):
        print("SSC v3: 200 IQ Mode activating...")
        self.base_dir = PROJECT_ROOT
        self.manifest_path = os.path.join(self.base_dir, "config", "master_manifest.json")

        # Startup Auto-Discovery
        auto_discover = os.environ.get("SSC_AUTO_DISCOVER", "1") == "1"
        if auto_discover:
            self._run_startup_discovery()

        with open(self.manifest_path, 'r') as f:
            self.config = json.load(f)

        # Yuksek hassasiyet ama makul (0.7 — cok dusuk = false positive, cok yuksek = miss)
        self.config['neural']['conf_threshold'] = 0.7
        self.engine = NeuralEngine(self.manifest_path)
        self.identity = IdentityManager(
            db_path=os.path.join(self.base_dir, "data", "identity.db")
        )
        self.cognition = CognitiveMind(manifest_path=self.manifest_path)
        self.scene = SceneInterpreter()

        self.bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self.chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
        if not self.bot_token or not self.chat_id:
            print("SSC WARNING: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env")
        self.camera_alerts = {cam['id']: 0 for cam in self.config['cameras']}

        # Stranger tracking: {cam_id: {label: first_seen_time}}
        self._stranger_tracking = {}
        # Telegram retry settings
        self._telegram_retry_interval = 30  # DNS fail sonrasi 30sn bekle
        self._telegram_last_fail = 0

    def _run_startup_discovery(self):
        print("SSC Discovery: Searching for cameras on the network...")
        try:
            disco = CameraDiscovery(self.manifest_path)
            status = disco.get_discovery_status()
            print(f"SSC Discovery: {status['total_cameras']} cameras in manifest, {status['auto_discovered']} auto-discovered")
            new_cams = disco.run_discovery(include_subnet_scan=True)
            if new_cams:
                print(f"SSC Discovery: {len(new_cams)} NEW cameras found and registered!")
                for cam in new_cams:
                    print(f"  + {cam['id']}: {cam['name']}")
            else:
                print("SSC Discovery: Network scan complete. No new cameras.")
        except Exception as e:
            print(f"SSC Discovery: Scan failed ({e}), continuing with existing manifest.")

    def _can_send_telegram(self):
        """Telegram DNS hatasi sonrasi flood onleme."""
        if time.time() - self._telegram_last_fail < self._telegram_retry_interval:
            return False
        return True

    def emergency_send_photo(self, cam_name, frame, caption=None):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            path = os.path.join(self.base_dir, "data", "last_event.jpg")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            cv2.imwrite(path, frame)
            url = f"https://api.telegram.org/bot{self.bot_token}/sendPhoto"
            cap = caption or f"SSC | Tespit: {cam_name}"
            if len(cap) > 1024:
                cap = cap[:1021] + "..."
            with open(path, "rb") as f:
                r = requests.post(url, data={"chat_id": self.chat_id, "caption": cap}, files={"photo": f}, timeout=15)
                if r.status_code == 200:
                    self._telegram_retry_interval = 30  # Reset
                print(f"SSC Telegram Photo: {r.status_code}")
        except requests.exceptions.ConnectionError:
            self._telegram_last_fail = time.time()
            self._telegram_retry_interval = min(self._telegram_retry_interval * 2, 600)
            print(f"SSC Telegram DNS fail — retry in {self._telegram_retry_interval}s")
        except Exception as e:
            print(f"SSC Telegram Photo Error: {str(e)}")

    def send_telegram_message(self, text):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            if len(text) > 4096:
                text = text[:4093] + "..."
            r = requests.post(url, data={"chat_id": self.chat_id, "text": text}, timeout=15)
            if r.status_code == 200:
                self._telegram_retry_interval = 30
            print(f"SSC Telegram: {r.status_code}")
        except requests.exceptions.ConnectionError:
            self._telegram_last_fail = time.time()
            self._telegram_retry_interval = min(self._telegram_retry_interval * 2, 600)
            print(f"SSC Telegram DNS fail — retry in {self._telegram_retry_interval}s")
        except Exception as e:
            print(f"SSC Telegram Error: {str(e)}")

    async def _send_telegram_photo_async(self, frame, caption):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            _, buffer = cv2.imencode('.jpg', frame)
            img_bytes = buffer.tobytes()
            url = f"https://api.telegram.org/bot{self.bot_token}/sendPhoto"
            if len(caption) > 1024:
                caption = caption[:1021] + "..."
            data = aiohttp.FormData()
            data.add_field('chat_id', self.chat_id)
            data.add_field('caption', caption)
            data.add_field('photo', img_bytes, filename='snapshot.jpg', content_type='image/jpeg')
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
                async with session.post(url, data=data) as resp:
                    if resp.status == 200:
                        self._telegram_retry_interval = 30
                    print(f"SSC Telegram Async Photo: {resp.status}")
        except aiohttp.ClientConnectorError:
            self._telegram_last_fail = time.time()
            self._telegram_retry_interval = min(self._telegram_retry_interval * 2, 600)
        except Exception as e:
            print(f"SSC Telegram Async Error: {e}")

    async def _send_telegram_reply(self, text):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            if len(text) > 4096:
                text = text[:4093] + "..."
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
                async with session.post(url, json={"chat_id": self.chat_id, "text": text}) as resp:
                    if resp.status == 200:
                        self._telegram_retry_interval = 30
        except aiohttp.ClientConnectorError:
            self._telegram_last_fail = time.time()
            self._telegram_retry_interval = min(self._telegram_retry_interval * 2, 600)
        except Exception as e:
            print(f"SSC Telegram Reply Error: {e}")

    def _get_camera_snapshot(self, cam_id):
        for cam in self.config['cameras']:
            if cam['id'] == cam_id:
                try:
                    cap = cv2.VideoCapture(cam['url'])
                    ret, frame = cap.read()
                    cap.release()
                    if ret:
                        return frame, cam['name']
                except Exception:
                    pass
                return None, cam['name']
        return None, "Unknown"

    async def run(self):
        self.engine.start()
        print("SSC v3: Neural Engine active. 200 IQ Mode engaged.")
        print(f"SSC v3: Learning mode — {self.cognition.alerts._learning_period}s sessiz ogrenme basladi")

        # Paralel tasklar
        asyncio.create_task(self._anomaly_checker_loop())
        asyncio.create_task(self._daily_report_scheduler())
        asyncio.create_task(self._telegram_listener())
        asyncio.create_task(self._periodic_flush())
        asyncio.create_task(self._status_heartbeat())

        try:
            while True:
                if self.engine.results_queue.empty():
                    await asyncio.sleep(0.01)
                    continue

                result = self.engine.results_queue.get()
                cam_id = result['cam_id']
                cam_name = next((c['name'] for c in self.config['cameras'] if c['id'] == cam_id), cam_id)
                cam_desc = next((c.get('description', '') for c in self.config['cameras'] if c['id'] == cam_id), '')
                frame = result.get('frame')
                persons = result.get('persons', [])
                objects = result.get('objects', [])
                actions = result.get('actions', [])
                identities = result.get('identities', [])

                # === 200 IQ OBSERVE: Sessiz gozlem + akilli bildirim ===
                alert = self.cognition.observe(
                    cam_id, cam_name, persons, objects, actions, identities
                )

                if alert and frame is not None:
                    await self._handle_smart_alert(alert, frame)

                # === STRANGER: Akilli takip (3dk+ kalirsa bildir) ===
                if identities:
                    for ident in identities:
                        label = ident.get("label", "")
                        if label.startswith("Unknown_") and "recognition" in next(
                            (c.get('protocols', []) for c in self.config['cameras'] if c['id'] == cam_id), []
                        ):
                            should_alert = self.cognition.alerts.should_alert(
                                "stranger_detected", cam_id, "normal", extra=label
                            )
                            if should_alert and frame is not None:
                                asyncio.create_task(
                                    self._handle_stranger(frame, cam_name, cam_desc, label)
                                )

                # === SAHNE YORUMU ===
                scene = self.scene.interpret(cam_id, cam_name, cam_desc, persons, objects, actions)
                if scene:
                    should_notify = self.scene.should_notify(cam_id, scene)
                    if should_notify:
                        msg = self.scene.format_telegram(scene)
                        self.cognition.log_event(cam_id, cam_name,
                            "scene_started" if scene.get("is_new") else "scene_update",
                            {"scene_type": scene["scene_type"], "description": scene["description"],
                             "confidence": scene.get("confidence", 0), "duration": scene.get("duration_minutes", 0)})
                        asyncio.create_task(self._send_telegram_reply(msg))

                # Nesne tespiti loglama
                if objects:
                    obj_summary = {}
                    for o in objects:
                        obj_summary[o["class"]] = obj_summary.get(o["class"], 0) + 1
                    self.cognition.log_event(cam_id, cam_name, "objects_detected", {
                        "objects": obj_summary, "total": len(objects)
                    })

                await asyncio.sleep(0.01)
        except KeyboardInterrupt:
            self.cognition.event_log.flush_to_disk()
            self.engine.stop()
            print("SSC v3: Shutdown. Logs flushed to disk.")

    async def _handle_smart_alert(self, alert, frame):
        """200 IQ alert handler — tip bazli akilli bildirim."""
        alert_type = alert.get("type", "unknown")
        severity = alert.get("severity", "info")
        cam_name = alert.get("cam_name", "?")

        emoji = {"critical": "🔴", "warning": "⚠️", "info": "ℹ️"}.get(severity, "📍")

        if alert_type == "after_hours_intrusion":
            ids = alert.get("identities", [])
            id_str = ", ".join(str(i) for i in ids) if ids else "Tanimsiz"
            caption = (
                f"{emoji} MESAI DISI TESPIT\n"
                f"Konum: {cam_name}\n"
                f"Kisi: {alert.get('person_count', '?')} ({id_str})\n"
                f"Saat: {datetime.now().strftime('%H:%M')}"
            )
            self.emergency_send_photo(cam_name, frame, caption)

        elif alert_type == "crowd_anomaly":
            msg = (
                f"{emoji} KALABALILIK ANOMALISI\n"
                f"Konum: {cam_name}\n"
                f"Mevcut: {alert.get('current', '?')} kisi\n"
                f"Beklenen max: {alert.get('expected', '?')}"
            )
            self.send_telegram_message(msg)

        elif alert_type == "zone_empty":
            msg = (
                f"{emoji} BOS ALAN UYARISI\n"
                f"Konum: {cam_name}\n"
                f"Normalde {alert.get('expected_avg', '?')} kisi olmali"
            )
            self.send_telegram_message(msg)

        elif alert_type == "long_break":
            msg = (
                f"{emoji} UZUN MOLA\n"
                f"Kisi: {alert.get('label', '?')}\n"
                f"Sure: {alert.get('duration', '?')} dk"
            )
            self.send_telegram_message(msg)

    async def _handle_stranger(self, frame, cam_name, cam_desc, label):
        try:
            report = await self.cognition.strategic_stranger_analysis(frame, cam_name, cam_desc, label)
            print(f"SSC v3 STRANGER [{cam_name}]: {report}")
            caption = f"YABANCI TESPIT | {cam_name}\n---\n{report}"
            self.emergency_send_photo(cam_name, frame, caption)
        except Exception as e:
            print(f"SSC v3 Stranger analysis error: {e}")

    async def _anomaly_checker_loop(self):
        """Her 15 dakikada anomali kontrol (v2'de 10dk idi)."""
        while True:
            await asyncio.sleep(900)  # 15 dk
            try:
                report = await self.cognition.check_and_report_anomalies()
                if report:
                    print(f"SSC v3 ANOMALY:\n{report}")
                    self.send_telegram_message(f"📊 ANOMALI RAPORU\n\n{report}")
            except Exception as e:
                print(f"SSC v3 Anomaly check error: {e}")

    async def _daily_report_scheduler(self):
        """Her gun saat 19:00'da gunluk rapor."""
        while True:
            now_dt = datetime.now()
            target = now_dt.replace(hour=19, minute=0, second=0, microsecond=0)
            if now_dt >= target:
                target += timedelta(days=1)
            wait_secs = (target - now_dt).total_seconds()
            print(f"SSC v3: Gunluk rapor {target.strftime('%Y-%m-%d %H:%M')} icin ({int(wait_secs)}sn)")
            await asyncio.sleep(wait_secs)
            try:
                self.cognition.event_log.flush_to_disk()
                report = await self.cognition.generate_daily_report()
                print(f"SSC v3 DAILY REPORT:\n{report}")
                self.send_telegram_message(f"📋 GUNLUK RAPOR\n{datetime.now().strftime('%Y-%m-%d')}\n\n{report}")
            except Exception as e:
                print(f"SSC v3 Daily report error: {e}")

    async def _telegram_listener(self):
        """Telegram'dan gelen komutlari dinle — retry ile."""
        offset = 0
        consecutive_fails = 0
        while True:
            if not self._can_send_telegram():
                await asyncio.sleep(self._telegram_retry_interval)
                continue
            try:
                url = f"https://api.telegram.org/bot{self.bot_token}/getUpdates"
                params = {"offset": offset, "timeout": 30}
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=35)) as session:
                    async with session.get(url, params=params) as resp:
                        if resp.status != 200:
                            await asyncio.sleep(10)
                            continue
                        data = await resp.json()
                consecutive_fails = 0

                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    msg = update.get("message", {})
                    text = msg.get("text", "").strip()
                    if not text:
                        continue

                    # Komut isleme
                    if text.startswith("/"):
                        response = await self._handle_command(text)
                    else:
                        response = await self.cognition.answer_question(
                            text,
                            identity_manager=self.identity,
                            scene_interpreter=self.scene,
                            cameras=self.config['cameras'],
                            engine=self.engine
                        )
                    if response:
                        asyncio.create_task(self._send_telegram_reply(response))

            except aiohttp.ClientConnectorError:
                self._telegram_last_fail = time.time()
                consecutive_fails += 1
                wait = min(30 * (2 ** consecutive_fails), 600)
                self._telegram_retry_interval = wait
                print(f"SSC v3 Telegram listener DNS fail — retry in {wait}s")
                await asyncio.sleep(wait)
            except Exception as e:
                if str(e):
                    print(f"SSC v3 Telegram Listener Error: {e}")
                await asyncio.sleep(5)

    async def _handle_command(self, text):
        """Telegram komutlari."""
        cmd = text.split()[0].lower()

        if cmd == "/durum":
            fps = self.engine.get_fps()
            prod = self.cognition.memory.get_productivity_snapshot()
            learning = "OGRENME MODU" if self.cognition.alerts.is_learning() else "AKTIF"
            work = "MESAI" if self.cognition.alerts.is_work_hours() else "MESAI DISI"
            lines = [
                f"🤖 DAS Vision v3 | {learning} | {work}",
                f"⏰ {datetime.now().strftime('%H:%M:%S')}",
                f"📹 FPS: {json.dumps(fps)}",
            ]
            for cam_id, p in prod.items():
                if p.get("score", 0) > 0:
                    lines.append(f"  {cam_id}: %{p['score']} verimlilik")
            breaks = self.cognition.memory.get_active_breaks()
            if breaks:
                lines.append("☕ Molada:")
                for name, info in breaks.items():
                    lines.append(f"  {name}: {info['sure_dk']}dk")
            return "\n".join(lines)

        elif cmd == "/personel":
            att = self.cognition.memory.get_attendance_summary()
            if not att:
                return "Henuz personel verisi yok."
            lines = ["👥 PERSONEL DURUMU", f"📅 {datetime.now().strftime('%Y-%m-%d')}"]
            for name, d in att.items():
                lines.append(f"  {name}: {d['giris']}→{d['son_gorunme']} ({d['sure_saat']}sa)")
            return "\n".join(lines)

        elif cmd == "/verimlilik":
            prod = self.cognition.memory.get_productivity_snapshot()
            if not prod:
                return "Henuz verimlilik verisi yok."
            lines = ["📊 VERIMLILIK"]
            for cam_id, p in prod.items():
                cam_name = next((c['name'] for c in self.config['cameras'] if c['id'] == cam_id), cam_id)
                status_emoji = "🟢" if p["score"] > 60 else "🟡" if p["score"] > 30 else "🔴"
                lines.append(f"  {status_emoji} {cam_name}: %{p['score']} ({p['avg_persons']} kisi)")
            return "\n".join(lines)

        elif cmd == "/sahne":
            summary = self.scene.get_scene_summary()
            return f"🎬 SAHNELER\n{summary}"

        elif cmd == "/snap" or cmd == "/foto":
            parts = text.split()
            cam_id = parts[1] if len(parts) > 1 else "cam_01"
            frame, cam_name = self._get_camera_snapshot(cam_id)
            if frame is not None:
                await self._send_telegram_photo_async(frame, f"📸 {cam_name} | {datetime.now().strftime('%H:%M:%S')}")
                return None
            return f"Kamera {cam_id} snapshot alinamadi."

        elif cmd == "/yardim" or cmd == "/help":
            return (
                "🤖 DAS Vision v3 Komutlar:\n"
                "/durum — Sistem durumu\n"
                "/personel — Personel giris/cikis\n"
                "/verimlilik — Bolge verimlilikleri\n"
                "/sahne — Aktif sahneler\n"
                "/snap [cam_id] — Kamera snapshot\n"
                "/yardim — Bu mesaj\n\n"
                "Serbest soru da sorabilirsin."
            )

        return None

    async def _periodic_flush(self):
        """Her 5 dakikada event log'u diske yaz."""
        while True:
            await asyncio.sleep(300)
            try:
                self.cognition.event_log.flush_to_disk()
            except Exception as e:
                print(f"SSC v3 Flush error: {e}")

    async def _status_heartbeat(self):
        """Her 1 saatte sessiz durum logu (debug icin)."""
        while True:
            await asyncio.sleep(3600)
            fps = self.engine.get_fps()
            learning = "LEARNING" if self.cognition.alerts.is_learning() else "ACTIVE"
            prod = self.cognition.memory.get_productivity_snapshot()
            scores = {k: v.get("score", 0) for k, v in prod.items()}
            print(f"SSC v3 HEARTBEAT | {learning} | FPS: {fps} | Scores: {scores}")


if __name__ == "__main__":
    core = SovereignSingularityCore()
    asyncio.run(core.run())
