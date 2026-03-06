"""
DAS Vision — vision_core.py v3 (200 IQ CEO Mode)
=================================================
Sessiz izleme -> Derin anlama -> Stratejik bildirim

Ozellikler:
- Ilk 2 saat sessiz ogrenme (baseline)
- Stranger 3dk kuralı — spam yok
- Severity-based bildirim (INFO/WARNING/CRITICAL/ALARM)
- Kamera bazli cooldown (15dk)
- Saatte max 20 bildirim
- Exponential backoff reconnect
- Telegram DNS failover (IP fallback)
- SQLite WAL mode (DB lock fix)
- Gemini rate limiter (10 req/min)
- Personel/verimlilik/anomali takibi
- Gunluk rapor (19:00)
- Telegram komutlari: /durum /personel /verimlilik /anomali /mola /rapor /snap /yardim
"""

import os
import sys
import time
import asyncio
import json
import logging
import cv2
from datetime import datetime
from dotenv import load_dotenv

# Proje koku
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_ROOT)

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from ssc_core.engine import NeuralEngine
from ssc_core.cognition import CognitiveMind
from ssc_core.identity import IdentityManager
from ssc_core.telegram_resilient import TelegramReliable

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(PROJECT_ROOT, "ssc_v3.log"), encoding='utf-8')
    ]
)
logger = logging.getLogger("SSC")


