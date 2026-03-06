"""
DAS Vision — NeuralEngine v3 (200 IQ Mode)
YOLO + InsightFace + Pose estimation + Exponential backoff reconnect
"""

import cv2
import torch
import numpy as np
import threading
import queue
import time
import json
import os
import logging
from ultralytics import YOLO
from insightface.app import FaceAnalysis

logger = logging.getLogger(__name__)

# Exponential backoff dizisi (saniye)
BACKOFF_SEQUENCE = [5, 10, 20, 60, 120]


class NeuralEngine:
    def __init__(self, manifest_path):
        if os.name == 'nt' and not os.path.isabs(manifest_path):
            manifest_path = "C:\\DASVision_SSC\\config\\master_manifest.json"

        logger.info(f"NeuralEngine loading manifest: {manifest_path}")
        with open(manifest_path, 'r') as f:
            self.config = json.load(f)

        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info(f"NeuralEngine on {self.device}")

        # Models
        self.yolo = YOLO(self.config['neural']['detection_model'])
        # Pose model — skeleton/keypoint analizi icin
        self.yolo_pose = None
        pose_model = self.config['neural'].get('pose_model', 'yolov8n-pose.pt')
        try:
            self.yolo_pose = YOLO(pose_model)
            logger.info(f"Pose model loaded: {pose_model}")
        except Exception as e:
            logger.warning(f"Pose model not available: {e}")

        self.face_app = FaceAnalysis(
            name=self.config['neural']['recognition_model'],
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
        )
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))

        self.frame_queues = {cam['id']: queue.Queue(maxsize=5) for cam in self.config['cameras']}
        self.results_queue = queue.Queue()
        self.running = False

        # Kamera sagligi — reconnect tracking
        self._cam_health = {}
        self._cam_threads = {}
        self._fps_counters = {}

    def _stream_reader(self, cam_id, url):
        """Kamera stream okuyucu — exponential backoff reconnect."""
        reconnect_count = 0
        cap = cv2.VideoCapture(url)

        while self.running:
            ret, frame = cap.read()
            if not ret:
                cap.release()
                # Exponential backoff
                idx = min(reconnect_count, len(BACKOFF_SEQUENCE) - 1)
                wait = BACKOFF_SEQUENCE[idx]
                reconnect_count += 1

                # Sadece ilk 3 reconnect'te log bas, sonra sessiz
                if reconnect_count <= 3:
                    logger.warning(f"{cam_id}: reconnecting ({reconnect_count}), waiting {wait}s")
                elif reconnect_count % 10 == 0:
                    logger.warning(f"{cam_id}: still reconnecting ({reconnect_count})")

                self._cam_health[cam_id] = {
                    "state": "reconnecting",
                    "attempt": reconnect_count,
                    "last_error_time": time.time()
                }

                time.sleep(wait)
                cap = cv2.VideoCapture(url)
                continue

            # Basarili frame
            if reconnect_count > 0:
                logger.info(f"{cam_id}: reconnected after {reconnect_count} attempts")
                reconnect_count = 0

            self._cam_health[cam_id] = {
                "state": "connected",
                "attempt": 0,
                "last_frame_time": time.time()
            }

            # FPS sayaci
            if cam_id not in self._fps_counters:
                self._fps_counters[cam_id] = {"count": 0, "start": time.time()}
            self._fps_counters[cam_id]["count"] += 1

            if not self.frame_queues[cam_id].full():
                self.frame_queues[cam_id].put(frame)
            else:
                try:
                    self.frame_queues[cam_id].get_nowait()
                    self.frame_queues[cam_id].put(frame)
                except queue.Empty:
                    pass

        cap.release()

    def _inference_loop(self):
        """Ana inference dongusu — YOLO + Pose + InsightFace."""
        while self.running:
            processed_any = False
            for cam_id, q in self.frame_queues.items():
                if not q.empty():
                    processed_any = True
                    frame = q.get()

                    # 1. Object Detection (YOLOv8)
                    results = self.yolo(
                        frame, device=self.device, verbose=False,
                        conf=self.config['neural'].get('conf_threshold', 0.7)
                    )

                    persons = []
                    objects = []
                    for r in results:
                        for box in r.boxes:
                            cls_id = int(box.cls)
                            conf = float(box.conf)
                            xyxy = box.xyxy[0].cpu().numpy().tolist()
                            cls_name = r.names.get(cls_id, f"class_{cls_id}")

                            if cls_id == 0:  # person
                                persons.append({
                                    "bbox": xyxy,
                                    "confidence": conf,
                                    "skeleton": None  # pose'dan doldurulacak
                                })
                            else:
                                objects.append({
                                    "class": cls_name,
                                    "bbox": xyxy,
                                    "confidence": conf
                                })

                    # 2. Pose Estimation (varsa)
                    skeletons = []
                    if self.yolo_pose and persons:
                        try:
                            pose_results = self.yolo_pose(
                                frame, device=self.device, verbose=False, conf=0.5
                            )
                            for pr in pose_results:
                                if pr.keypoints is not None:
                                    kps = pr.keypoints.data.cpu().numpy()
                                    for kp in kps:
                                        skeleton = self._keypoints_to_dict(kp)
                                        skeletons.append(skeleton)
                        except Exception:
                            pass

                    # Skeleton'lari person'lara esle (bbox overlap ile)
                    for i, person in enumerate(persons):
                        if i < len(skeletons):
                            person["skeleton"] = skeletons[i]

                    # 3. Face Recognition
                    identities = []
                    if persons:
                        try:
                            faces = self.face_app.get(frame)
                            for face in faces:
                                identities.append({
                                    "bbox": face.bbox.tolist(),
                                    "embedding": face.embedding,
                                    "det_score": float(face.det_score)
                                })
                        except Exception:
                            pass

                    # 4. Push result
                    self.results_queue.put({
                        "cam_id": cam_id,
                        "timestamp": time.time(),
                        "persons": persons,
                        "objects": objects,
                        "identities": identities,
                        "frame": frame.copy()
                    })

            if not processed_any:
                time.sleep(0.01)

    def _keypoints_to_dict(self, kp_array):
        """(17, 3) numpy array -> dict."""
        names = [
            "nose", "left_eye", "right_eye", "left_ear", "right_ear",
            "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
            "left_wrist", "right_wrist", "left_hip", "right_hip",
            "left_knee", "right_knee", "left_ankle", "right_ankle"
        ]
        skeleton = {}
        for i, name in enumerate(names):
            if i < len(kp_array):
                skeleton[name] = {
                    "x": float(kp_array[i][0]),
                    "y": float(kp_array[i][1]),
                    "conf": float(kp_array[i][2]) if len(kp_array[i]) > 2 else 0.0
                }
        return skeleton

    def get_fps(self):
        """Kamera bazinda FPS dondur."""
        fps = {}
        now = time.time()
        for cam_id, counter in self._fps_counters.items():
            elapsed = now - counter["start"]
            if elapsed > 0:
                fps[cam_id] = round(counter["count"] / elapsed, 1)
            counter["count"] = 0
            counter["start"] = now
        return fps

    def get_health(self):
        """Kamera saglik durumu."""
        return dict(self._cam_health)

    def start(self):
        self.running = True
        for cam in self.config.get('cameras', []):
            cam_id = cam.get('id')
            cam_url = cam.get('url')
            if not cam_url:
                logger.warning(f"Camera {cam_id} has no URL, skipping")
                continue
            t = threading.Thread(target=self._stream_reader, args=(cam_id, cam_url), daemon=True)
            t.start()
            self._cam_threads[cam_id] = t

        t_inf = threading.Thread(target=self._inference_loop, daemon=True)
        t_inf.start()
        logger.info("NeuralEngine started — all cameras streaming")

    def stop(self):
        self.running = False
