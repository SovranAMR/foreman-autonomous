"""
DAS Vision — vision_core.py v4
===============================
Fixed API contract between engine, cognition, identity, and scene modules.

Changes v3 -> v4:
- Engine results_queue now returns (cam_id, result_dict, frame, timestamp) tuples
- cognition.observe() takes (cam_id, cam_name, result_dict, frame, timestamp)
- Face recognition -> identity matching integrated in main loop
- Behavior analysis happens inside cognition.observe()
- All module APIs verified and tested
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
        print("SSC v4: Initializing...")
        self.base_dir = PROJECT_ROOT
        self.manifest_path = os.path.join(self.base_dir, "config", "master_manifest.json")

        # Startup Auto-Discovery
        auto_discover = os.environ.get("SSC_AUTO_DISCOVER", "1") == "1"
        if auto_discover:
            self._run_startup_discovery()

        with open(self.manifest_path, 'r') as f:
            self.config = json.load(f)

        self.config['neural']['conf_threshold'] = 0.7

        # Core modules
        self.engine = NeuralEngine(self.manifest_path)
        self.identity = IdentityManager(
            db_path=os.path.join(self.base_dir, "data", "identity.db")
        )
        self.cognition = CognitiveMind()
        self.scene = SceneInterpreter()

        # Telegram
        self.bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self.chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
        if not self.bot_token or not self.chat_id:
            print("SSC WARNING: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env")

        self.camera_alerts = {cam['id']: 0 for cam in self.config['cameras']}
        self._telegram_retry_interval = 30
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
        if time.time() - self._telegram_last_fail < self._telegram_retry_interval:
            return False
        return True

    def emergency_send_photo(self, cam_name, frame, caption=None):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            path = f"https://api.telegram.org/bot{self.bot_token}/sendPhoto"
            _, img_bytes = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            files = {'photo': ('alert.jpg', img_bytes.tobytes(), 'image/jpeg')}
            data = {'chat_id': self.chat_id, 'caption': caption or f"Alert: {cam_name}"}
            r = requests.post(path, files=files, data=data, timeout=10)
            if r.status_code != 200:
                print(f"SSC Telegram photo error: {r.status_code}")
        except requests.exceptions.ConnectionError:
            self._telegram_last_fail = time.time()
            print("SSC Telegram: DNS/connection error, will retry later")
        except Exception as e:
            print(f"SSC Telegram photo error: {e}")

    def send_telegram_message(self, text):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            r = requests.post(url, json={
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": "HTML"
            }, timeout=10)
            if r.status_code != 200:
                print(f"SSC Telegram msg error: {r.status_code}")
        except requests.exceptions.ConnectionError:
            self._telegram_last_fail = time.time()
        except Exception as e:
            print(f"SSC Telegram msg error: {e}")

    async def _send_telegram_reply(self, text):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                await session.post(url, json={
                    "chat_id": self.chat_id,
                    "text": text
                })
        except Exception as e:
            self._telegram_last_fail = time.time()
            print(f"SSC Telegram async error: {e}")

    async def _send_telegram_photo_async(self, frame, caption):
        if not self.bot_token or not self.chat_id or not self._can_send_telegram():
            return
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendPhoto"
            _, img_bytes = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

            data = aiohttp.FormData()
            data.add_field('chat_id', str(self.chat_id))
            data.add_field('caption', caption)
            data.add_field('photo', img_bytes.tobytes(), filename='snap.jpg', content_type='image/jpeg')

            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
                await session.post(url, data=data)
        except Exception as e:
            self._telegram_last_fail = time.time()
            print(f"SSC Telegram photo async error: {e}")

    def _get_camera_snapshot(self, cam_id):
        """Get a snapshot from a specific camera."""
        cam = next((c for c in self.config['cameras'] if c['id'] == cam_id), None)
        if not cam:
            return None, None

        frame = self.engine.get_latest_frame(cam_id)
        return frame, cam['name']

    async def _handle_stranger(self, frame, cam_name, cam_desc, label):
        """Analyze and alert about unknown person."""
        try:
            analysis = await self.cognition.strategic_stranger_analysis(
                frame, cam_name, cam_desc, label
            )
            msg = f"👤 YABANCI TESPIT\n📹 {cam_name}\n🕐 {datetime.now().strftime('%H:%M')}\n\n{analysis}"
            self.emergency_send_photo(cam_name, frame, msg[:1024])
        except Exception as e:
            print(f"SSC Stranger analysis error: {e}")

    async def _daily_report_scheduler(self):
        """Send daily report at 18:45."""
        while True:
            now = datetime.now()
            target = now.replace(hour=18, minute=45, second=0)
            if now > target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            await asyncio.sleep(wait_secs)

            try:
                report = await self.cognition.generate_daily_report(
                    cameras=self.config['cameras'],
                    engine=self.engine,
                    identity_manager=self.identity,
                    scene_interpreter=self.scene
                )
                await self._send_telegram_reply(f"📊 GUNLUK RAPOR\n{report}")
            except Exception as e:
                print(f"SSC Daily report error: {e}")

    async def _telegram_listener(self):
        """Listen for Telegram commands."""
        offset = 0
        print("SSC Telegram listener started")
        while True:
            try:
                url = f"https://api.telegram.org/bot{self.bot_token}/getUpdates"
                params = {"offset": offset, "timeout": 30, "allowed_updates": ["message"]}

                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=40)) as session:
                    async with session.get(url, params=params) as resp:
                        if resp.status != 200:
                            await asyncio.sleep(5)
                            continue
                        data = await resp.json()

                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue

                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    msg = update.get("message", {})
                    text = msg.get("text", "").strip()
                    sender_id = str(msg.get("chat", {}).get("id", ""))

                    if sender_id != self.chat_id or not text:
                        continue

                    print(f"SSC Telegram CMD: {text}")
                    response = await self._handle_command(text)
                    if response:
                        await self._send_telegram_reply(response)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"SSC Telegram listener error: {e}")
                await asyncio.sleep(10)

    async def _handle_command(self, text):
        """Process Telegram command or free-form question."""
        cmd = text.strip().lower().split()[0] if text.strip() else ""

        if cmd == "/durum":
            fps = self.engine.get_fps()
            prod = self.cognition.memory.get_productivity_snapshot()
            learning = "OGRENME MODU" if self.cognition.alerts.is_learning() else "AKTIF"
            work = "MESAI" if self.cognition.alerts.is_work_hours() else "MESAI DISI"
            lines = [
                f"🤖 DAS Vision v4 | {learning} | {work}",
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

        elif cmd in ("/snap", "/foto"):
            parts = text.split()
            cam_id = parts[1] if len(parts) > 1 else "cam_01"
            frame, cam_name = self._get_camera_snapshot(cam_id)
            if frame is not None:
                await self._send_telegram_photo_async(frame, f"📸 {cam_name} | {datetime.now().strftime('%H:%M:%S')}")
                return None
            return f"Kamera {cam_id} snapshot alinamadi."

        elif cmd in ("/yardim", "/help"):
            return (
                "🤖 DAS Vision v4 Komutlar:\n"
                "/durum — Sistem durumu\n"
                "/personel — Personel giris/cikis\n"
                "/verimlilik — Bolge verimlilikleri\n"
                "/sahne — Aktif sahneler\n"
                "/snap [cam_id] — Kamera snapshot\n"
                "/yardim — Bu mesaj\n\n"
                "Serbest soru da sorabilirsin."
            )

        # Free-form question -> Gemini
        if not cmd.startswith("/"):
            answer = await self.cognition.answer_question(
                text,
                identity_manager=self.identity,
                scene_interpreter=self.scene,
                cameras=self.config['cameras'],
                engine=self.engine
            )
            return answer

        return None

    async def run(self):
        """Main run loop."""
        print("SSC v4: Starting engine...")
        self.engine.start_all()
        print(f"SSC v4: Engine started with {len(self.engine.streams)} cameras")

        # Send startup notification
        startup_msg = (
            f"🤖 DAS Vision v4 Online\n"
            f"📹 {len(self.engine.streams)} kamera\n"
            f"⏰ {datetime.now().strftime('%H:%M:%S')}\n"
            f"🧠 Ogrenme modu: {int(self.cognition.alerts._learning_duration / 3600)}sa"
        )
        self.send_telegram_message(startup_msg)

        # Start background tasks
        asyncio.create_task(self._daily_report_scheduler())
        asyncio.create_task(self._telegram_listener())
        asyncio.create_task(self._periodic_flush())
        asyncio.create_task(self._status_heartbeat())

        try:
            while True:
                # Read from engine results queue (non-blocking)
                try:
                    # results_queue returns: (cam_id, result_dict, frame, timestamp)
                    cam_id, result, frame, timestamp = self.engine.results_queue.get(timeout=0.1)
                except Exception:
                    await asyncio.sleep(0.01)
                    continue

                cam_cfg = next((c for c in self.config['cameras'] if c['id'] == cam_id), None)
                if not cam_cfg:
                    continue
                cam_name = cam_cfg['name']
                cam_desc = cam_cfg.get('description', '')
                cam_protocols = cam_cfg.get('protocols', [])

                # === FACE RECOGNITION ===
                identities = []
                if 'recognition' in cam_protocols and result.get('faces'):
                    for face in result['faces']:
                        embedding = face.get('embedding')
                        if embedding is not None:
                            identity_id, label, confidence, sighting_count = self.identity.match_or_register(
                                embedding, cam_id=cam_id
                            )
                            identities.append({
                                'identity_id': identity_id,
                                'label': label,
                                'confidence': confidence,
                                'sighting_count': sighting_count,
                                'age': face.get('age'),
                                'gender': face.get('gender')
                            })
                            # Record attendance for known persons
                            if not label.startswith("Unknown_"):
                                self.cognition.memory.record_attendance(label, cam_id)

                # === COGNITIVE OBSERVATION ===
                alerts = self.cognition.observe(cam_id, cam_name, result, frame, timestamp)

                # Handle alerts
                for alert in alerts:
                    if alert.get('frame') is not None:
                        self.emergency_send_photo(
                            cam_name,
                            alert['frame'],
                            alert.get('message', 'Alert')
                        )
                    elif alert.get('message'):
                        self.send_telegram_message(alert['message'])

                # === STRANGER DETECTION ===
                if identities:
                    for ident in identities:
                        label = ident.get("label", "")
                        if label.startswith("Unknown_") and "recognition" in cam_protocols:
                            if self.cognition.alerts.should_notify_stranger(cam_id, label):
                                if frame is not None:
                                    asyncio.create_task(
                                        self._handle_stranger(frame, cam_name, cam_desc, label)
                                    )

                # === SCENE INTERPRETATION ===
                persons = result.get('persons', [])
                objects = result.get('objects', {})

                # Build actions list from behavior analysis (already done in observe)
                actions = []
                for person in persons:
                    action_result = self.cognition.behavior.analyze_person(cam_id, person, timestamp)
                    actions.append(action_result)

                # Scene interpreter expects specific format
                scene_persons = len(persons)
                scene_objects = objects  # already {name: count} dict
                scene_actions = {}
                for a in actions:
                    act = a.get('action', 'unknown')
                    scene_actions[act] = scene_actions.get(act, 0) + 1

                scene = self.scene.interpret(
                    cam_id, cam_name, cam_desc,
                    scene_persons, scene_objects, scene_actions,
                    timestamp
                )
                if scene:
                    should_notify = self.scene.should_notify(cam_id, scene)
                    if should_notify:
                        msg = self.scene.format_telegram(scene)
                        self.cognition.log_event(
                            cam_id, cam_name,
                            "scene_started" if scene.get("is_new") else "scene_update",
                            {
                                "scene_type": scene["scene_type"],
                                "description": scene["description"],
                                "confidence": scene.get("confidence", 0),
                                "duration": scene.get("duration_minutes", 0)
                            }
                        )
                        asyncio.create_task(self._send_telegram_reply(msg))

                await asyncio.sleep(0.01)

        except KeyboardInterrupt:
            self.cognition.event_log.flush_to_disk()
            self.engine.stop()
            print("SSC v4: Shutdown. Logs flushed to disk.")

    async def _periodic_flush(self):
        while True:
            await asyncio.sleep(300)
            try:
                self.cognition.event_log.flush_to_disk()
            except Exception as e:
                print(f"SSC v4 Flush error: {e}")

    async def _status_heartbeat(self):
        while True:
            await asyncio.sleep(3600)
            fps = self.engine.get_fps()
            learning = "LEARNING" if self.cognition.alerts.is_learning() else "ACTIVE"
            prod = self.cognition.memory.get_productivity_snapshot()
            scores = {k: v.get("score", 0) for k, v in prod.items()}
            print(f"SSC v4 HEARTBEAT | {learning} | FPS: {fps} | Scores: {scores}")


if __name__ == "__main__":
    core = SovereignSingularityCore()
    asyncio.run(core.run())
