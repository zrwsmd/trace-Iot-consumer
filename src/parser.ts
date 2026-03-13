import { logger } from './logger';
import type { IotEnvelope, TracePayload, TraceBatch } from './types';

// 全局消息计数器
let messageCounter = 0;
let skippedSystemMessages = 0;

/**
 * 判断是否是 IoT 平台系统消息（设备属性上报、心跳等）
 * 这类消息包含 items 字段（如 IDEInfo, IDEHeartbeat），没有 frames
 */
function isIotSystemMessage(obj: any): boolean {
  // 有 items 字段且没有 payload/frames → 设备属性上报消息
  if (obj.items && !obj.payload && !obj.frames) return true;
  // 有 checkFailedData 字段 → 设备检查消息
  if (obj.checkFailedData !== undefined && !obj.payload && !obj.frames) return true;
  return false;
}

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
  messageCounter++;
  try {
    let envelope: any;

    // 处理不同类型的消息体
    if (typeof rawMsg === 'object' && rawMsg !== null && !Buffer.isBuffer(rawMsg)) {
      const msgObj = rawMsg as any;
      if (msgObj.content !== undefined) {
        if (Buffer.isBuffer(msgObj.content)) {
          envelope = JSON.parse(msgObj.content.toString('utf8'));
        } else if (typeof msgObj.content === 'string') {
          envelope = JSON.parse(msgObj.content);
        } else {
          envelope = msgObj.content;
        }
      } else {
        envelope = msgObj;
      }
    } else if (Buffer.isBuffer(rawMsg)) {
      envelope = JSON.parse(rawMsg.toString('utf8'));
    } else if (typeof rawMsg === 'string') {
      envelope = JSON.parse(rawMsg);
    } else {
      logger.error(`[第${messageCounter}条] 未知的消息类型: ${typeof rawMsg}`);
      return null;
    }

    // 过滤IoT平台系统消息（设备属性上报、心跳等，非trace数据）
    if (isIotSystemMessage(envelope)) {
      skippedSystemMessages++;
      logger.debug(`[第${messageCounter}条] 跳过IoT系统消息(累计${skippedSystemMessages}条), 设备: ${envelope.deviceName ?? 'unknown'}`);
      return null;
    }

    // 提取 payload（可能在 envelope.payload 或直接就是 envelope）
    let data: TracePayload;
    
    if (envelope.payload) {
      if (typeof envelope.payload === 'string') {
        try {
          data = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
        } catch {
          data = JSON.parse(envelope.payload);
        }
      } else {
        data = envelope.payload as TracePayload;
      }
    } else {
      data = envelope as TracePayload;
    }

    // 验证必需字段
    if (!data.frames || !Array.isArray(data.frames)) {
      logger.error(`[第${messageCounter}条] payload缺少frames字段, 收到: ${Object.keys(data).join(', ')}, 设备: ${envelope.deviceName ?? 'unknown'}`);
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
    logger.error(`[第${messageCounter}条] 解析失败: ${(e as Error).message}`);
    return null;
  }
}
