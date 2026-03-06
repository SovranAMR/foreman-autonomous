"""
DAS Vision — TelegramReliable v3 (200 IQ Mode)
DNS failover (IP fallback) + retry queue + bildirim butcesi
"""

import requests
import aiohttp
import asyncio
import threading
import time
import io
import cv2
import logging
from collections import deque
from datetime import datetime

logger = logging.getLogger(__name__)


class TelegramReliable:
    """DNS failover + retry queue ile guvenilir Telegram gonderimi."""

    TELEGRAM_IPS = [
        "149.154.167.220",
        "149.154.167.198",
        "149.154.167.199",
    ]

    def __init__(self, bot_token, chat_id):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self._retry_queue = deque(maxlen=50)
        self._last_fail = 0
        self._fail_count = 0
        self._use_ip_fallback = False
        self._lock = threading.Lock()
        # Bildirim butcesi
        self._notify_count_hour = 0
        self._notify_hour_start = time.time()
        self.max_notify_per_hour = 20

    @property
    def base_url(self):
        if self._use_ip_fallback:
            ip = self.TELEGRAM_IPS[self._fail_count % len(self.TELEGRAM_IPS)]
            return f"https://{ip}/bot{self.bot_token}"
        return f"https://api.telegram.org/bot{self.bot_token}"

    def _get_headers(self):
        if self._use_ip_fallback:
            return {"Host": "api.telegram.org"}
        return {}

    def _check_budget(self):
        """Saatlik bildirim butcesi kontrolu."""
        now = time.time()
        if now - self._notify_hour_start > 3600:
            self._notify_count_hour = 0
            self._notify_hour_start = now
        return self._notify_count_hour < self.max_notify_per_hour

    def _consume_budget(self):
        with self._lock:
            self._notify_count_hour += 1

    def send_message(self, text, parse_mode="HTML"):
        if not self._check_budget():
            logger.warning("Bildirim butcesi doldu, mesaj atlanıyor")
            return False
        msg = {"chat_id": self.chat_id, "text": text[:4096], "parse_mode": parse_mode}
        ok = self._send("sendMessage", msg)
        if ok:
            self._consume_budget()
        return ok

    def send_photo(self, frame, caption=""):
        if not self._check_budget():
            return False
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        photo_bytes = buf.tobytes()
        data = {"chat_id": self.chat_id, "caption": caption[:1024]}
        files = {"photo": ("event.jpg", photo_bytes, "image/jpeg")}
        ok = self._send("sendPhoto", data, files=files)
        if ok:
            self._consume_budget()
        return ok

    async def send_message_async(self, text, parse_mode="HTML"):
        if not self._check_budget():
            return False
        url = f"{self.base_url}/sendMessage"
        payload = {"chat_id": self.chat_id, "text": text[:4096], "parse_mode": parse_mode}
        ok = await self._async_send(url, payload)
        if ok:
            self._consume_budget()
        return ok

    async def send_photo_async(self, frame, caption=""):
        if not self._check_budget():
            return False
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        url = f"{self.base_url}/sendPhoto"
        data = aiohttp.FormData()
        data.add_field("chat_id", str(self.chat_id))
        data.add_field("caption", caption[:1024])
        data.add_field("photo", buf.tobytes(), filename="event.jpg", content_type="image/jpeg")
        ok = await self._async_send_form(url, data)
        if ok:
            self._consume_budget()
        return ok

    def _send(self, method, data, files=None):
        self._drain_queue()
        url = f"{self.base_url}/{method}"
        try:
            if files:
                r = requests.post(url, data=data, files=files,
                                  headers=self._get_headers(), timeout=15,
                                  verify=not self._use_ip_fallback)
            else:
                r = requests.post(url, json=data,
                                  headers=self._get_headers(), timeout=15,
                                  verify=not self._use_ip_fallback)
            if r.status_code == 200:
                self._on_success()
                return True
            logger.warning(f"Telegram {method} status={r.status_code}")
            return False
        except requests.exceptions.ConnectionError as e:
            if "Name or service not known" in str(e) or "getaddrinfo" in str(e):
                logger.warning("DNS failed, switching to IP fallback")
                self._use_ip_fallback = True
                self._fail_count += 1
                return self._send(method, data, files)
            self._on_fail(data)
            return False
        except Exception as e:
            logger.warning(f"Telegram send error: {e}")
            self._on_fail(data)
            return False

    async def _async_send(self, url, payload):
        try:
            headers = self._get_headers()
            ssl = not self._use_ip_fallback
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
                async with session.post(url, json=payload, headers=headers, ssl=ssl) as resp:
                    if resp.status == 200:
                        self._on_success()
                        return True
                    return False
        except Exception as e:
            if "getaddrinfo" in str(e).lower() or "dns" in str(e).lower():
                self._use_ip_fallback = True
                self._fail_count += 1
                url = url.replace("api.telegram.org", self.TELEGRAM_IPS[0])
                return await self._async_send(url, payload)
            return False

    async def _async_send_form(self, url, form_data):
        try:
            headers = self._get_headers()
            ssl = not self._use_ip_fallback
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.post(url, data=form_data, headers=headers, ssl=ssl) as resp:
                    return resp.status == 200
        except Exception:
            return False

    def _on_success(self):
        with self._lock:
            if self._use_ip_fallback and self._fail_count > 5:
                self._use_ip_fallback = False
                self._fail_count = 0

    def _on_fail(self, data):
        with self._lock:
            self._last_fail = time.time()
            if isinstance(data, dict) and "text" in data:
                self._retry_queue.append(data)

    def _drain_queue(self):
        with self._lock:
            while self._retry_queue:
                msg = self._retry_queue.popleft()
                try:
                    url = f"{self.base_url}/sendMessage"
                    requests.post(url, json=msg, headers=self._get_headers(),
                                  timeout=10, verify=not self._use_ip_fallback)
                except Exception:
                    self._retry_queue.appendleft(msg)
                    break
