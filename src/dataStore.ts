import type { TraceBatch, TraceFrame } from './types';

/**
 * 高性能环形缓冲区 — 零GC内存管理
 */
class CircularBuffer<T> {
  private buffer: T[];
  private start = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  getLast(n: number): T[] {
    if (n <= 0 || this.size === 0) return [];
    const take = Math.min(n, this.size);
    const result: T[] = [];
    for (let i = 0; i < take; i++) {
      const idx = (this.start + this.capacity - take + i) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  get length(): number {
    return this.size;
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
  }
}

const MAX_FRAMES = 50_000;

interface StoredFrame {
  _batch: number;
  _device: string;
  _taskId: string;
  [key: string]: string | number | undefined;
}

const frames = new CircularBuffer<StoredFrame>(MAX_FRAMES);
let totalReceived = 0;
let batchCount   = 0;
let startTime    = Date.now();

// ============= 聚合广播机制 =============
// 核心优化：缓冲多个AMQP批次，定时合并为一次WebSocket消息
const BROADCAST_INTERVAL = 200;       // 每200ms广播一次（而不是每条消息都广播）
let pendingFrames: TraceFrame[] = [];  // 待广播的帧缓冲区
let lastDevice = 'unknown';
let broadcastTimer: NodeJS.Timeout | null = null;

type BroadcastFn = (event: string, data: unknown) => void;
let broadcastFn: BroadcastFn | null = null;

export function setBroadcast(fn: BroadcastFn): void {
  broadcastFn = fn;
  // 启动定时广播
  if (!broadcastTimer) {
    broadcastTimer = setInterval(flushBroadcast, BROADCAST_INTERVAL);
  }
}

/** 定时刷新：将缓冲的帧合并为一次WebSocket消息 */
function flushBroadcast(): void {
  if (!broadcastFn || pendingFrames.length === 0) return;

  const framesToSend = pendingFrames;
  pendingFrames = [];

  broadcastFn('batch', {
    device:   lastDevice,
    count:    framesToSend.length,
    frames:   framesToSend,
    stats:    getStats(),
  });
}

/** 新批次数据到达 */
export function pushBatch(batch: TraceBatch): void {
  batchCount++;
  totalReceived += batch.frames.length;
  lastDevice = batch.deviceName;

  for (const f of batch.frames) {
    frames.push({
      ...f,
      _batch:  batchCount,
      _device: batch.deviceName,
      _taskId: batch.taskId,
    });
  }

  // 只缓冲，不立即广播
  for (const f of batch.frames) {
    pendingFrames.push(f);
  }
}

/** 获取统计信息 */
export function getStats() {
  return {
    totalReceived,
    batchCount,
    inMemory:   frames.length,
    maxFrames:  MAX_FRAMES,
    uptimeSec:  Math.floor((Date.now() - startTime) / 1000),
  };
}

/** 获取最新 N 条数据（用于首次连接时同步） */
export function getRecentFrames(n = 500): StoredFrame[] {
  return frames.getLast(n);
}

/** 获取所有历史数据 */
export function getAllFrames(): StoredFrame[] {
  return frames.getLast(frames.length);
}

/** 获取所有列名（动态检测） */
export function getColumns(): string[] {
  const colSet = new Set<string>();
  const sample = frames.getLast(200);
  for (const f of sample) {
    for (const k of Object.keys(f)) {
      if (!k.startsWith('_')) colSet.add(k);
    }
  }
  const fixed = ['ts', 'axis1_position', 'axis1_velocity', 'axis1_torque', 'motor_rpm', 'pressure_bar'];
  const result = fixed.filter(c => colSet.has(c));
  colSet.forEach(c => { if (!fixed.includes(c)) result.push(c); });
  return result;
}
