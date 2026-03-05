import type { TraceBatch } from './types';

/**
 * 打印单个消息包的摘要信息
 * 每收到一包就调用，显示包的基本信息和前几帧预览
 */
export function printBatchSummary(batch: TraceBatch): void {
  const { taskId, seq, period, deviceName, frames } = batch;

  console.log(`
┌─────────────────────────────────────────────────────┐
│  收到 Trace 数据包
│  taskId:     ${taskId}
│  deviceName: ${deviceName}
│  seq:        ${seq}
│  period:     ${period}ms
│  frames:     ${frames.length} 帧  (ts: ${frames[0]?.ts} ~ ${frames[frames.length - 1]?.ts})
└─────────────────────────────────────────────────────┘`);

  // 打印前3帧的详细数据，看数据格式是否正确
  const preview = frames.slice(0, 3);
  console.log('  [前3帧预览]');
  printFrameTable(preview);
}

/**
 * 每累计 N 帧打印一次统计汇总
 */
export function printStats(
  totalFrames: number,
  totalBatches: number,
  latestBatch: TraceBatch
): void {
  const latest = latestBatch.frames[latestBatch.frames.length - 1];
  console.log(`
  [统计] 累计接收: ${totalBatches} 包 / ${totalFrames} 帧  最新 ts=${latest?.ts ?? '-'}`);
}

/**
 * 将 frames 格式化成对齐的表格打印
 *
 * 示例输出:
 *   ts  | axis1_position | axis1_velocity | axis1_torque | motor_rpm | pressure_bar
 *   ----+----------------+----------------+--------------+-----------+-------------
 *    1  |          0.628 |        314.159 |         50.0 |    1500.0 |         5.0
 *    2  |          1.257 |        313.900 |         51.2 |    1502.3 |         5.1
 */
export function printFrameTable(frames: TraceBatch['frames']): void {
  if (frames.length === 0) return;

  // 收集所有列名（ts 放第一列，其余按字母排序）
  const varKeys = Object.keys(frames[0])
    .filter(k => k !== 'ts')
    .sort();
  const columns = ['ts', ...varKeys];

  // 计算每列宽度
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col] = col.length;
  }
  for (const frame of frames) {
    for (const col of columns) {
      const val = String(frame[col] ?? '-');
      if (val.length > widths[col]) widths[col] = val.length;
    }
  }

  // 打印表头
  const header = columns.map(c => c.padStart(widths[c])).join(' | ');
  const divider = columns.map(c => '-'.repeat(widths[c])).join('-+-');
  console.log('  ' + header);
  console.log('  ' + divider);

  // 打印每行
  for (const frame of frames) {
    const row = columns
      .map(c => String(frame[c] ?? '-').padStart(widths[c]))
      .join(' | ');
    console.log('  ' + row);
  }
  console.log('');
}
