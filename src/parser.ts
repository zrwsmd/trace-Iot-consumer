import { logger } from './logger';
import type { IotEnvelope, TracePayload, TraceBatch } from './types';

/**
 * 解析从 AMQP 消费组收到的原始消息
 *
 * 外层：IoT 规则引擎信封（含 deviceName 等元数据）
 * 内层：上位机原始 payload（frames 格式）
 */
export function parseMessage(rawMsg: unknown): TraceBatch | null {
  try {
    const str = Buffer.isBuffer(rawMsg)
      ? (rawMsg as Buffer).toString('utf8')
      : String(rawMsg);

    const envelope = JSON.parse(str) as IotEnvelope;

    let payloadStr = envelope.payload ?? envelope;
    if (typeof payloadStr !== 'string') {
      payloadStr = JSON.stringify(payloadStr);
    }

    // 规则引擎有时会做 base64 编码，尝试解码
    let data: TracePayload;
    try {
      data = JSON.parse(
        Buffer.from(payloadStr as string, 'base64').toString('utf8')
      ) as TracePayload;
    } catch {
      data = JSON.parse(payloadStr as string) as TracePayload;
    }

    if (!data.frames || !Array.isArray(data.frames)) {
      logger.error(`payload 缺少 frames 字段，收到的字段: ${Object.keys(data).join(', ')}`);
      return null;
    }

    return {
      taskId:     data.taskId  ?? 'unknown',
      seq:        data.seq     ?? 0,
      period:     data.period  ?? 1,
      deviceName: envelope.deviceName ?? 'unknown',
      frames:     data.frames,
    };
  } catch (e) {
    logger.error(`消息解析失败: ${(e as Error).message}`);
    return null;
  }
}
