export interface ForemanSensorData {
  sensed_at: number;
  status: 'active' | 'paused' | 'error' | null;
  metrics: {
    active_count?: number | null;
    paused_count?: number | null;
    completed_count?: number | null;
    last_completed_title?: string | null;
  };
  metadata?: {
    source_path?: string;
    work_dir?: string;
  };
}

export interface SniperSensorData {
  sensed_at: number;
  status: 'active' | 'paused' | 'error' | null;
  metrics: {
    likes?: number | null;
    replies?: number | null;
    tweets?: number | null;
    queries?: string[] | null;
    uptime_minutes?: number | null;
  };
  metadata?: {
    log_path?: string;
    last_query?: string;
  };
}

export interface CronJobInfo {
  name: string;
  healthy: boolean;
  last_run?: number | null;
  schedule?: string;
}

export interface CronSensorData {
  sensed_at: number;
  status: 'active' | 'paused' | 'error' | null;
  metrics: {
    healthy_count?: number | null;
    unhealthy_count?: number | null;
    jobs?: CronJobInfo[] | null;
  };
  metadata?: {
    config_path?: string;
  };
}