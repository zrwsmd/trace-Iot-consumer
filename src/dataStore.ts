import type { TraceBatch, TraceFrame } from './types';

/**
 * 高性能环形缓冲区 — 零GC内存管理
 * 避免频繁slice操作造成的内存压力
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

  getAll(): T[] {
    if (this.size === 0) return [];
    
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.start + this.capacity - this.size + i) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
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

const MAX_FRAMES = 50_000;          // 最多保留5万条

interface StoredFrame {
  _batch: number;   // 来自第几批
  _device: string;  // 设备名
  _taskId: string;  // 任务ID
  [key: string]: string | number | undefined;
}

const frames = new CircularBuffer<StoredFrame>(MAX_FRAMES);
let totalReceived = 0;              // 累计收到的总帧数
let batchCount   = 0;               // 累计批次数
let startTime    = Date.now();

// WebSocket 广播回调
type BroadcastFn = (event: string, data: unknown) => void;
let broadcastFn: BroadcastFn | null = null;

export function setBroadcast(fn: BroadcastFn): void {
  broadcastFn = fn;
}

/** 新批次数据到达 */
export function pushBatch(batch: TraceBatch): void {
  batchCount++;
  totalReceived += batch.frames.length;

  const stored: StoredFrame[] = batch.frames.map(f => ({
    ...f,
    _batch:  batchCount,
    _device: batch.deviceName,
    _taskId: batch.taskId,
  }));

  for (const frame of stored) {
    frames.push(frame);
  }

  // 广播增量给前端
  if (broadcastFn) {
    broadcastFn('batch', {
      batchNo:  batchCount,
      taskId:   batch.taskId,
      device:   batch.deviceName,
      seq:      batch.seq,
      count:    batch.frames.length,
      frames:   batch.frames,          // 只发增量
      stats:    getStats(),
    });
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

/** 获取所有列名（动态检测） */
export function getColumns(): string[] {
  const colSet = new Set<string>();
  // 只扫描最近 200 条即可得到列名
  const sample = frames.getLast(200);
  for (const f of sample) {
    for (const k of Object.keys(f)) {
      if (!k.startsWith('_')) colSet.add(k);
    }
  }
  // 固定顺序
  const fixed = ['ts', 'axis1_position', 'axis1_velocity', 'axis1_torque', 'motor_rpm', 'pressure_bar'];
  const result = fixed.filter(c => colSet.has(c));
  colSet.forEach(c => { if (!fixed.includes(c)) result.push(c); });
  return result;
}