class SovereignSingularityCore:
    def __init__(self):
        logger.info("SSC v3: 200 IQ CEO Mode activating...")
        self.base_dir = PROJECT_ROOT
        self.manifest_path = os.path.join(self.base_dir, "config", "master_manifest.json")

        with open(self.manifest_path, 'r') as f:
            self.config = json.load(f)

        # Conf threshold — makul seviye (cok dusuk = false positive)
        self.config['neural']['conf_threshold'] = 0.7

        # Core modules
        self.engine = NeuralEngine(self.manifest_path)
        self.identity = IdentityManager(
            db_path=os.path.join(self.base_dir, "data", "identity.db")
        )
        self.cognition = CognitiveMind(manifest_path=self.manifest_path)

        # Telegram
        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
        if not bot_token or not chat_id:
            logger.error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set!")
        self.telegram = TelegramReliable(bot_token, chat_id)

        # Camera lookup
        self._cam_lookup = {cam['id']: cam for cam in self.config['cameras']}

        # Frame processing throttle — her kamera icin son islem zamani
        self._last_process = {}
        self._process_interval = 1.0  # saniye (her 1 sn'de bir frame isle)

        # Daily report flag
        self._daily_report_sent = False
        self._last_report_date = ""

        logger.info(f"SSC v3: {len(self.config['cameras'])} cameras, "
                     f"Learning mode: {self.cognition.alerts._learning_hours}h")

    async def run(self):
        """Ana calisma dongusu."""
        self.engine.start()
        logger.info("SSC v3: Engine started, entering main loop...")

        # Baslangic bildirimi
        mode = "OGRENME" if self.cognition.alerts.is_learning() else "AKTIF"
        self.telegram.send_message(
            f"🤖 DAS Vision v3 basladi!\n"
            f"Mod: {mode}\n"
            f"Kameralar: {len(self.config['cameras'])}\n"
            f"⏰ {datetime.now().strftime('%H:%M:%S')}"
        )

        # Paralel gorevler
        tasks = [
            asyncio.create_task(self._main_loop()),
            asyncio.create_task(self._telegram_listener()),
            asyncio.create_task(self._daily_report_scheduler()),
            asyncio.create_task(self._heartbeat()),
        ]

        try:
            await asyncio.gather(*tasks)
        except KeyboardInterrupt:
            logger.info("SSC v3: Shutting down...")
            self.engine.stop()
        except Exception as e:
            logger.error(f"SSC v3: Fatal error: {e}")
            self.telegram.send_message(f"🔴 SSC v3 HATA: {e}")
            self.engine.stop()

    async def _main_loop(self):
        """Ana frame isleme dongusu."""
        while True:
            try:
                if not self.engine.results_queue.empty():
                    event = self.engine.results_queue.get()
                    await self._process_event(event)
                else:
                    await asyncio.sleep(0.01)
            except Exception as e:
                logger.error(f"Main loop error: {e}")
                await asyncio.sleep(1)

    async def _process_event(self, event):
        """Tek bir frame event'ini isle."""
        cam_id = event['cam_id']
        now = event.get('timestamp', time.time())

        # Throttle — cok sik isleme
        last = self._last_process.get(cam_id, 0)
        if now - last < self._process_interval:
            return
        self._last_process[cam_id] = now

        cam_info = self._cam_lookup.get(cam_id, {"name": cam_id, "description": ""})
        cam_name = cam_info.get("name", cam_id)
        cam_desc = cam_info.get("description", "")

        persons = event.get('persons', [])
        objects = event.get('objects', [])
        raw_identities = event.get('identities', [])
        frame = event.get('frame')

        # Face matching — identity eşle
        identified = []
        for ident in raw_identities:
            embedding = ident.get('embedding')
            if embedding is not None:
                name = self.identity.match_face(embedding)
                identified.append({
                    "name": name,
                    "bbox": ident.get("bbox", []),
                    "det_score": ident.get("det_score", 0)
                })

        # Cognition analizi
        result = await self.cognition.analyze_frame(
            cam_id, cam_name, cam_desc,
            persons, objects, identified, frame, now
        )

        # Alerts gonder
        for alert in result.get("alerts", []):
            severity = alert.get("severity", "INFO")
            text = alert.get("text", "")
            alert_frame = alert.get("frame")

            if alert_frame is not None:
                self.telegram.send_photo(alert_frame, caption=text)
            else:
                self.telegram.send_message(text)

            logger.info(f"ALERT [{severity}] {text}")

    async def _telegram_listener(self):
        """Telegram komutlarini dinle (polling)."""
        import aiohttp

        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        if not bot_token:
            return

        offset = 0
        base_url = f"https://api.telegram.org/bot{bot_token}"

        while True:
            try:
                url = f"{base_url}/getUpdates?offset={offset}&timeout=30"
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=35)) as session:
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            for update in data.get("result", []):
                                offset = update["update_id"] + 1
                                msg = update.get("message", {})
                                text = msg.get("text", "")

                                if text.startswith("/"):
                                    # /snap komutu — ozel islem
                                    if text.startswith("/snap"):
                                        parts = text.split()
                                        cam_id = parts[1] if len(parts) > 1 else "cam_01"
                                        await self._send_snapshot(cam_id)
                                    else:
                                        response = await self.cognition.handle_command(text)
                                        if response:
                                            self.telegram.send_message(response)
            except Exception as e:
                logger.warning(f"Telegram listener error: {e}")
                await asyncio.sleep(10)

            await asyncio.sleep(1)

    async def _send_snapshot(self, cam_id):
        """Kameradan snapshot al ve gonder."""
        cam_info = self._cam_lookup.get(cam_id)
        if not cam_info:
            self.telegram.send_message(f"Kamera {cam_id} bulunamadi.")
            return

        try:
            cap = cv2.VideoCapture(cam_info['url'])
            ret, frame = cap.read()
            cap.release()
            if ret:
                self.telegram.send_photo(
                    frame,
                    caption=f"📸 {cam_info['name']} | {datetime.now().strftime('%H:%M:%S')}"
                )
            else:
                self.telegram.send_message(f"❌ {cam_info['name']} snapshot alinamadi.")
        except Exception as e:
            self.telegram.send_message(f"❌ Snapshot hatasi: {e}")

    async def _daily_report_scheduler(self):
        """Her gun 19:00'da gunluk rapor gonder."""
        while True:
            now = datetime.now()
            today = now.strftime("%Y-%m-%d")

            if now.hour == 19 and not self._daily_report_sent and today != self._last_report_date:
                report = self.cognition.memory.generate_daily_report()
                self.telegram.send_message(report)
                self._daily_report_sent = True
                self._last_report_date = today
                logger.info("Daily report sent")

            # Reset flag
            if now.hour != 19:
                self._daily_report_sent = False

            await asyncio.sleep(60)

    async def _heartbeat(self):
        """Her 1 saatte sessiz durum logu."""
        while True:
            await asyncio.sleep(3600)
            fps = self.engine.get_fps()
            health = self.engine.get_health()
            learning = "LEARNING" if self.cognition.alerts.is_learning() else "ACTIVE"
            prod = self.cognition.memory.get_productivity_snapshot()

            connected = sum(1 for h in health.values() if h.get("state") == "connected")
            total = len(self.config['cameras'])

            logger.info(
                f"HEARTBEAT | {learning} | Cameras: {connected}/{total} | "
                f"FPS: {fps} | Prod: {prod}"
            )


if __name__ == "__main__":
    core = SovereignSingularityCore()
    asyncio.run(core.run())
