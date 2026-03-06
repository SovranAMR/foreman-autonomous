"""
DAS Vision — Identity Manager v3 (200 IQ Mode)
WAL mode SQLite + concurrent safe face matching
"""

import numpy as np
import sqlite3
import json
import os
import threading
import logging

logger = logging.getLogger(__name__)


class IdentityManager:
    def __init__(self, db_path=None):
        if db_path is None:
            if os.name == 'nt':
                db_path = "C:\\DASVision_SSC\\data\\identity.db"
            else:
                db_path = "data/identity.db"

        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()
        self.known_embeddings = []
        self.known_names = []
        self.load_known_faces()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        # WAL mode + busy timeout — concurrent erişim sorununu çözer
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute('''CREATE TABLE IF NOT EXISTS identities
                      (id INTEGER PRIMARY KEY, name TEXT, embedding BLOB,
                       added_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
        conn.commit()
        conn.close()

    def load_known_faces(self):
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            cursor = conn.cursor()
            cursor.execute("SELECT name, embedding FROM identities")
            rows = cursor.fetchall()
            self.known_embeddings = [np.frombuffer(r[1], dtype=np.float32) for r in rows]
            self.known_names = [r[0] for r in rows]
            conn.close()
            logger.info(f"Identity: {len(self.known_names)} known faces loaded")

    def add_identity(self, name, embedding):
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("INSERT INTO identities (name, embedding) VALUES (?, ?)",
                         (name, embedding.tobytes()))
            conn.commit()
            conn.close()
        self.load_known_faces()

    def match_face(self, face_embedding, threshold=0.6):
        if not self.known_embeddings:
            return "Stranger"

        similarities = [
            np.dot(face_embedding, known) / (np.linalg.norm(face_embedding) * np.linalg.norm(known) + 1e-8)
            for known in self.known_embeddings
        ]

        max_idx = np.argmax(similarities)
        if similarities[max_idx] > threshold:
            return self.known_names[max_idx]
        return "Stranger"

    def get_all_names(self):
        return list(set(self.known_names))
