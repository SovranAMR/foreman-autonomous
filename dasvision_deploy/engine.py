"""
Neural Engine v2 — Camera streaming + AI inference (YOLO + InsightFace + Pose)
==============================================================================
Combines the v1 health-monitoring camera streams with actual AI processing.

API contract (consumed by vision_core.py):
    engine = NeuralEngine(manifest_path)    # loads cameras from manifest
    engine.start_all()                      # starts all camera streams
    engine.results_queue                    # Queue of (cam_id, result_dict, frame, timestamp)
    engine.process_frame(cam_id, frame)     # manual single-frame inference
    engine.get_fps()                        # {cam_id: fps}
    engine.stop()                           # graceful shutdown
"""

import cv2
import threading
import time
import queue
import json
import os
import logging
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, Optional, Callable, Any, List
from enum import Enum
from collections import deque

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Camera health (preserved from v1)
# ---------------------------------------------------------------------------
class ConnectionState(Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    RECONNECTING = "reconnecting"
    ERROR = "error"


@dataclass
class CameraHealth:
    camera_id: str
    connection_state: ConnectionState = ConnectionState.DISCONNECTED
    fps: float = 0.0
    last_frame_time: Optional[float] = None
    reconnect_count: int = 0
    last_error: Optional[str] = None
    uptime_seconds: float = 0.0
    total_frames: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update_frame(self, timestamp: float):
        with self._lock:
            self.last_frame_time = timestamp
            self.total_frames += 1
            self.connection_state = ConnectionState.CONNECTED
            if not hasattr(self, '_frame_times'):
                self._frame_times = deque(maxlen=30)
            self._frame_times.append(timestamp)
            if len(self._frame_times) >= 2:
                span = self._frame_times[-1] - self._frame_times[0]
                if span > 0:
                    self.fps = len(self._frame_times) / span

    def mark_disconnected(self, error: Optional[str] = None):
        with self._lock:
            self.connection_state = ConnectionState.DISCONNECTED
            self.last_error = error
            self.fps = 0.0

    def mark_reconnecting(self, attempt: int):
        with self._lock:
            self.connection_state = ConnectionState.RECONNECTING
            self.reconnect_count = attempt

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'camera_id': self.camera_id,
                'connection_state': self.connection_state.value,
                'fps': round(self.fps, 1),
                'last_frame_time': self.last_frame_time,
                'reconnect_count': self.reconnect_count,
                'last_error': self.last_error,
                'total_frames': self.total_frames
            }


