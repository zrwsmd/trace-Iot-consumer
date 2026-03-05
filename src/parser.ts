import { logger } from './logger';
import type { IotEnvelope, TracePayload, TraceBatch } from './types';

/**
 * 解析从 AMQP 消费组收到的原始消息
 *
 * rhea 库会自动解析 AMQP 消息体，可能返回：
 * 1. 已解析的对象（最常见）
 * 2. Buffer（二进制数据）
 * 3. 字符串
 *
 * 外层：IoT 规则引擎信封（含 deviceName 等元数据）
 * 内层：上位机原始 payload（frames 格式）
 */
export function parseMessage(rawMsg: unknown): TraceBatch | null {
  try {
    let envelope: any;

    // 处理不同类型的消息体
    if (typeof rawMsg === 'object' && rawMsg !== null && !Buffer.isBuffer(rawMsg)) {
      // rhea 已经解析成对象
      const msgObj = rawMsg as any;
      
      // 检查是否是 AMQP 消息体结构（有 typecode, content, multiple 字段）
      if (msgObj.content !== undefined) {
        // AMQP 消息体，实际数据在 content 字段
        if (Buffer.isBuffer(msgObj.content)) {
          envelope = JSON.parse(msgObj.content.toString('utf8'));
        } else if (typeof msgObj.content === 'string') {
          envelope = JSON.parse(msgObj.content);
        } else {
          envelope = msgObj.content;
        }
      } else {
        // 普通对象，直接使用
        envelope = msgObj;
      }
    } else if (Buffer.isBuffer(rawMsg)) {
      // Buffer 类型，转成字符串再解析
      envelope = JSON.parse(rawMsg.toString('utf8'));
    } else if (typeof rawMsg === 'string') {
      // 字符串类型，直接解析
      envelope = JSON.parse(rawMsg);
    } else {
      logger.error(`未知的消息类型: ${typeof rawMsg}`);
      return null;
    }

    // 提取 payload（可能在 envelope.payload 或直接就是 envelope）
    let data: TracePayload;
    
    if (envelope.payload) {
      // 有 payload 字段，说明是 IoT 规则引擎的信封格式
      if (typeof envelope.payload === 'string') {
        // payload 是字符串，可能是 base64 或 JSON 字符串
        try {
          data = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
        } catch {
          data = JSON.parse(envelope.payload);
        }
      } else {
        // payload 已经是对象
        data = envelope.payload as TracePayload;
      }
    } else {
      // 没有 payload 字段，整个 envelope 就是数据
      data = envelope as TracePayload;
    }

    logger.debug(`解析后的数据字段: ${Object.keys(data).join(', ')}`);

    // 验证必需字段
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
    logger.debug(`原始消息: ${JSON.stringify(rawMsg).slice(0, 200)}...`);
    return null;
  }
}
