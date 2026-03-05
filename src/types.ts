/**
 * 上位机 MQTT PUBLISH 的 payload 结构
 *
 * {
 *   "taskId": "sim_trace_001",
 *   "seq":    1,
 *   "period": 1,
 *   "frames": [
 *     {
 *       "ts":             1,
 *       "axis1_position": 0.628,
 *       "axis1_velocity": 314.159,
 *       "axis1_torque":   50.0,
 *       "motor_rpm":      1500.0,
 *       "pressure_bar":   5.0
 *     }
 *   ]
 * }
 */

/** 单个 frame：一个时间戳下所有变量的采样值 */
export interface TraceFrame {
  ts:               number;
  axis1_position?:  number;
  axis1_velocity?:  number;
  axis1_torque?:    number;
  motor_rpm?:       number;
  pressure_bar?:    number;
  [key: string]:    number | undefined;
}

/** 上位机原始 payload */
export interface TracePayload {
  taskId:  string;
  seq:     number;
  period:  number;
  frames:  TraceFrame[];
}

/** 解析后的消息包（含信封里的 deviceName） */
export interface TraceBatch {
  taskId:     string;
  seq:        number;
  period:     number;
  deviceName: string;
  frames:     TraceFrame[];
}

/** IoT 规则引擎转发的信封结构 */
export interface IotEnvelope {
  payload?:    string;
  topic?:      string;
  deviceName?: string;
  timestamp?:  number;
  [key: string]: unknown;
}