# ---------------------------------------------------------------------------
# CameraStream — resilient reconnection (preserved from v1)
# ---------------------------------------------------------------------------
class CameraStream:
    BACKOFF_SEQUENCE = [5, 10, 20]

    def __init__(self, camera_id: str, rtsp_url: str,
                 frame_callback: Optional[Callable] = None,
                 max_reconnect_attempts: int = 0):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.frame_callback = frame_callback
        self.max_reconnect_attempts = max_reconnect_attempts

        self.health = CameraHealth(camera_id=camera_id)
        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._reconnect_attempt = 0
        self._connected_at: Optional[float] = None
        self._latest_frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()

        logger.info(f"[{camera_id}] Stream initialized")

    def _get_backoff_delay(self) -> int:
        if self._reconnect_attempt < len(self.BACKOFF_SEQUENCE):
            return self.BACKOFF_SEQUENCE[self._reconnect_attempt]
        return 60

    def _connect(self) -> bool:
        try:
            self._cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            if self._cap and self._cap.isOpened():
                self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
                self._connected_at = time.time()
                self._reconnect_attempt = 0
                self.health.update_frame(time.time())
                logger.info(f"[{self.camera_id}] Connected")
                return True
        except Exception as e:
            logger.error(f"[{self.camera_id}] Connect error: {e}")
        self.health.mark_disconnected("Connection failed")
        return False

    def _reconnect_loop(self):
        while not self._stop_event.is_set():
            self._reconnect_attempt += 1
            delay = self._get_backoff_delay()
            self.health.mark_reconnecting(self._reconnect_attempt)
            logger.warning(f"[{self.camera_id}] Reconnect #{self._reconnect_attempt} in {delay}s")

            if self._stop_event.wait(delay):
                return

            if self.max_reconnect_attempts > 0 and self._reconnect_attempt > self.max_reconnect_attempts:
                self.health.mark_disconnected("Max reconnect attempts exceeded")
                return

            if self._connect():
                return

    def _capture_loop(self):
        if not self._connect():
            self._reconnect_loop()
            if self._stop_event.is_set() or not self._cap or not self._cap.isOpened():
                return

        fail_count = 0
        while not self._stop_event.is_set():
            try:
                ret, frame = self._cap.read()
                if ret and frame is not None:
                    fail_count = 0
                    ts = time.time()
                    self.health.update_frame(ts)
                    with self._frame_lock:
                        self._latest_frame = frame
                    if self.frame_callback:
                        self.frame_callback(self.camera_id, frame, ts)
                else:
                    fail_count += 1
                    if fail_count > 30:
                        logger.warning(f"[{self.camera_id}] Too many read failures, reconnecting...")
                        self.health.mark_disconnected("Read failures")
                        if self._cap:
                            self._cap.release()
                        self._reconnect_loop()
                        if self._stop_event.is_set():
                            return
                        fail_count = 0
            except Exception as e:
                logger.error(f"[{self.camera_id}] Capture error: {e}")
                fail_count += 30
                time.sleep(0.1)

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._capture_loop, daemon=True,
                                         name=f"cam-{self.camera_id}")
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        if self._cap:
            self._cap.release()
            self._cap = None
        self.health.mark_disconnected("Stopped")

    def get_latest_frame(self) -> Optional[np.ndarray]:
        with self._frame_lock:
            return self._latest_frame.copy() if self._latest_frame is not None else None

    def get_health(self) -> Dict:
        return self.health.get_snapshot()


