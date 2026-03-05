import type { TraceBatch } from './types';

/**
 * 打印单个消息包的数据
 * 只显示表格，不显示其他信息
 */
export function printBatchSummary(batch: TraceBatch): void {
  printFrameTable(batch.frames);
}

/**
 * 每累计 N 帧打印一次统计汇总
 */
export function printStats(
  totalFrames: number,
  totalBatches: number,
  latestBatch: TraceBatch
): void {
  console.log(`一共接收了 ${totalFrames} 条数据\n`);
}

/**
 * 将 frames 格式化成对齐的表格打印
 * 固定列顺序: ts | axis1_position | axis1_torque | axis1_velocity | motor_rpm | pressure_bar
 */
export function printFrameTable(frames: TraceBatch['frames']): void {
  if (frames.length === 0) return;

  // 固定列顺序
  const columns = ['ts', 'axis1_position', 'axis1_torque', 'axis1_velocity', 'motor_rpm', 'pressure_bar'];

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
  console.log(header);
  console.log(divider);

  // 打印每行
  for (const frame of frames) {
    const row = columns
      .map(c => String(frame[c] ?? '-').padStart(widths[c]))
      .join(' | ');
    console.log(row);
  }
  console.log('');
}
