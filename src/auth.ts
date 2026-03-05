import * as crypto from 'crypto';
import { config } from './config';

export interface AmqpAuth {
  clientId: string;
  userName: string;
  password: string;
}

/**
 * 计算阿里云 IoT AMQP 连接认证信息（aksign）
 *
 * 官方示例格式：
 * userName = ${clientId}|authMode=aksign,signMethod=hmacsha1,
 *            timestamp=xxx,authId=xxx,iotInstanceId=xxx,
 *            consumerGroupId=xxx|
 * password = base64(hmac-sha1(accessKeySecret, "authId=xxx&timestamp=xxx"))
 */
export function buildAuth(): AmqpAuth {
  const timestamp = Date.now();
  const clientId  = `trace_consumer_${timestamp}`.slice(0, 64);

  // 严格按照官方 Node.js SDK 示例的顺序拼接 userName
  const iotInstanceId = config.iotInstanceId ?? '';
  const userName = `${clientId}|authMode=aksign,signMethod=hmacsha1,timestamp=${timestamp},authId=${config.accessKeyId},iotInstanceId=${iotInstanceId},consumerGroupId=${config.consumerGroupId}|`;

  // password = base64(hmac-sha1(accessKeySecret, "authId=xxx&timestamp=xxx"))
  const stringToSign = `authId=${config.accessKeyId}&timestamp=${timestamp}`;
  const password = Buffer.from(
    crypto.createHmac('sha1', config.accessKeySecret).update(stringToSign).digest()
  ).toString('base64');

  return { clientId, userName, password };
}