# ---------------------------------------------------------------------------
# AI Processor — YOLO + InsightFace + Pose on GPU
# ---------------------------------------------------------------------------
class AIProcessor:
    """Loads AI models once and provides inference methods."""

    def __init__(self, detection_model="yolov8n.pt", recognition_model="buffalo_l",
                 device="cuda", conf_threshold=0.6, pose_model="yolov8n-pose.pt"):
        self.conf_threshold = conf_threshold
        self.device = device
        self._yolo = None
        self._pose = None
        self._face_app = None
        self._detection_model = detection_model
        self._recognition_model = recognition_model
        self._pose_model = pose_model
        self._load_lock = threading.Lock()
        self._loaded = False

    def load(self):
        """Load models (call once at startup)."""
        with self._load_lock:
            if self._loaded:
                return
            try:
                from ultralytics import YOLO
                logger.info(f"Loading YOLO detection: {self._detection_model} on {self.device}")
                self._yolo = YOLO(self._detection_model)
                dummy = np.zeros((640, 640, 3), dtype=np.uint8)
                self._yolo.predict(dummy, device=self.device, verbose=False)
                logger.info("YOLO detection loaded OK")
            except Exception as e:
                logger.error(f"YOLO load failed: {e}")
                self._yolo = None

            try:
                from ultralytics import YOLO
                logger.info(f"Loading YOLO pose: {self._pose_model} on {self.device}")
                self._pose = YOLO(self._pose_model)
                dummy = np.zeros((640, 640, 3), dtype=np.uint8)
                self._pose.predict(dummy, device=self.device, verbose=False)
                logger.info("YOLO pose loaded OK")
            except Exception as e:
                logger.warning(f"YOLO pose load failed (non-fatal): {e}")
                self._pose = None

            try:
                import insightface
                logger.info(f"Loading InsightFace: {self._recognition_model}")
                self._face_app = insightface.app.FaceAnalysis(
                    name=self._recognition_model,
                    providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
                )
                self._face_app.prepare(ctx_id=0, det_size=(640, 640))
                logger.info("InsightFace loaded OK")
            except Exception as e:
                logger.error(f"InsightFace load failed: {e}")
                self._face_app = None

            self._loaded = True

    def detect(self, frame: np.ndarray) -> Dict:
        """
        Run full inference on a single frame.
        Returns:
            {
                'persons': [{'bbox': [x1,y1,x2,y2], 'conf': float, 'skeleton': {...} or None}],
                'objects': {'car': 2, 'truck': 1, ...},
                'faces': [{'bbox': [...], 'embedding': np.array, 'age': int, 'gender': str}],
                'person_count': int,
            }
        """
        result = {
            'persons': [],
            'objects': {},
            'faces': [],
            'person_count': 0,
        }

        if frame is None:
            return result

        # --- YOLO detection ---
        if self._yolo:
            try:
                det = self._yolo.predict(frame, device=self.device, verbose=False,
                                          conf=self.conf_threshold)[0]
                for box in det.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = det.names[cls_id]
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].cpu().numpy().tolist()

                    if cls_name == 'person':
                        result['persons'].append({
                            'bbox': xyxy,
                            'conf': round(conf, 2),
                            'skeleton': None
                        })
                    else:
                        result['objects'][cls_name] = result['objects'].get(cls_name, 0) + 1

                result['person_count'] = len(result['persons'])
            except Exception as e:
                logger.error(f"YOLO detection error: {e}")

        # --- Pose estimation for detected persons ---
        if self._pose and result['persons']:
            try:
                pose_res = self._pose.predict(frame, device=self.device, verbose=False,
                                               conf=self.conf_threshold)[0]
                if pose_res.keypoints is not None:
                    kp_data = pose_res.keypoints.data.cpu().numpy()
                    kp_names = [
                        "nose", "left_eye", "right_eye", "left_ear", "right_ear",
                        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
                        "left_wrist", "right_wrist", "left_hip", "right_hip",
                        "left_knee", "right_knee", "left_ankle", "right_ankle"
                    ]
                    for pi, person in enumerate(result['persons']):
                        if pi < len(kp_data):
                            skel = {}
                            for ki, name in enumerate(kp_names):
                                skel[name] = {
                                    'x': float(kp_data[pi][ki][0]),
                                    'y': float(kp_data[pi][ki][1]),
                                    'conf': float(kp_data[pi][ki][2])
                                }
                            person['skeleton'] = skel
            except Exception as e:
                logger.warning(f"Pose estimation error: {e}")

        # --- Face recognition ---
        if self._face_app:
            try:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                faces = self._face_app.get(rgb)
                for face in faces:
                    face_info = {
                        'bbox': face.bbox.tolist(),
                        'embedding': face.normed_embedding,
                        'age': int(face.age) if hasattr(face, 'age') else None,
                        'gender': 'M' if (hasattr(face, 'gender') and face.gender == 1) else 'F' if hasattr(face, 'gender') else None,
                        'det_score': float(face.det_score) if hasattr(face, 'det_score') else None
                    }
                    result['faces'].append(face_info)
            except Exception as e:
                logger.warning(f"Face recognition error: {e}")

        return result


# ---------------------------------------------------------------------------
# NeuralEngine — Main class consumed by vision_core.py
# ---------------------------------------------------------------------------
class NeuralEngine:
    def __init__(self, manifest_path: str = None):
        self.streams: Dict[str, CameraStream] = {}
        self._lock = threading.Lock()
        self.results_queue = queue.Queue(maxsize=200)
        self._ai: Optional[AIProcessor] = None
        self._inference_threads: Dict[str, threading.Thread] = {}
        self._stop_event = threading.Event()
        self._inference_fps: Dict[str, float] = {}
        self._inference_fps_lock = threading.Lock()
        self._frame_skip = 3

        self._manifest_path = manifest_path
        self._config = None
        if manifest_path and os.path.exists(manifest_path):
            with open(manifest_path, 'r') as f:
                self._config = json.load(f)
            self._init_from_manifest()

        logger.info("NeuralEngine initialized")

    def _init_from_manifest(self):
        neural_cfg = self._config.get('neural', {})
        self._ai = AIProcessor(
            detection_model=neural_cfg.get('detection_model', 'yolov8n.pt'),
            recognition_model=neural_cfg.get('recognition_model', 'buffalo_l'),
            device=neural_cfg.get('device', 'cuda'),
            conf_threshold=neural_cfg.get('conf_threshold', 0.6)
        )
        for cam in self._config.get('cameras', []):
            if cam.get('url'):
                self.add_camera(cam['id'], cam['url'], auto_start=False)

    def add_camera(self, camera_id: str, rtsp_url: str, auto_start: bool = True) -> CameraStream:
        with self._lock:
            if camera_id in self.streams:
                self.streams[camera_id].stop()
            stream = CameraStream(camera_id=camera_id, rtsp_url=rtsp_url)
            self.streams[camera_id] = stream
            if auto_start:
                stream.start()
            return stream

    def remove_camera(self, camera_id: str):
        with self._lock:
            if camera_id in self.streams:
                self.streams[camera_id].stop()
                del self.streams[camera_id]

    def start_all(self):
        if self._ai and not self._ai._loaded:
            print("NeuralEngine: Loading AI models (YOLO + InsightFace + Pose)...")
            self._ai.load()
            print("NeuralEngine: AI models loaded")

        self._stop_event.clear()
        with self._lock:
            for cam_id, stream in self.streams.items():
                stream.start()
                t = threading.Thread(target=self._inference_loop, args=(cam_id,),
                                     daemon=True, name=f"infer-{cam_id}")
                t.start()
                self._inference_threads[cam_id] = t

    def _inference_loop(self, cam_id: str):
        frame_count = 0
        fps_times = deque(maxlen=30)

        while not self._stop_event.is_set():
            stream = self.streams.get(cam_id)
            if not stream:
                break
            frame = stream.get_latest_frame()
            if frame is None:
                time.sleep(0.5)
                continue

            frame_count += 1
            if frame_count % self._frame_skip != 0:
                time.sleep(0.03)
                continue

            ts = time.time()
            try:
                result = self._ai.detect(frame) if self._ai else {
                    'persons': [], 'objects': {}, 'faces': [], 'person_count': 0
                }
                try:
                    self.results_queue.put_nowait((cam_id, result, frame, ts))
                except queue.Full:
                    try:
                        self.results_queue.get_nowait()
                    except queue.Empty:
                        pass
                    self.results_queue.put_nowait((cam_id, result, frame, ts))

                fps_times.append(ts)
                if len(fps_times) >= 2:
                    span = fps_times[-1] - fps_times[0]
                    if span > 0:
                        with self._inference_fps_lock:
                            self._inference_fps[cam_id] = round(len(fps_times) / span, 1)
            except Exception as e:
                logger.error(f"[{cam_id}] Inference error: {e}")

            elapsed = time.time() - ts
            if elapsed < 0.1:
                time.sleep(0.1 - elapsed)

    def process_frame(self, cam_id: str, frame: np.ndarray) -> Dict:
        if self._ai:
            return self._ai.detect(frame)
        return {'persons': [], 'objects': {}, 'faces': [], 'person_count': 0}

    def get_fps(self) -> Dict[str, float]:
        with self._inference_fps_lock:
            return dict(self._inference_fps)

    def get_camera_health(self, camera_id: str = None) -> Dict:
        with self._lock:
            if camera_id:
                s = self.streams.get(camera_id)
                return s.get_health() if s else {'error': f'Camera {camera_id} not found'}
            return {cid: s.get_health() for cid, s in self.streams.items()}

    def get_summary(self) -> Dict:
        health = self.get_camera_health()
        connected = sum(1 for h in health.values() if isinstance(h, dict) and h.get('connection_state') == 'connected')
        return {
            'total_cameras': len(self.streams),
            'connected_cameras': connected,
            'inference_fps': self.get_fps(),
            'cameras': health
        }

    def get_latest_frame(self, cam_id: str) -> Optional[np.ndarray]:
        stream = self.streams.get(cam_id)
        return stream.get_latest_frame() if stream else None

    def stop(self):
        logger.info("NeuralEngine shutting down...")
        self._stop_event.set()
        with self._lock:
            for stream in self.streams.values():
                stream.stop()

    def shutdown(self):
        self.stop()

    def stop_all(self):
        self.stop()

    def register_frame_handler(self, handler: Callable):
        logger.info(f"Frame handler registered (use results_queue for processing)")
